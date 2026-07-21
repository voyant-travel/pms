import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server"
import {
  createVoyantWorkerJobHealthReporter,
  createVoyantWorkerJobHostFromProjectRuntime,
} from "@voyant-travel/framework/worker-job-host"
import { createWorkerFetch, withActiveRouteSsrManifest } from "@voyant-travel/worker-runtime"
import { createGeneratedProjectRuntime } from "../.voyant/runtime/project-runtime.generated"
import { app } from "./api/app"
import { createOperatorWorkerRuntimeHostPrimitives } from "./api/runtime/worker-runtime-host"
import { operatorApiDispatch } from "./hono-api-dispatch"
import { reportBackgroundFailure } from "./lib/observability"
import {
  CHANNEL_ARI_PUSH_CRON,
  HOUSEKEEPING_GENERATE_CRON,
  NIGHT_AUDIT_CRON,
} from "./scheduled-crons"

const startHandler = createStartHandler(withActiveRouteSsrManifest(defaultStreamHandler))
const projectRuntime = createGeneratedProjectRuntime()
const productJobHosts = new WeakMap<
  CloudflareBindings,
  ReturnType<typeof createVoyantWorkerJobHostFromProjectRuntime>
>()

const workerFetch = createWorkerFetch<CloudflareBindings, ExecutionContext>({
  api: operatorApiDispatch,
  ssr: (request, env) => startHandler(request, { context: { env } } as never),
})

function productJobScheduleAuthority(
  env: CloudflareBindings,
): "cloudflare-cron" | "managed-http" {
  const authority = env.VOYANT_PRODUCT_JOB_SCHEDULE_AUTHORITY
  if (authority === "cloudflare-cron" || authority === "managed-http") return authority
  throw new Error(
    "VOYANT_PRODUCT_JOB_SCHEDULE_AUTHORITY must be cloudflare-cron or managed-http.",
  )
}

function productJobs(env: CloudflareBindings) {
  const existing = productJobHosts.get(env)
  if (existing) return existing

  const primitives = createOperatorWorkerRuntimeHostPrimitives(
    env,
    async (event, bindings) => {
      await app.ready(bindings)
      if (!app.eventBus.deliver) {
        throw new Error("The operator event bus does not support durable event redelivery.")
      }
      return app.eventBus.deliver(event as Parameters<NonNullable<typeof app.eventBus.deliver>>[0])
    },
  )
  const scheduleAuthority = productJobScheduleAuthority(env)
  const host = createVoyantWorkerJobHostFromProjectRuntime(projectRuntime, {
    primitives,
    scheduleAuthority,
    originTrustSecret: env.ORIGIN_TRUST_SECRET,
    reportExecution: createVoyantWorkerJobHealthReporter(env),
  })
  productJobHosts.set(env, host)
  return host
}

export default {
  async fetch(request: Request, env: CloudflareBindings, ctx: ExecutionContext) {
    return (await productJobs(env).fetch(request, ctx)) ?? workerFetch(request, env, ctx)
  },

  // Cloudflare Workers cron entrypoint for PMS-owned scheduled operations.
  // Reusable Voyant packages contribute their own jobs through the resolved
  // product graph; they are not duplicated in this deployment entrypoint.
  async scheduled(
    event: ScheduledController,
    env: CloudflareBindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    const jobHost = productJobs(env)
    const selfHosted = productJobScheduleAuthority(env) === "cloudflare-cron"
    const productCron =
      selfHosted &&
      jobHost.schedules.some(
        (schedule) => schedule.owner === "cloudflare-cron" && schedule.cron === event.cron,
      )
    if (productCron) {
      await jobHost.scheduled(event, ctx)
    }

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
    if (productCron) return
    console.warn("[scheduled] unknown cron expression", { cron: event.cron })
  },
}
