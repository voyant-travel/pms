import { expireStaleBookingHolds } from "@voyant-travel/bookings/tasks"
import { createDbClient } from "@voyant-travel/db"
import {
  type ChannelPushDeps,
  channelAvailabilityPushWorkflow,
  channelBookingPushWorkflow,
  channelContentPushWorkflow,
  setChannelPushDeps,
} from "@voyant-travel/distribution/channel-push-workflows"
import { financeService } from "@voyant-travel/finance"
import { paymentSessions } from "@voyant-travel/finance/schema"
import {
  createDefaultProductBrochureTemplate,
  loadProductBrochureTemplateContext,
  renderProductBrochureTemplate,
} from "@voyant-travel/inventory/tasks"
import {
  deliverQueuedNotificationReminder,
  sendDueNotificationReminders,
} from "@voyant-travel/notifications/tasks"
import { workflow } from "@voyant-travel/workflows"
import { and, eq, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { closeTerminalBookingPaymentSchedules } from "./api/subscribers/booking-payment-cleanup.js"
import { createProductBrochurePrinter } from "./lib/brochure-printer.js"
import { getNotificationTaskRuntime } from "./lib/notifications.js"

const CHANNEL_PUSH_DEPS_KEY = Symbol.for("voyant.distribution.channel-push.deps")

interface ChannelPushDepsHolder {
  [CHANNEL_PUSH_DEPS_KEY]?: ChannelPushDeps
}

interface OperatorWorkflowBundleBootstrapContext {
  env?: NodeJS.ProcessEnv
  channelPushDeps?: ChannelPushDeps
}

function getDb(env: NodeJS.ProcessEnv = process.env) {
  return createDbClient(env.DATABASE_URL!, { adapter: "node" }) as PostgresJsDatabase
}

export function createLazyWorkflowDb<TDb extends object = PostgresJsDatabase>(
  factory: () => TDb = getDb as () => TDb,
): TDb {
  let db: TDb | undefined

  const resolveDb = () => {
    db ??= factory()
    return db
  }

  return new Proxy({} as TDb, {
    get(_target, prop) {
      const resolved = resolveDb()
      const value = Reflect.get(resolved as object, prop, resolved)
      return typeof value === "function" ? value.bind(resolved) : value
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Reflect.getOwnPropertyDescriptor(resolveDb() as object, prop)
    },
    has(_target, prop) {
      return prop in (resolveDb() as object)
    },
    ownKeys() {
      return Reflect.ownKeys(resolveDb() as object)
    },
  })
}

function wireChannelPushDeps(deps: ChannelPushDeps): void {
  setChannelPushDeps(deps)
  ;(globalThis as typeof globalThis & ChannelPushDepsHolder)[CHANNEL_PUSH_DEPS_KEY] = deps
}

let channelPushDepsBootstrapped = false

export async function bootstrapWorkflowBundle(
  ctx: OperatorWorkflowBundleBootstrapContext = { env: process.env },
): Promise<void> {
  if (channelPushDepsBootstrapped) return
  const env = ctx.env ?? process.env
  const { ensureBookingEngineRegistry } = await import("./api/lib/booking-engine-runtime.js")
  wireChannelPushDeps(
    ctx.channelPushDeps ?? {
      db: createLazyWorkflowDb(() => getDb(env)),
      registry: await ensureBookingEngineRegistry(env),
    },
  )
  channelPushDepsBootstrapped = true
}

void channelAvailabilityPushWorkflow
void channelBookingPushWorkflow
void channelContentPushWorkflow

workflow<{ productId: string }, { base64: string; filename: string; sizeBytes: number }>({
  id: "products.generate-pdf",
  defaultRuntime: "node",
  async run(input) {
    const db = getDb()
    const printer = createProductBrochurePrinter(process.env)
    const context = await loadProductBrochureTemplateContext(db, input.productId)
    const rendered = await renderProductBrochureTemplate(
      createDefaultProductBrochureTemplate(),
      context,
    )
    const printed = await printer({ template: rendered, context })
    return {
      base64: Buffer.from(printed.body).toString("base64"),
      filename: rendered.filename,
      sizeBytes: printed.fileSize ?? printed.body.byteLength,
    }
  },
})

workflow<
  { before?: string | null; note?: string | null },
  Awaited<ReturnType<typeof expireStaleBookingHolds>>
>({
  id: "bookings.expire-stale-holds",
  defaultRuntime: "node",
  schedule: { cron: "*/5 * * * *" },
  async run(input) {
    return expireStaleBookingHolds(getDb(), input, "system", {
      expirePaymentSessionsForBooking: async (db, bookingId) => {
        const staleSessions = await db
          .select({ id: paymentSessions.id })
          .from(paymentSessions)
          .where(
            and(
              eq(paymentSessions.bookingId, bookingId),
              inArray(paymentSessions.status, ["pending", "requires_redirect", "processing"]),
            ),
          )

        for (const session of staleSessions) {
          await financeService.expirePaymentSession(db, session.id, {
            notes: "Booking hold expired",
          })
        }
      },
      closePaymentSchedulesForBooking: closeTerminalBookingPaymentSchedules,
    })
  },
})

const deliverReminderWorkflow = workflow<
  { reminderRunId: string },
  { reminderRunId: string; status: string | null }
>({
  id: "notifications.deliver-reminder",
  defaultRuntime: "node",
  retry: {
    max: 3,
    backoff: "exponential",
    maxDelay: "300s",
  },
  async run(input) {
    return deliverQueuedNotificationReminder(
      getDb(),
      process.env,
      input,
      getNotificationTaskRuntime(process.env),
    )
  },
})

workflow<{ now?: string | null }, Awaited<ReturnType<typeof sendDueNotificationReminders>>>({
  id: "notifications.send-due-reminders",
  defaultRuntime: "node",
  schedule: { cron: "0 * * * *" },
  async run(input, ctx) {
    return sendDueNotificationReminders(
      getDb(),
      process.env,
      input,
      getNotificationTaskRuntime(process.env, {
        enqueueReminderDelivery: async (job) => {
          await ctx.invoke(deliverReminderWorkflow, job, { detach: true })
        },
      }),
    )
  },
})
