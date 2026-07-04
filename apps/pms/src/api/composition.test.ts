import { composeFromManifest, diffManifestRegistry } from "@voyant-travel/hono/composition"
import { describe, expect, it } from "vitest"

import voyantConfig from "../../voyant.config"
import {
  buildOperatorProviders,
  OPERATOR_RUNTIME_MANIFEST,
  operatorComposition,
} from "./composition"

function entryName(entry: string | { resolve: string }): string {
  return typeof entry === "string" ? entry : entry.resolve
}

describe("operator runtime composition", () => {
  it("registry covers the manifest exactly (no missing factories, no orphans)", () => {
    const modules = diffManifestRegistry(
      OPERATOR_RUNTIME_MANIFEST.modules,
      Object.keys(operatorComposition.modules),
    )
    expect(modules.missingFactories).toEqual([])
    expect(modules.orphanFactories).toEqual([])

    const extensions = diffManifestRegistry(
      OPERATOR_RUNTIME_MANIFEST.extensions,
      Object.keys(operatorComposition.extensions ?? {}),
    )
    expect(extensions.missingFactories).toEqual([])
    expect(extensions.orphanFactories).toEqual([])
  })

  it("composes the full module + extension set in manifest order", () => {
    const composed = composeFromManifest(
      OPERATOR_RUNTIME_MANIFEST,
      operatorComposition,
      buildOperatorProviders(),
    )

    // Manifest entries expand to more mounted modules because Commerce and
    // Distribution each mount multiple internal Hono modules.
    //
    // Stays-only PMS counts (tour verticals stripped): the framework standard set
    // (29 modules) minus the excluded flights module (OPERATOR_EXCLUDED) = 28,
    // plus 3 hand-wired deployment-local modules (invitations, team, realtime —
    // cruises, charters, MICE removed) + 4 auto-discovered deployment-local
    // modules under src/modules (pms/ari authoring, pms/units, pms/front-desk,
    // pms/housekeeping) = 35 manifest modules. Commerce + Distribution still
    // expand (+5) → 40 composed modules. Extensions drop the MICE booking sidecar
    // (16 → 15).
    expect(OPERATOR_RUNTIME_MANIFEST.modules).toHaveLength(35)
    expect(composed.modules).toHaveLength(40)
    expect(composed.extensions).toHaveLength(15)

    // Every composed unit is a real HonoModule/HonoExtension.
    for (const m of composed.modules) expect(m.module?.name).toBeTypeOf("string")
    for (const e of composed.extensions) expect(e.extension?.module).toBeTypeOf("string")

    // Module names are unique (no double-mount).
    const names = composed.modules.map((m) => m.module.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("composes the route families moved off additionalRoutes as extensions", () => {
    // These route families moved off the additionalRoutes hop into the
    // composition registry; createApp mounts each extension's routes under
    // `/v1/admin/{module}` (+ publicPath for public routes), preserving URLs.
    const composed = composeFromManifest(
      OPERATOR_RUNTIME_MANIFEST,
      operatorComposition,
      buildOperatorProviders(),
    )
    const byName = (name: string) => composed.extensions.find((e) => e.extension.name === name)

    const channelPush = byName("channel-push")
    expect(channelPush?.extension.module).toBe("distribution")
    expect(channelPush?.adminRoutes).toBeDefined()

    const bookingTax = byName("booking-tax")
    expect(bookingTax?.extension.module).toBe("bookings")
    expect(bookingTax?.lazyAdminRoutes).toBeTypeOf("function")

    // Booking-schedule owns an admin route on bookings + a public route
    // mounted at /v1/public/payment-policy via the publicPath override.
    const bookingSchedule = byName("booking-schedule")
    expect(bookingSchedule?.extension.module).toBe("bookings")
    expect(bookingSchedule?.lazyAdminRoutes).toBeTypeOf("function")
    expect(bookingSchedule?.lazyPublicRoutes).toBeTypeOf("function")
    expect(bookingSchedule?.publicPath).toBe("payment-policy")

    const snapshot = byName("quote-version-snapshot")
    expect(snapshot?.extension.module).toBe("trips")
    expect(snapshot?.lazyAdminRoutes).toBeTypeOf("function")

    // Lazy extensions (loaded on demand, context bridged by createApp).
    const actionLedgerHealth = byName("action-ledger-health")
    expect(actionLedgerHealth?.extension.module).toBe("action-ledger")
    expect(actionLedgerHealth?.lazyAdminRoutes).toBeTypeOf("function")

    const proposal = byName("proposal")
    expect(proposal?.extension.module).toBe("quote-versions")
    expect(proposal?.publicPath).toBe("proposals")
    expect(proposal?.lazyAdminRoutes).toBeTypeOf("function")
    expect(proposal?.lazyPublicRoutes).toBeTypeOf("function")

    expect(byName("catalog-offers")?.extension.module).toBe("catalog")
    expect(byName("catalog-checkout")?.extension.module).toBe("catalog")
  })

  it("composes deployment-local route modules as lazy modules", () => {
    const composed = composeFromManifest(
      OPERATOR_RUNTIME_MANIFEST,
      operatorComposition,
      buildOperatorProviders(),
    )
    const mod = (name: string) => composed.modules.find((m) => m.module.name === name)

    // mcp/invitations route bundles live in the operator and load lazily;
    // createApp mounts + caches them with the request context bridged. (flights
    // is excluded from this stays-only deployment, so it is not mounted.)
    expect(mod("flights")).toBeUndefined()
    expect(mod("mcp")?.lazyAdminRoutes).toBeTypeOf("function")
    expect(mod("invitations")?.lazyAdminRoutes).toBeTypeOf("function")
    expect(mod("invitations")?.lazyPublicRoutes).toBeTypeOf("function")
  })

  it("auto-discovers the ARI authoring module (src/modules/ari) with eager admin routes", () => {
    const composed = composeFromManifest(
      OPERATOR_RUNTIME_MANIFEST,
      operatorComposition,
      buildOperatorProviders(),
    )
    // The deployment-local ARI module is discovered via `modulesFromGlob` under
    // the composition key `ari`, but names itself `pms/ari` so its admin routes
    // mount at /v1/admin/pms/ari (PLAN §4.5).
    expect(OPERATOR_RUNTIME_MANIFEST.modules).toContain("ari")
    const ari = composed.modules.find((m) => m.module.name === "pms/ari")
    expect(ari).toBeDefined()
    expect(ari?.adminRoutes).toBeDefined()
  })

  it("auto-discovers the units + front-desk modules (Phase 3) with eager admin routes", () => {
    const composed = composeFromManifest(
      OPERATOR_RUNTIME_MANIFEST,
      operatorComposition,
      buildOperatorProviders(),
    )
    // Discovered via `modulesFromGlob` under composition keys `units` /
    // `front-desk`, but named `pms/units` / `pms/front-desk` so their admin
    // routes mount at /v1/admin/pms/units and /v1/admin/pms/front-desk (PLAN §4).
    expect(OPERATOR_RUNTIME_MANIFEST.modules).toContain("units")
    expect(OPERATOR_RUNTIME_MANIFEST.modules).toContain("front-desk")
    const units = composed.modules.find((m) => m.module.name === "pms/units")
    const frontDesk = composed.modules.find((m) => m.module.name === "pms/front-desk")
    expect(units?.adminRoutes).toBeDefined()
    expect(frontDesk?.adminRoutes).toBeDefined()
  })

  it("auto-discovers the housekeeping module (Phase 4) with eager admin routes", () => {
    const composed = composeFromManifest(
      OPERATOR_RUNTIME_MANIFEST,
      operatorComposition,
      buildOperatorProviders(),
    )
    // Discovered via `modulesFromGlob` under composition key `housekeeping`, but
    // named `pms/housekeeping` so its admin routes mount at
    // /v1/admin/pms/housekeeping (PLAN §4.3).
    expect(OPERATOR_RUNTIME_MANIFEST.modules).toContain("housekeeping")
    const housekeeping = composed.modules.find((m) => m.module.name === "pms/housekeeping")
    expect(housekeeping?.adminRoutes).toBeDefined()
  })

  it("every schema-migrated module (voyant.config) is actually mounted at runtime", () => {
    // The dangerous drift: a module added to voyant.config (so its tables
    // migrate) but never mounted — migrated-but-dead. Guard: voyant.config
    // modules ⊆ runtime manifest modules. (Route-only modules like
    // storefront is mounted-but-schema-less and lives only in the runtime
    // manifest, which is fine.)
    //
    // Carve-out: modules whose API is mounted APP-LOCALLY instead of as a
    // package Hono module (none in this stays-only PMS — flights, which used to
    // be the sole app-local API module, was stripped out).
    const APP_LOCAL_API_MODULES = new Set<string>()
    const runtime = new Set(OPERATOR_RUNTIME_MANIFEST.modules)
    const schemaModules = (voyantConfig.modules ?? []).map(entryName)
    const migratedButNotMounted = schemaModules.filter(
      (name) => !runtime.has(name) && !APP_LOCAL_API_MODULES.has(name),
    )
    expect(migratedButNotMounted).toEqual([])
  })

  it("throws loudly when the manifest references an unregistered factory", () => {
    expect(() =>
      composeFromManifest(
        { modules: ["@voyant-travel/does-not-exist"] },
        operatorComposition,
        buildOperatorProviders(),
      ),
    ).toThrow(/no module factory registered for "@voyant-travel\/does-not-exist"/)
  })
})
