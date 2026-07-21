import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server"
import { createWorkerFetch, withActiveRouteSsrManifest } from "@voyant-travel/worker-runtime"
import { operatorApiDispatch } from "./hono-api-dispatch"
import { reportBackgroundFailure } from "./lib/observability"
import {
  CHANNEL_ARI_PUSH_CRON,
  HOUSEKEEPING_GENERATE_CRON,
  NIGHT_AUDIT_CRON,
} from "./scheduled-crons"

const startHandler = createStartHandler(withActiveRouteSsrManifest(defaultStreamHandler))

const workerFetch = createWorkerFetch<CloudflareBindings, ExecutionContext>({
  api: operatorApiDispatch,
  ssr: (request, env) => startHandler(request, { context: { env } } as never),
})

export default {
  fetch: workerFetch,

  // Cloudflare Workers cron entrypoint for PMS-owned scheduled operations.
  // Reusable Voyant packages contribute their own jobs through the resolved
  // product graph; they are not duplicated in this deployment entrypoint.
  async scheduled(
    event: ScheduledController,
    env: CloudflareBindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    if (event.cron === HOUSEKEEPING_GENERATE_CRON) {
      ctx.waitUntil(
        import("./api/jobs/housekeeping-generate-scheduled")
          .then((mod) => mod.runScheduledHousekeepingGenerate(event, env))
          .then((result) => {
            console.info("[housekeeping-generate] result", result)
          })
          .catch((err) => reportBackgroundFailure("housekeeping-generate", err)),
      )
      return
    }
    if (event.cron === NIGHT_AUDIT_CRON) {
      ctx.waitUntil(
        import("./api/jobs/night-audit-scheduled")
          .then((mod) => mod.runScheduledNightAudit(event, env))
          .then((result) => {
            console.info("[night-audit] result", result)
          })
          .catch((err) => reportBackgroundFailure("night-audit", err)),
      )
      return
    }
    if (event.cron === CHANNEL_ARI_PUSH_CRON) {
      ctx.waitUntil(
        import("./api/jobs/channel-ari-push-scheduled")
          .then((mod) => mod.runScheduledChannelAriPush(event, env))
          .then((result) => {
            if (result.scanned > 0) console.info("[channel-ari-push] result", result)
          })
          .catch((err) => reportBackgroundFailure("channel-ari-push", err)),
      )
      return
    }
    console.warn("[scheduled] unknown cron expression", { cron: event.cron })
  },
}
