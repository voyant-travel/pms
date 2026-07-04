/**
 * Inbound reservation ledger service (PLAN §4.7). Records normalized channel
 * reservations idempotently (unique (channel, channelReservationId)) and, for a
 * fresh `confirmed` delivery, drives the ingest path to create a real booking.
 *
 * Idempotency contract: re-delivery of the same (channel, channelReservationId)
 * refreshes the stored payload but never re-books an already-`ingested`
 * reservation (`shouldAttemptIngest` guards on the PRE-delivery row status).
 */

import { type ListResponse, listResponse } from "@voyant-travel/types"
import { and, count, desc, eq, type SQL, sql } from "drizzle-orm"
import type { InboundReservation } from "./connector.js"
import type { ChannelsDb } from "./db.js"
import { initialLedgerStatus, shouldAttemptIngest } from "./normalize.js"
import { type ChannelReservationRow, channelReservations } from "./schema.js"
import { type IngestOutcome, ingestReservation } from "./service-ingest.js"
import type { ReservationListQuery } from "./validation.js"

export async function findReservation(
  db: ChannelsDb,
  channel: string,
  channelReservationId: string,
): Promise<ChannelReservationRow | null> {
  const [row] = await db
    .select()
    .from(channelReservations)
    .where(
      and(
        eq(channelReservations.channel, channel),
        eq(channelReservations.channelReservationId, channelReservationId),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function getReservation(
  db: ChannelsDb,
  id: string,
): Promise<ChannelReservationRow | null> {
  const [row] = await db
    .select()
    .from(channelReservations)
    .where(eq(channelReservations.id, id))
    .limit(1)
  return row ?? null
}

export async function listReservations(
  db: ChannelsDb,
  query: ReservationListQuery,
): Promise<ListResponse<ChannelReservationRow>> {
  const clauses: SQL[] = []
  if (query.channel) clauses.push(eq(channelReservations.channel, query.channel))
  if (query.status) clauses.push(eq(channelReservations.status, query.status))
  const where = clauses.length ? and(...clauses) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(channelReservations)
      .where(where)
      .orderBy(desc(channelReservations.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(channelReservations).where(where),
  ])
  return listResponse(rows, { total, limit: query.limit, offset: query.offset })
}

/** Idempotent upsert of a normalized reservation into the ledger at `status`. */
async function upsertReservation(
  db: ChannelsDb,
  incoming: InboundReservation,
  status: "received" | "ingested" | "failed" | "ignored",
): Promise<ChannelReservationRow> {
  const [row] = await db
    .insert(channelReservations)
    .values({
      channel: incoming.channel,
      channelReservationId: incoming.channelReservationId,
      status,
      payload: incoming as unknown as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: [channelReservations.channel, channelReservations.channelReservationId],
      set: {
        status: sql`excluded.status`,
        payload: sql`excluded.payload`,
        updatedAt: sql`now()`,
      },
    })
    .returning()
  if (!row) throw new Error("upsertReservation: insert returned no row")
  return row
}

export async function markReservationIngested(
  db: ChannelsDb,
  id: string,
  bookingId: string,
): Promise<ChannelReservationRow> {
  const [row] = await db
    .update(channelReservations)
    .set({ status: "ingested", bookingId, error: null, updatedAt: sql`now()` })
    .where(eq(channelReservations.id, id))
    .returning()
  if (!row) throw new Error(`markReservationIngested: no reservation ${id}`)
  return row
}

export async function markReservationFailed(
  db: ChannelsDb,
  id: string,
  error: string,
): Promise<ChannelReservationRow> {
  const [row] = await db
    .update(channelReservations)
    .set({ status: "failed", error, updatedAt: sql`now()` })
    .where(eq(channelReservations.id, id))
    .returning()
  if (!row) throw new Error(`markReservationFailed: no reservation ${id}`)
  return row
}

export interface ReceiveResult {
  row: ChannelReservationRow
  /** Present when an ingest was attempted for this delivery. */
  ingest?: IngestOutcome
}

/**
 * Record a normalized reservation and, for a fresh `confirmed` delivery, attempt
 * to ingest it as a booking. Re-delivery of an already-ingested reservation is a
 * no-op re-record (never a second booking).
 */
export async function receiveReservation(
  db: ChannelsDb,
  incoming: InboundReservation,
  opts: { userId?: string } = {},
): Promise<ReceiveResult> {
  const existing = await findReservation(db, incoming.channel, incoming.channelReservationId)
  const status = initialLedgerStatus(existing, incoming)
  const row = await upsertReservation(db, incoming, status)

  if (!shouldAttemptIngest(existing, incoming)) return { row }

  const ingest = await ingestReservation(db, incoming, opts)
  const finalRow = ingest.ok
    ? await markReservationIngested(db, row.id, ingest.bookingId)
    : await markReservationFailed(db, row.id, ingest.reason)
  return { row: finalRow, ingest }
}

/**
 * Re-run ingest for a stored reservation (admin retry). Reads the normalized
 * payload back off the ledger row and re-attempts — an already-`ingested` row is a
 * no-op that returns its existing booking.
 */
export async function retryReservationIngest(
  db: ChannelsDb,
  id: string,
  opts: { userId?: string } = {},
): Promise<ReceiveResult> {
  const row = await getReservation(db, id)
  if (!row) throw new Error(`retryReservationIngest: no reservation ${id}`)
  if (row.status === "ingested")
    return { row, ingest: { ok: true, bookingId: row.bookingId ?? "" } }

  const incoming = row.payload as unknown as InboundReservation
  const ingest = await ingestReservation(db, incoming, opts)
  const finalRow = ingest.ok
    ? await markReservationIngested(db, row.id, ingest.bookingId)
    : await markReservationFailed(db, row.id, ingest.reason)
  return { row: finalRow, ingest }
}
