/**
 * Outbound ARI push service (PLAN §4.7). `enqueueAriDelta` writes a `pending`
 * ledger row (idempotent by dedupe key); `processPendingAriEvents` drains pending
 * rows through the registered {@link ChannelConnector}s with attempt counting.
 *
 * This is the SKELETON push path: the mock connector records pushes in memory. The
 * enqueue seam is exported so ARI's bulk-upsert services could fan deltas out
 * later (a documented follow-up — the bulk-upsert rows carry no property/channel
 * binding today, so an automatic enqueue is not a clean in-place addition).
 */

import { type ListResponse, listResponse } from "@voyant-travel/types"
import { and, count, desc, eq, type SQL, sql } from "drizzle-orm"
import type { AriDelta, ChannelConnectorRegistry } from "./connector.js"
import { resolveConnector } from "./connector.js"
import type { ChannelsDb } from "./db.js"
import { buildAriDedupeKey } from "./dedupe.js"
import { nextEventState, stateForThrow } from "./retry.js"
import { type ChannelAriEventRow, channelAriEvents } from "./schema.js"
import type { AriEventListQuery } from "./validation.js"

/**
 * Enqueue a rate/availability delta for a channel. Idempotent: a re-enqueue of the
 * same (channel, roomType, ratePlan, date-range) collapses onto the existing row
 * via the unique dedupe key and resets it to `pending` (so an edit re-pushes),
 * rather than fanning out a duplicate. Returns the ledger row.
 */
export async function enqueueAriDelta(
  db: ChannelsDb,
  channel: string,
  delta: AriDelta,
): Promise<ChannelAriEventRow> {
  const dedupeKey = buildAriDedupeKey(channel, delta)
  const [row] = await db
    .insert(channelAriEvents)
    .values({
      channel,
      propertyId: delta.propertyId,
      roomTypeId: delta.roomTypeId,
      ratePlanId: delta.ratePlanId ?? null,
      payload: delta as unknown as Record<string, unknown>,
      status: "pending",
      attempts: 0,
      dedupeKey,
    })
    .onConflictDoUpdate({
      target: channelAriEvents.dedupeKey,
      set: {
        payload: sql`excluded.payload`,
        propertyId: sql`excluded.property_id`,
        roomTypeId: sql`excluded.room_type_id`,
        ratePlanId: sql`excluded.rate_plan_id`,
        status: sql`'pending'`,
        attempts: sql`0`,
        lastError: sql`null`,
        pushedAt: sql`null`,
        updatedAt: sql`now()`,
      },
    })
    .returning()
  if (!row) throw new Error("enqueueAriDelta: insert returned no row")
  return row
}

export async function listAriEvents(
  db: ChannelsDb,
  query: AriEventListQuery,
): Promise<ListResponse<ChannelAriEventRow>> {
  const clauses: SQL[] = []
  if (query.channel) clauses.push(eq(channelAriEvents.channel, query.channel))
  if (query.status) clauses.push(eq(channelAriEvents.status, query.status))
  if (query.propertyId) clauses.push(eq(channelAriEvents.propertyId, query.propertyId))
  const where = clauses.length ? and(...clauses) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(channelAriEvents)
      .where(where)
      .orderBy(desc(channelAriEvents.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(channelAriEvents).where(where),
  ])
  return listResponse(rows, { total, limit: query.limit, offset: query.offset })
}

export interface ProcessAriResult {
  scanned: number
  pushed: number
  failed: number
  skipped: number
  /** Rows left `pending` (a failed attempt below the retry cap). */
  retryable: number
}

/**
 * Drain `pending` ARI events through their channel's connector, oldest-first.
 * Each row's next `(status, attempts, lastError)` is computed by the pure
 * {@link nextEventState} policy; a row whose channel has no registered connector is
 * left pending and counted as retryable. Used by the cron + the manual admin route.
 */
export async function processPendingAriEvents(
  db: ChannelsDb,
  registry: ChannelConnectorRegistry,
  opts: { limit?: number } = {},
): Promise<ProcessAriResult> {
  const limit = opts.limit ?? 100
  const pending = await db
    .select()
    .from(channelAriEvents)
    .where(eq(channelAriEvents.status, "pending"))
    .orderBy(desc(channelAriEvents.createdAt))
    .limit(limit)

  const result: ProcessAriResult = {
    scanned: pending.length,
    pushed: 0,
    failed: 0,
    skipped: 0,
    retryable: 0,
  }

  for (const row of pending) {
    const connector = resolveConnector(registry, row.channel)
    if (!connector) {
      result.retryable += 1
      await db
        .update(channelAriEvents)
        .set({
          lastError: `no connector registered for channel "${row.channel}"`,
          updatedAt: sql`now()`,
        })
        .where(eq(channelAriEvents.id, row.id))
      continue
    }

    let state: ReturnType<typeof nextEventState>
    try {
      const pushResult = await connector.pushAri(row.payload as unknown as AriDelta)
      state = nextEventState(row.attempts, pushResult)
    } catch (err) {
      state = stateForThrow(row.attempts, err)
    }

    if (state.status === "pushed") result.pushed += 1
    else if (state.status === "skipped") result.skipped += 1
    else if (state.status === "failed") result.failed += 1
    else result.retryable += 1

    await db
      .update(channelAriEvents)
      .set({
        status: state.status,
        attempts: state.attempts,
        lastError: state.lastError,
        pushedAt: state.status === "pushed" ? sql`now()` : channelAriEvents.pushedAt,
        updatedAt: sql`now()`,
      })
      .where(eq(channelAriEvents.id, row.id))
  }

  return result
}
