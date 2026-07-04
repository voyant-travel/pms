/**
 * Channel-push reconciler — Cloudflare Workers cron entrypoint.
 *
 * Maps each cron expression configured in wrangler.jsonc to the right
 * scanner. The scanners themselves don't dispatch upstream — they
 * recreate intent rows from current state, and the existing inline
 * subscribers (or a future scheduled workflow) drain those.
 *
 * Cadences (per channel-push-architecture.md §13.2):
 *   - Every 15 min  → reconcileBookingLinks
 *   - Hourly        → reconcileAvailability
 *   - Nightly @ 03  → reconcileContent
 *
 * Per docs/architecture/channel-push-architecture.md §13.
 */

import {
  reconcileAvailability,
  reconcileBookingLinks,
  reconcileContent,
} from "@voyant-travel/distribution"

import {
  CHANNEL_PUSH_AVAILABILITY_CRON,
  CHANNEL_PUSH_BOOKING_LINK_CRON,
  CHANNEL_PUSH_CONTENT_CRON,
} from "../../scheduled-crons"
import { type BookingEngineEnv, ensureBookingEngineRegistry } from "../lib/booking-engine-runtime"
import { withDbFromEnv } from "../lib/db"

export async function runScheduledChannelPushReconciler(
  event: ScheduledController,
  env: CloudflareBindings & BookingEngineEnv,
): Promise<void> {
  // `withDbFromEnv` owns the per-tick Pool — the WebSocket closes when
  // this scheduled run finishes, instead of leaking until isolate
  // teardown.
  await withDbFromEnv(env, async (db) => {
    const deps = { db, registry: await ensureBookingEngineRegistry(env) }

    try {
      switch (event.cron) {
        case CHANNEL_PUSH_BOOKING_LINK_CRON: {
          const result = await reconcileBookingLinks({}, deps)
          console.info("[channel-push] reconcileBookingLinks", result)
          return
        }
        case CHANNEL_PUSH_AVAILABILITY_CRON: {
          const result = await reconcileAvailability({}, deps)
          console.info("[channel-push] reconcileAvailability", result)
          return
        }
        case CHANNEL_PUSH_CONTENT_CRON: {
          const result = await reconcileContent({}, deps)
          console.info("[channel-push] reconcileContent", result)
          return
        }
        default:
          console.warn("[channel-push] unknown cron expression", { cron: event.cron })
      }
    } catch (err) {
      console.error("[channel-push] reconciler failed", {
        cron: event.cron,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })
}
