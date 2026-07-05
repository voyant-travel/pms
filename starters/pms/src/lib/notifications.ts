import { createPostgresAdvisoryLockManager } from "@voyant-travel/db/runtime"
import {
  buildNotificationTaskRuntime,
  createVoyantCloudEmailProvider,
  createVoyantCloudSmsProvider,
  type NotificationPayload,
  type NotificationProvider,
  type NotificationTaskRuntimeOptions,
} from "@voyant-travel/notifications"
import { getCloudClient } from "./voyant-cloud"

export const resolveNotificationProviders = (
  env: Record<string, unknown>,
): ReadonlyArray<NotificationProvider> => {
  const mockProvider = createMockNotificationProvider(env)
  if (mockProvider) return [mockProvider]

  const cloud = getCloudClient(env)
  const from =
    typeof env.EMAIL_FROM === "string" && env.EMAIL_FROM.length > 0
      ? env.EMAIL_FROM
      : "Voyant <noreply@voyantcloud.app>"
  const replyTo = resolveEmailReplyTo(env)
  return [
    createVoyantCloudEmailProvider({ client: cloud, from, ...(replyTo ? { replyTo } : {}) }),
    createVoyantCloudSmsProvider({ client: cloud }),
  ]
}

function createMockNotificationProvider(env: Record<string, unknown>): NotificationProvider | null {
  const endpoint =
    typeof env.NOTIFICATION_MOCK_URL === "string" && env.NOTIFICATION_MOCK_URL.length > 0
      ? env.NOTIFICATION_MOCK_URL
      : null
  if (!endpoint) return null

  const defaultFromAddress =
    typeof env.EMAIL_FROM === "string" && env.EMAIL_FROM.length > 0
      ? env.EMAIL_FROM
      : "Voyant <local-notifications@example.test>"

  return {
    name: "local-mock",
    channels: ["email", "sms"],
    defaultFromAddress,
    async send(payload: NotificationPayload) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          receivedAt: new Date().toISOString(),
          payload,
        }),
      })
      if (!response.ok) {
        throw new Error(`Local notification mock rejected send: ${response.status}`)
      }
      const body = (await response.json().catch(() => null)) as { id?: unknown } | null
      return {
        id: typeof body?.id === "string" ? body.id : undefined,
        provider: "local-mock",
      }
    },
  }
}

export function resolveEmailReplyTo(env: { EMAIL_REPLY_TO?: unknown }): string[] | null {
  if (typeof env.EMAIL_REPLY_TO !== "string") return null
  const addresses = env.EMAIL_REPLY_TO.split(",")
    .map((address) => address.trim())
    .filter(Boolean)
  return addresses.length > 0 ? addresses : null
}

function resolveReminderSweepLockManager(env: Record<string, unknown>) {
  const connectionString =
    typeof env.DATABASE_URL === "string" && env.DATABASE_URL.length > 0 ? env.DATABASE_URL : null

  return connectionString
    ? createPostgresAdvisoryLockManager(connectionString, {
        namespace: "operator",
      })
    : undefined
}

export const getNotificationTaskRuntime = (
  env: Record<string, unknown>,
  options: Pick<NotificationTaskRuntimeOptions, "enqueueReminderDelivery"> = {},
) =>
  buildNotificationTaskRuntime(env, {
    resolveProviders: resolveNotificationProviders,
    reminderSweepLockManager: resolveReminderSweepLockManager(env),
    enqueueReminderDelivery: options.enqueueReminderDelivery,
  })
