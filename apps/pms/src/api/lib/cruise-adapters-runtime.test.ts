import { createSourceAdapterRegistry } from "@voyant-travel/catalog/booking-engine"
import {
  clearCruiseAdapters,
  MockCruiseAdapter,
  resolveCruiseAdapter,
} from "@voyant-travel/cruises"
import {
  type CruiseSourceAdapterShim,
  cruiseAdapterToSourceAdapter,
} from "@voyant-travel/cruises/adapters"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  registerCruiseAdapters,
  resetConfiguredCruiseAdapters,
  syncVerticalRegistryFromCatalog,
  withReadCache,
} from "./cruise-adapters-runtime"

// The vertical cruise registry is a process-global Map — reset both it and the
// memoized configured-adapter list between tests.
beforeEach(() => {
  clearCruiseAdapters()
  resetConfiguredCruiseAdapters()
})

describe("registerCruiseAdapters", () => {
  it("registers a configured adapter into BOTH planes from one instance", () => {
    const registry = createSourceAdapterRegistry()
    const adapter = new MockCruiseAdapter({ name: "acme" })

    registerCruiseAdapters(registry, {}, [adapter])

    // Vertical plane (used by cruisePublicRoutes / cruiseAdminRoutes).
    expect(resolveCruiseAdapter("acme")).toBe(adapter)
    // Catalog plane (used by content / sync / booking engine).
    expect(registry.hasKind("cruise:acme")).toBe(true)
    // Both planes wrap the SAME underlying instance — never two divergent copies.
    // The shim extends SourceAdapter, so this is a single downcast (no double assertion).
    const shim = registry.byKind("cruise:acme")[0]!.adapter as CruiseSourceAdapterShim
    expect(shim.cruiseAdapter).toBe(adapter)
  })

  it("is idempotent — repeated registration does not throw or duplicate", () => {
    const registry = createSourceAdapterRegistry()
    const adapter = new MockCruiseAdapter({ name: "acme" })

    registerCruiseAdapters(registry, {}, [adapter])
    expect(() => registerCruiseAdapters(registry, {}, [adapter])).not.toThrow()
    expect(registry.byKind("cruise:acme")).toHaveLength(1)
  })

  it("no configured adapters + empty registry → no-op, both planes empty", () => {
    const registry = createSourceAdapterRegistry()

    expect(() => registerCruiseAdapters(registry, {})).not.toThrow()

    expect(registry.kinds()).toEqual([])
    expect(resolveCruiseAdapter("acme")).toBeUndefined()
  })
})

describe("syncVerticalRegistryFromCatalog", () => {
  it("back-fills the vertical registry from catalog cruise shims (Connect path)", () => {
    const registry = createSourceAdapterRegistry()
    const adapter = new MockCruiseAdapter({ name: "connect" })
    registry.register("conn_1", cruiseAdapterToSourceAdapter(adapter))

    expect(resolveCruiseAdapter("connect")).toBeUndefined()

    syncVerticalRegistryFromCatalog(registry)

    expect(resolveCruiseAdapter("connect")).toBe(adapter)
  })

  it("registers ONE vertical entry when connections share an adapter name", () => {
    const registry = createSourceAdapterRegistry()
    const first = new MockCruiseAdapter({ name: "connect" })
    const second = new MockCruiseAdapter({ name: "connect" })
    registry.register("conn_1", cruiseAdapterToSourceAdapter(first))
    registry.register("conn_2", cruiseAdapterToSourceAdapter(second))

    // Catalog plane keeps both per-connection entries…
    expect(registry.byKind("cruise:connect")).toHaveLength(2)

    syncVerticalRegistryFromCatalog(registry)

    // …but the name-keyed vertical Map holds exactly one (first wins, no throw).
    expect(resolveCruiseAdapter("connect")).toBe(first)
  })

  it("ignores non-cruise kinds", () => {
    const registry = createSourceAdapterRegistry()
    registry.register({ kind: "voyant-connect" } as never)

    syncVerticalRegistryFromCatalog(registry)

    expect(resolveCruiseAdapter("voyant-connect")).toBeUndefined()
  })
})

describe("withReadCache", () => {
  it("serves repeated reads of the same entity from cache (one upstream call)", async () => {
    const adapter = new MockCruiseAdapter({ name: "acme" })
    const spy = vi.spyOn(adapter, "fetchCruise")
    const cached = withReadCache(adapter)
    const ref = { externalId: "x1" }

    await cached.fetchCruise(ref)
    await cached.fetchCruise(ref)

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("preserves the adapter name so registration still keys correctly", () => {
    expect(withReadCache(new MockCruiseAdapter({ name: "acme" })).name).toBe("acme")
  })
})
