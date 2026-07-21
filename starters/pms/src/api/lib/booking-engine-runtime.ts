/**
 * Process-local SourceAdapterRegistry + OwnedBookingHandlerRegistry
 * for the catalog booking engine. Source adapter wiring stays here; owned
 * vertical booking handlers live in focused registration modules.
 */

import {
  createSourceAdapterRegistry,
  type OwnedBookingHandlerRegistry,
  type SourceAdapterRegistry,
} from "@voyant-travel/catalog/booking-engine"
import { createDemoCatalogAdapter } from "@voyant-travel/plugin-catalog-demo"
import {
  createVoyantConnectSources,
  type PrepareVoyantConnectSourcesOptions,
  prepareVoyantConnectSources,
  registerVoyantConnectSources,
  resolveVoyantConnectEnv,
  type VoyantConnectSourceConnection,
} from "@voyant-travel/plugin-voyant-connect"
import type { Context } from "hono"
import { createOwnedBookingHandlersRegistry } from "./owned-booking-handlers"

// `VoyantConnectConnectionCache` isn't re-exported from the package root (0.3.0),
// so derive it from the options type rather than naming it directly.
type VoyantConnectConnectionCache = NonNullable<
  PrepareVoyantConnectSourcesOptions["connectionCache"]
>

let _registry: SourceAdapterRegistry | undefined
let _ownedHandlers: OwnedBookingHandlerRegistry | undefined
let _connectWarm: Promise<void> | undefined

const DEMO_CATALOG_VERTICALS = ["products", "accommodations"] as const

/**
 * Build (once per isolate) the registry with everything resolvable
 * synchronously: the demo adapter and the un-scoped Voyant Connect default
 * adapter pair. The default pair is the cold-window fallback — `bookEntity`
 * resolves by `source_connection_id` first and falls back to this by-kind
 * adapter, so sourced bookings still dispatch before the per-connection warm
 * (see `warmBookingEngineConnectSources`) completes.
 */
function ensureRegistry(env: BookingEngineEnv): SourceAdapterRegistry {
  if (!_registry) {
    const registry = createSourceAdapterRegistry()
    if (env.CATALOG_DEMO_API_URL) {
      registry.register(
        createDemoCatalogAdapter({
          baseUrl: env.CATALOG_DEMO_API_URL,
          verticals: DEMO_CATALOG_VERTICALS,
        }),
      )
    }
    registerVoyantConnectFallback(registry, env)
    _registry = registry
  }
  return _registry
}

/**
 * Returns the (lazy-initialized) booking-engine registry and kicks the
 * per-connection Connect warm in the background. Route handlers should prefer
 * `getBookingEngineRegistryFromContext` (which ties the warm to the request via
 * `ctx.waitUntil`); async batch entry points should prefer
 * `ensureBookingEngineRegistry` (which awaits the warm).
 */
export function getBookingEngineRegistry(env: BookingEngineEnv): SourceAdapterRegistry {
  const registry = ensureRegistry(env)
  void warmBookingEngineConnectSources(env)
  return registry
}

/**
 * Enumerate the operator's active Connect connections and register one
 * connection-scoped adapter set per connection (keyed by `connection.id`) onto
 * the cached registry, so the live book path resolves by `source_connection_id`
 * exactly like the discovery-sync CLI does. Idempotent and memoized per isolate;
 * a failed warm is reset so a later request retries, and the un-scoped default
 * keeps sourced bookings dispatching in the meantime. Resolves to a no-op when
 * Connect is unconfigured (no network). See #2044.
 */
export function warmBookingEngineConnectSources(env: BookingEngineEnv): Promise<void> {
  if (_connectWarm) return _connectWarm
  const registry = ensureRegistry(env)
  _connectWarm = prepareVoyantConnectSources(env, {
    enumerate: true,
    // Cache the connection enumeration cross-isolate so a cold isolate skips the
    // network round-trip.
    connectionCache: connectionCacheFromEnv(env),
    warn: (message) => console.warn(`[booking-engine] ${message}`),
  })
    .then((sources) => {
      registerVoyantConnectSources(registry, sources)
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(
        `[booking-engine] Connect connection warm failed; using un-scoped fallback: ${message}`,
      )
      _connectWarm = undefined
    })
  return _connectWarm
}

/**
 * Returns the booking-engine registry after the per-connection Connect warm has
 * completed. Use from async batch entry points and scheduled jobs
 * where the connection-enumeration latency is acceptable and per-connection
 * routing matters for the whole run.
 */
export async function ensureBookingEngineRegistry(
  env: BookingEngineEnv,
): Promise<SourceAdapterRegistry> {
  const registry = ensureRegistry(env)
  await warmBookingEngineConnectSources(env)
  return registry
}

/**
 * Returns the (lazy-initialized) owned-handler registry. Phase A registers
 * products plus retained resale verticals such as accommodations and cruises.
 */
export function getOwnedBookingHandlerRegistry(env: BookingEngineEnv): OwnedBookingHandlerRegistry {
  if (!_ownedHandlers) {
    _ownedHandlers = createOwnedBookingHandlersRegistry(env, () => getBookingEngineRegistry(env))
  }
  return _ownedHandlers
}

export interface BookingEngineEnv {
  CATALOG_DEMO_API_URL?: string
  VOYANT_API_KEY?: string
  VOYANT_CLOUD_API_KEY?: string
  VOYANT_CONNECT_API_KEY?: string
  VOYANT_CONNECT_API_URL?: string
  VOYANT_CONNECT_MARKET?: string
  VOYANT_CONNECT_OPERATOR_ID?: string
  VOYANT_CONNECT_SYNC_LIMIT?: string
  /**
   * KV namespace for cross-isolate caches. When present, the Connect connection
   * enumeration is cached here so a cold isolate skips the network round-trip.
   * Absent in the sync CLI / unit tests — caching is simply skipped.
   */
  CACHE?: KVNamespace
}

/** TTL for the cached Connect connection list (seconds). Connections change
 * infrequently; KV's minimum expirationTtl is 60s. */
const CONNECT_CONNECTIONS_CACHE_TTL_S = 300

/**
 * Build a read-through KV cache for the Connect connection enumeration, or
 * `undefined` when no `CACHE` binding is present (CLI / tests) — in which case the
 * plugin enumerates over the network as before.
 */
function connectionCacheFromEnv(env: BookingEngineEnv): VoyantConnectConnectionCache | undefined {
  const kv = env.CACHE
  if (!kv) return undefined
  const key = `voyant-connect:connections:${env.VOYANT_CONNECT_OPERATOR_ID ?? "default"}`
  return {
    get: async () => {
      const raw = await kv.get(key)
      return raw ? (JSON.parse(raw) as VoyantConnectSourceConnection[]) : undefined
    },
    set: async (connections) => {
      await kv.put(key, JSON.stringify(connections), {
        expirationTtl: CONNECT_CONNECTIONS_CACHE_TTL_S,
      })
    },
  }
}

/**
 * Register the un-scoped Voyant Connect default adapter pair synchronously — the
 * cold-window fallback used until `warmBookingEngineConnectSources` registers the
 * per-connection adapters. Connect env resolution (key fallback, operator id,
 * market, sync limit, the incomplete-config warning) is shared with the
 * discovery-sync CLI via `resolveVoyantConnectEnv` so the two paths can't drift.
 */
function registerVoyantConnectFallback(
  registry: SourceAdapterRegistry,
  env: BookingEngineEnv,
): void {
  const config = resolveVoyantConnectEnv(env, {
    warn: (message) => console.warn(`[booking-engine] ${message}`),
  })
  if (!config) return
  registerVoyantConnectSources(registry, createVoyantConnectSources(config))
}

/**
 * Convenience helper for route handlers — pulls env from the Hono context,
 * returns the cached source registry, and ties the per-connection Connect warm
 * to the request via `ctx.waitUntil` so the enumeration isn't torn down when the
 * request ends. Non-blocking: the request proceeds on the un-scoped fallback
 * during the first per-isolate warm.
 */
export function getBookingEngineRegistryFromContext(c: Context): SourceAdapterRegistry {
  const env = c.env as BookingEngineEnv
  const registry = ensureRegistry(env)
  const warm = warmBookingEngineConnectSources(env)
  try {
    c.executionCtx.waitUntil(warm)
  } catch {
    // No ExecutionContext (e.g. unit tests) — the memoized warm still settles on
    // a subsequent request in a live isolate.
  }
  return registry
}

/**
 * Convenience helper for route handlers — pulls env from the Hono context and
 * returns the cached owned-handler registry.
 */
export function getOwnedBookingHandlerRegistryFromContext(c: Context): OwnedBookingHandlerRegistry {
  const env = c.env as BookingEngineEnv
  return getOwnedBookingHandlerRegistry(env)
}
