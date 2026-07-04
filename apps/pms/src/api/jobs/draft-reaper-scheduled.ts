/**
 * Draft reaper — Cloudflare Workers cron entrypoint that drops
 * expired `booking_drafts` rows (per booking-journey-architecture
 * §5.7).
 *
 * Lifecycle:
 *   1. List drafts past `expires_at` that haven't been consumed.
 *   2. For each draft with an active hold, ask the appropriate
 *      handler/adapter to release it (best-effort; failures get
 *      logged but don't block the delete).
 *   3. Delete the draft row.
 *
 * Cadence: hourly at :05 — chosen so it doesn't collide with the
 * channel-push hourly availability reconciler that runs at :00.
 *
 * Per booking-journey-architecture §5.7 (hold release semantics
 * default to immediate; the per-supplier grace knob is a follow-up).
 */

import {
  deleteBookingDraft,
  findExpiredDrafts,
  type OwnedBookingHandlerRegistry,
  type SourceAdapterRegistry,
} from "@voyant-travel/catalog/booking-engine"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { reportBackgroundFailure } from "../../lib/observability"
import {
  type BookingEngineEnv,
  ensureBookingEngineRegistry,
  getOwnedBookingHandlerRegistry,
} from "../lib/booking-engine-runtime"
import { withDbFromEnv } from "../lib/db"

export { DRAFT_REAPER_CRON } from "../../scheduled-crons"

export interface ReaperResult {
  scanned: number
  released: number
  releaseErrors: number
  deleted: number
  /** Drafts skipped this tick because they're still within the
   *  per-supplier hold-release grace window. */
  inGrace: number
}

export async function runScheduledDraftReaper(
  _event: ScheduledController,
  env: CloudflareBindings & BookingEngineEnv,
): Promise<ReaperResult> {
  const registry = await ensureBookingEngineRegistry(env)
  const ownedHandlers = getOwnedBookingHandlerRegistry(env)

  // `withDbFromEnv` owns the per-tick Pool — the WebSocket closes when
  // this scheduled run finishes, instead of leaking until isolate
  // teardown.
  return withDbFromEnv(env, async (db) => {
    const expired = await findExpiredDrafts(db)
    let released = 0
    let releaseErrors = 0
    let deleted = 0
    let inGrace = 0

    const now = Date.now()
    for (const draft of expired) {
      // Per-vertical grace period — defer release for graceMs past
      // the draft's expiry. Per booking-journey-architecture §12.9.
      const grace = resolveGraceMs(draft, ownedHandlers, registry)
      if (grace > 0) {
        const effectiveExpiry = new Date(draft.expires_at).getTime() + grace
        if (now < effectiveExpiry) {
          // Still inside the grace window — leave the draft alone.
          // The next reaper tick will revisit it.
          inGrace++
          continue
        }
      }

      if (draft.hold_expires_at) {
        try {
          await releaseHold({
            db,
            draft,
            ownedHandlers,
            registry,
          })
          released++
        } catch (err) {
          releaseErrors++
          console.warn("[draft-reaper] failed to release hold", {
            draftId: draft.id,
            reason: err instanceof Error ? err.message : String(err),
          })
          // Hold release is a booking invariant — a failure here can leak
          // inventory, so surface it past the console (RFC voyant#1553).
          reportBackgroundFailure("draft-reaper", err, { draftId: draft.id, op: "release-hold" })
        }
      }

      try {
        await deleteBookingDraft(db, draft.id)
        deleted++
      } catch (err) {
        console.warn("[draft-reaper] failed to delete draft", {
          draftId: draft.id,
          reason: err instanceof Error ? err.message : String(err),
        })
        reportBackgroundFailure("draft-reaper", err, { draftId: draft.id, op: "delete-draft" })
      }
    }

    return { scanned: expired.length, released, releaseErrors, deleted, inGrace }
  })
}

/**
 * Resolve the hold-release grace for a draft. Owned drafts read
 * `OwnedBookingHandler.holdReleaseGraceMs`; sourced drafts read
 * `AdapterCapabilities.holdReleaseGraceMs` off the registered
 * adapter. Defaults to 0 (immediate) when no adapter / handler is
 * found — keeps the reaper conservative.
 */
function resolveGraceMs(
  draft: Awaited<ReturnType<typeof findExpiredDrafts>>[number],
  ownedHandlers: OwnedBookingHandlerRegistry,
  registry: SourceAdapterRegistry,
): number {
  if (draft.source_kind === "owned") {
    const handler = ownedHandlers.resolve(draft.entity_module)
    return handler?.holdReleaseGraceMs ?? 0
  }
  const adapter = draft.source_connection_id
    ? registry.resolveByConnection(draft.source_connection_id)
    : undefined
  return adapter?.capabilities.holdReleaseGraceMs ?? 0
}

/**
 * Best-effort hold release. Owned drafts go through the registered
 * handler's `releaseHold`; sourced drafts go through the adapter's
 * cancel (we use cancel because the SourceAdapter contract doesn't
 * yet model a hold-only release operation — that's a Phase B+
 * follow-up on the contract).
 */
async function releaseHold({
  db,
  draft,
  ownedHandlers,
  registry,
}: {
  db: AnyDrizzleDb
  draft: Awaited<ReturnType<typeof findExpiredDrafts>>[number]
  ownedHandlers: OwnedBookingHandlerRegistry
  registry: SourceAdapterRegistry
}): Promise<void> {
  if (draft.source_kind === "owned") {
    const handler = ownedHandlers.resolve(draft.entity_module)
    if (!handler?.releaseHold) return
    // The hold token convention (per the products handler) is
    // `draft.id` — the draft is the hold receipt. When more
    // verticals ship handlers with non-trivial hold tokens, we'll
    // need to surface the token on `booking_drafts.draft_payload`
    // (or a dedicated column) and pass it through here.
    await handler.releaseHold({ db, adapterContext: { connection_id: "reaper" } }, draft.id)
    return
  }
  const adapter = draft.source_connection_id
    ? (registry.resolveByConnection(draft.source_connection_id) ?? null)
    : null
  // Sourced adapters expose cancel for committed bookings, not for
  // soft holds. Until the contract grows a hold-release primitive
  // (booking-journey §5.7), we no-op for sourced drafts.
  void adapter
}
