/**
 * The ONE documented place a deployment wires external cruise adapters.
 *
 * A cruise provider must reach two planes to be fully functional, and this
 * seam registers a single `CruiseAdapter` instance into both from one place:
 *
 *   - Vertical plane — the process-global cruise registry
 *     (`registerCruiseAdapter`), resolved by `cruisePublicRoutes` /
 *     `cruiseAdminRoutes` for external detail, refresh, detach, and the
 *     external booking commit (keyed by `adapter.name`).
 *   - Catalog plane — the booking-engine `SourceAdapterRegistry`, fed via the
 *     `cruiseAdapterToSourceAdapter` shim, used by catalog content, discovery /
 *     sync, snapshot capture, and booking-engine sourced inventory (keyed by
 *     `cruise:<adapter.name>`).
 *
 * Provider-neutral by design: Voyant Connect is just one optional contributor
 * (registered into the catalog plane by `registerVoyantConnectSources` in
 * `booking-engine-runtime.ts`, then back-filled into the vertical plane here).
 * A deployment building its own connector adds its `CruiseAdapter` to
 * `configuredCruiseAdapters` below — no Connect dependency required.
 *
 * Missing config is a no-op, never a boot failure: with no custom adapter and
 * Connect unconfigured, both planes stay empty and external cruise reads return
 * a clean `adapter_not_registered` / `registry_not_configured`, not a crash.
 */

import type { SourceAdapterRegistry } from "@voyant-travel/catalog/booking-engine"
import {
  hasCruiseAdapter,
  memoizeCruiseAdapter,
  registerCruiseAdapter,
} from "@voyant-travel/cruises"
import {
  type CruiseAdapter,
  type CruiseSourceAdapterShim,
  cruiseAdapterToSourceAdapter,
} from "@voyant-travel/cruises/adapters"

/**
 * Read-cache TTL for deployment-owned cruise adapters. `memoizeCruiseAdapter`
 * caches per-entity fetches (cruise/sailing/ship/pricing/itinerary) for this long
 * within an isolate; listings always go live. Matches the 60s public-read
 * `s-maxage`, so a cache hit never serves content staler than the edge already
 * does. Connect adapters are memoized upstream in the plugin, not here.
 */
export const CRUISE_ADAPTER_READ_CACHE_TTL_MS = 60_000

/**
 * Wrap an owned cruise adapter with the short-TTL read cache so repeated
 * detail/sailing/ship reads within an isolate skip the upstream call.
 */
export function withReadCache(adapter: CruiseAdapter): CruiseAdapter {
  return memoizeCruiseAdapter(adapter, { ttlMs: CRUISE_ADAPTER_READ_CACHE_TTL_MS })
}

/**
 * Env passed to the cruise-adapter seam — the raw string env bag. `process.env`
 * (the sync CLI) satisfies this directly; the booking-engine runtime passes its
 * `BookingEngineEnv` through. A connector reads its own keys, e.g.
 * `env.MY_CRUISE_ADAPTER_TOKEN`.
 */
export type CruiseAdapterEnv = Record<string, string | undefined>

let _configured: CruiseAdapter[] | undefined

/**
 * The deployment's own external cruise connectors. Memoized per isolate so the
 * SAME instance is registered into both planes (the vertical map and the
 * catalog shim wrap one object — never two divergent instances).
 *
 * Add your connector here (push the RAW adapter — the seam applies the read
 * cache; don't pre-wrap with `memoizeCruiseAdapter` or you'll double-cache):
 *
 *   import { createMyCruiseAdapter } from "my-cruise-connector"
 *   adapters.push(createMyCruiseAdapter({ token: env.MY_CRUISE_ADAPTER_TOKEN }))
 *
 * Voyant Connect is intentionally NOT listed here — its cruise adapters arrive
 * through the catalog plane and are back-filled by `syncVerticalRegistryFromCatalog`.
 */
export function configuredCruiseAdapters(_env: CruiseAdapterEnv): CruiseAdapter[] {
  if (!_configured) {
    const adapters: CruiseAdapter[] = []
    // ── Register deployment-owned cruise connectors here ──────────────────
    // Each is wrapped with the short-TTL read cache so the SAME memoized
    // instance lands in both planes.
    _configured = adapters.map(withReadCache)
  }
  return _configured
}

/**
 * Register every configured cruise adapter into BOTH planes, then back-fill the
 * vertical plane from any cruise shims already in the catalog registry (Connect
 * or any provider registered via `registerVoyantConnectSources`).
 *
 * Idempotent and safe to call on every registry build:
 *   - vertical: guarded by `hasCruiseAdapter(name)` (the Map throws on dup name)
 *   - catalog: guarded by `registry.hasKind("cruise:" + name)` (register replaces
 *     by connection id, so a re-register is harmless but the guard avoids churn)
 */
export function registerCruiseAdapters(
  registry: SourceAdapterRegistry,
  env: CruiseAdapterEnv,
  adapters: CruiseAdapter[] = configuredCruiseAdapters(env),
): void {
  for (const adapter of adapters) {
    if (!hasCruiseAdapter(adapter.name)) registerCruiseAdapter(adapter)
    if (!registry.hasKind(`cruise:${adapter.name}`)) {
      registry.register(cruiseAdapterToSourceAdapter(adapter))
    }
  }
  syncVerticalRegistryFromCatalog(registry)
}

/**
 * Back-fill the vertical registry from cruise shims registered in the catalog
 * plane. Connect registers one connection-scoped catalog adapter per connection,
 * and several connections can share the same `adapter.name`; the vertical Map is
 * name-keyed, so we register each unique name exactly once. Re-runnable — call it
 * again after the async per-connection Connect warm lands more cruise shims.
 */
export function syncVerticalRegistryFromCatalog(registry: SourceAdapterRegistry): void {
  for (const kind of registry.kinds()) {
    if (!kind.startsWith("cruise:")) continue
    for (const { adapter } of registry.byKind(kind)) {
      const cruiseAdapter = asCruiseShim(adapter)?.cruiseAdapter
      if (cruiseAdapter && !hasCruiseAdapter(cruiseAdapter.name)) {
        registerCruiseAdapter(cruiseAdapter)
      }
    }
  }
}

function asCruiseShim(adapter: unknown): CruiseSourceAdapterShim | undefined {
  return adapter && typeof adapter === "object" && "cruiseAdapter" in adapter
    ? (adapter as CruiseSourceAdapterShim)
    : undefined
}

/** Test seam: reset the memoized configured-adapter list between tests. */
export function resetConfiguredCruiseAdapters(): void {
  _configured = undefined
}
