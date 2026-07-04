import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server"
import { createWorkerFetch, withActiveRouteSsrManifest } from "@voyant-travel/worker-runtime"
import { operatorApiDispatch } from "./hono-api-dispatch"
import { reportBackgroundFailure } from "./lib/observability"
import {
  CHANNEL_PUSH_AVAILABILITY_CRON,
  CHANNEL_PUSH_BOOKING_LINK_CRON,
  CHANNEL_PUSH_CONTENT_CRON,
  DRAFT_REAPER_CRON,
  EXTERNAL_CRUISE_CATALOG_REFRESH_CRON,
  OUTBOX_DRAIN_CRON,
  PROMOTION_BOUNDARY_SCHEDULER_CRON,
} from "./scheduled-crons"

const startHandler = createStartHandler(withActiveRouteSsrManifest(defaultStreamHandler))

const workerFetch = createWorkerFetch<CloudflareBindings, ExecutionContext>({
  api: operatorApiDispatch,
  ssr: (request, env) => startHandler(request, { context: { env } } as never),
})

export default {
  fetch: workerFetch,

  // Cloudflare Workers cron entrypoint. Triggers are declared in
  // wrangler.jsonc; the channel-push reconciler picks the right scanner
  // based on `event.cron`.
  async scheduled(
    event: ScheduledController,
    env: CloudflareBindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    if (event.cron === OUTBOX_DRAIN_CRON) {
      ctx.waitUntil(
        import("./api/jobs/outbox-drain-scheduled")
          .then((mod) => mod.runScheduledOutboxDrain(event, env))
          .then((result) => {
            if (result.claimed > 0 || result.deadLettered > 0) {
              console.info("[outbox-drain] result", result)
            }
          })
          .catch((err) => reportBackgroundFailure("outbox-drain", err)),
      )
      return
    }
    if (event.cron === DRAFT_REAPER_CRON) {
      ctx.waitUntil(
        import("./api/jobs/draft-reaper-scheduled")
          .then((mod) => mod.runScheduledDraftReaper(event, env))
          .then((result) => {
            console.info("[draft-reaper] result", result)
          })
          .catch((err) => reportBackgroundFailure("draft-reaper", err)),
      )
      return
    }
    if (event.cron === PROMOTION_BOUNDARY_SCHEDULER_CRON) {
      ctx.waitUntil(
        import("./api/jobs/promotion-scheduled")
          .then((mod) => mod.runScheduledPromotionBoundary(event, env))
          .then((result) => {
            console.info("[promotion-scheduler] result", result)
          })
          .catch((err) => reportBackgroundFailure("promotion-scheduler", err)),
      )
      return
    }
    if (
      event.cron === CHANNEL_PUSH_BOOKING_LINK_CRON ||
      event.cron === CHANNEL_PUSH_AVAILABILITY_CRON ||
      event.cron === CHANNEL_PUSH_CONTENT_CRON
    ) {
      ctx.waitUntil(
        import("./api/jobs/channel-push-scheduled")
          .then((mod) => mod.runScheduledChannelPushReconciler(event, env))
          .catch((err) => reportBackgroundFailure("channel-push", err)),
      )
      return
    }
    if (event.cron === EXTERNAL_CRUISE_CATALOG_REFRESH_CRON) {
      ctx.waitUntil(
        import("./api/jobs/external-cruise-refresh-scheduled")
          .then((mod) => mod.runScheduledExternalCruiseCatalogRefresh(event, env))
          .then((result) => {
            console.info("[external-cruise-refresh] result", result)
          })
          .catch((err) => reportBackgroundFailure("external-cruise-refresh", err)),
      )
      return
    }
    console.warn("[scheduled] unknown cron expression", { cron: event.cron })
  },
}
