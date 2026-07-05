/**
 * Lazy accessor for the Voyant Cloud SDK client. Other modules (the
 * legal contract PDF generator, future SMS / verification flows)
 * should call `getCloudClient(env)` rather than instantiating their
 * own — the SDK caches state internally and we want a single
 * shared client per isolate.
 *
 * `tryGetCloudClient(env)` returns `null` when `VOYANT_API_KEY`
 * is unset — useful for local dev where the cloud-backed feature
 * (e.g. browser-rendered PDFs) gracefully degrades to the basic
 * pdf-lib fallback rather than crashing the whole worker.
 */

import {
  getVoyantCloudClient,
  tryGetVoyantCloudClient,
  type VoyantCloudClient,
} from "@voyant-travel/cloud-sdk"

const CLIENT_CACHE = new WeakMap<object, VoyantCloudClient>()
type CloudClientEnv = Parameters<typeof getVoyantCloudClient>[0]
type TryCloudClientEnv = Parameters<typeof tryGetVoyantCloudClient>[0]

export type VoyantApiEnv = {
  VOYANT_API_KEY?: string
  VOYANT_CLOUD_API_KEY?: string
  VOYANT_CLOUD_API_URL?: string
  VOYANT_CLOUD_USER_AGENT?: string
}

export function resolveVoyantApiKey(env: VoyantApiEnv): string | undefined {
  return nonEmpty(env.VOYANT_API_KEY) ?? nonEmpty(env.VOYANT_CLOUD_API_KEY)
}

export function getCloudClient(env: VoyantApiEnv): VoyantCloudClient {
  const cached = CLIENT_CACHE.get(env)
  if (cached) return cached
  const apiKey = resolveVoyantApiKey(env)
  const client = getVoyantCloudClient(asCloudClientEnv(env), apiKey ? { apiKey } : undefined)
  CLIENT_CACHE.set(env, client)
  return client
}

export function tryGetCloudClient(env: VoyantApiEnv): VoyantCloudClient | null {
  const apiKey = resolveVoyantApiKey(env)
  if (apiKey && isLocalPlaceholderApiKey(apiKey)) return null
  const cached = CLIENT_CACHE.get(env)
  if (cached) return cached
  const client = tryGetVoyantCloudClient(asTryCloudClientEnv(env), apiKey ? { apiKey } : undefined)
  if (client) CLIENT_CACHE.set(env, client)
  return client
}

function asCloudClientEnv(env: VoyantApiEnv): CloudClientEnv {
  return env as CloudClientEnv
}

function asTryCloudClientEnv(env: VoyantApiEnv): TryCloudClientEnv {
  return env as TryCloudClientEnv
}

function nonEmpty(value: string | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function isLocalPlaceholderApiKey(value: string): boolean {
  return value === "local-dev"
}
