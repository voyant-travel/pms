import {
  type DrainOutboxResult,
  drainOutbox,
  getOutboxStats,
  pruneDeliveredOutboxEvents,
} from "@voyant-travel/db/outbox"
import { expireStaleWriteIntents } from "@voyant-travel/db/write-intents"

import { withDbFromEnv } from "../lib/db"

/**
 * Scheduled event-outbox drain (RFC voyant#1687 Phase 2.1).
 *
 * The happy path delivers at emit time (request `waitUntil`); this sweep
 * redelivers what that path couldn't finish — subscriber failures
 * awaiting their backoff, and rows orphaned by isolate death mid
 * delivery. Loads the full API app to get the bus with every module /
 * plugin subscriber attached (same lazy-import pattern as the other
 * scheduled handlers).
 */
export async function runScheduledOutboxDrain(
  _event: ScheduledController,
  env: CloudflareBindings,
): Promise<DrainOutboxResult & { pendingAfter: number; deadLettered: number }> {
  const { app } = await import("../app")
  await app.ready(env)

  return withDbFromEnv(env, async (db) => {
    const result = await drainOutbox(db, app.eventBus, {
      limit: 50,
      // Comfortably above the bus's 15s per-handler timeout so a slow
      // delivery can't be double-claimed by the next tick.
      visibilityTimeoutMs: 120_000,
    })
    // Retention: delivered rows are receipts; keep two weeks for
    // debugging, then drop. Failed (dead-lettered) rows are kept until
    // resolved.
    await pruneDeliveredOutboxEvents(db, { olderThanDays: 14 })
    // Backstop for async write intents whose event dead-lettered: fail
    // them so pollers see a terminal state instead of pending-forever.
    const expiredIntents = await expireStaleWriteIntents(db, { olderThanMinutes: 30 })
    if (expiredIntents > 0) {
      console.warn(`[outbox-drain] expired ${expiredIntents} stale write intent(s)`)
    }
    const stats = await getOutboxStats(db)
    if (stats.failed > 0) {
      // Dead-lettered events need a human: surfaced in logs until the
      // observability phase gives them a proper alert.
      console.warn(`[outbox-drain] ${stats.failed} dead-lettered event(s) need attention`)
    }
    return { ...result, pendingAfter: stats.pending, deadLettered: stats.failed }
  })
}
