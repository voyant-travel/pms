/**
 * Manifest-driven runtime composition for the operator starter.
 *
 * agent-quality: file-size exception -- this is the deployment's single
 * composition source of truth (one factory entry per mounted module/extension,
 * now that every route family composes here instead of ad-hoc additionalRoutes).
 * Keeping the manifest + registry + capabilities in one file is intentional; the
 * length scales with the module count, not with logic complexity.
 *
 * The standard module/extension set + their order are owned by
 * @voyant-travel/framework. `app.ts` calls `createVoyantApp({ providers,
 * modules })` which assembles `FRAMEWORK_RUNTIME_MANIFEST` + `frameworkComposition`
 * with this deployment's injected providers + `deploymentLocalModules`, then
 * composes + mounts. This file owns only the deployment-specific bits: the
 * provider container (`buildOperatorProviders`) and the two deployment-local
 * module factories. `OPERATOR_RUNTIME_MANIFEST` + `operatorComposition` remain as
 * DERIVED exports for `voyant db doctor` parity + the composition tests. This is
 * the runtime half of the migration-resilience work (voyant#1608 / #1620).
 */

import { OpenAPIHono } from "@hono/zod-openapi"
import { chartersModule } from "@voyant-travel/charters"
import { cruisesModule } from "@voyant-travel/cruises"
import {
  extensionsFromGlob,
  FRAMEWORK_RUNTIME_MANIFEST,
  type FrameworkProviders,
  frameworkComposition,
  modulesFromGlob,
} from "@voyant-travel/framework"
import type { VoyantDb } from "@voyant-travel/hono"
import type {
  CompositionManifest,
  CompositionRegistry,
  ExtensionFactory,
  ModuleFactory,
} from "@voyant-travel/hono/composition"
import { miceHonoModule } from "@voyant-travel/mice"
import { miceBookingExtension } from "@voyant-travel/mice/booking-extension"
import { createNetopiaCheckoutStarter } from "@voyant-travel/plugin-netopia"
import { createRealtimeHonoModule } from "@voyant-travel/realtime"
import { relationshipsService } from "@voyant-travel/relationships"
import { Hono } from "hono"
import { resolveOperatorCustomFields } from "../lib/custom-fields"
import { resolveNotificationProviders } from "../lib/notifications"
import { operatorRealtimeBridgeRoutes, resolveRealtimeProviders } from "../lib/realtime"
import { resolveBookingRequirementsProductSnapshot } from "./lib/booking-requirements-product-snapshot"
import { buildCatalogContext } from "./lib/catalog-context"
import { createBookingScheduleExtension } from "./routes/booking-schedule"
import { createChannelPushExtension } from "./routes/channel-push"
import { createOperatorQuoteVersionSnapshotExtension } from "./routes/quote-version-snapshot-routes"
import { AUTO_GENERATE_CONTRACT_OPTIONS } from "./runtime/contract-document-runtime"
import {
  createOperatorBookingPiiService,
  createOperatorDocumentStorage,
  createOperatorInvoiceExchangeRateResolver,
  createOperatorInvoiceSettlementPollers,
  readOperatorDocumentContentBase64,
  resolveOperatorContractDocumentGenerator,
  resolveOperatorDb,
  resolveOperatorDocumentDownloadUrl,
} from "./runtime/operator-runtime-adapter"
import {
  resolveBankTransferDetails,
  resolvePublicCheckoutBaseUrlFromBindings,
} from "./runtime/payment-config"
import { createRelationshipsStorefrontIntakePersistence } from "./runtime/storefront-intake-runtime"
import { createOperatorTripsRoutesOptions } from "./runtime/trips-runtime"
import { closeTerminalBookingPaymentSchedules } from "./subscribers/booking-payment-cleanup"

/**
 * The operator deployment's capability container. Every template-specific
 * resolver/service a module factory needs is gathered here so wiring lives in
 * one typed place rather than being threaded through `createApp`.
 */
// `extends FrameworkProviders` is the compile-time guard that this container
// satisfies the framework's injected provider contract (so the relocated
// `frameworkComposition` factories can read it). A future framework provider
// addition becomes required here, failing the operator typecheck until
// `buildOperatorProviders` wires it — that's the intended forcing function.
export interface OperatorCapabilities extends FrameworkProviders {
  resolveNotificationProviders: typeof resolveNotificationProviders
  resolvePublicCheckoutBaseUrl: typeof resolvePublicCheckoutBaseUrlFromBindings
  resolveDocumentDownloadUrl: typeof resolveOperatorDocumentDownloadUrl
  readDocumentContentBase64: typeof readOperatorDocumentContentBase64
  resolveDb: typeof resolveOperatorDb
  createOperatorDocumentStorage: typeof createOperatorDocumentStorage
  resolveContractDocumentGenerator: typeof resolveOperatorContractDocumentGenerator
  createBookingPiiService: typeof createOperatorBookingPiiService
  autoGenerateContractOnConfirmed: typeof AUTO_GENERATE_CONTRACT_OPTIONS
  resolveBankTransferDetails: typeof resolveBankTransferDetails
  relationshipsService: typeof relationshipsService
  closePaymentSchedulesForBooking: typeof closeTerminalBookingPaymentSchedules
  createTripsRoutesOptions: typeof createOperatorTripsRoutesOptions
  resolveBookingRequirementsProductSnapshot: typeof resolveBookingRequirementsProductSnapshot
}

/**
 * Build the operator provider container (gathers deployment resolvers/loaders).
 * Providers are bindings-deferred closures, so no `env` is needed here.
 */
export function buildOperatorProviders(): OperatorCapabilities {
  return {
    customFields: resolveOperatorCustomFields,
    resolveNotificationProviders,
    resolvePublicCheckoutBaseUrl: resolvePublicCheckoutBaseUrlFromBindings,
    resolveDocumentDownloadUrl: resolveOperatorDocumentDownloadUrl,
    readDocumentContentBase64: readOperatorDocumentContentBase64,
    resolveDb: resolveOperatorDb,
    createOperatorDocumentStorage,
    createInvoiceExchangeRateResolver: createOperatorInvoiceExchangeRateResolver,
    createInvoiceSettlementPollers: createOperatorInvoiceSettlementPollers,
    resolveContractDocumentGenerator: resolveOperatorContractDocumentGenerator,
    createBookingPiiService: createOperatorBookingPiiService,
    autoGenerateContractOnConfirmed: AUTO_GENERATE_CONTRACT_OPTIONS,
    resolveBankTransferDetails,
    relationshipsService,
    closePaymentSchedulesForBooking: closeTerminalBookingPaymentSchedules,
    // Adapt the deployment's catalog context into the package's search runtime
    // shape (the framework catalog factory consumes this directly).
    resolveCatalogRuntime: (c) => {
      const ctx = buildCatalogContext(c)
      return {
        indexer: ctx.catalog.indexer,
        embeddings: ctx.catalog.embeddings,
        defaultScope: ctx.defaultScope,
      }
    },
    createTripsRoutesOptions: createOperatorTripsRoutesOptions,
    resolveBookingRequirementsProductSnapshot,
    storefrontIntakePersistence: createRelationshipsStorefrontIntakePersistence(),
    netopiaCheckoutStarter: createNetopiaCheckoutStarter(),
    createChannelPushExtension,
    // Lazy route-bundle loaders for the `operator/*` standard families — each
    // wires this deployment's providers into the package-owned route bundle.
    loadFlightAdminRoutes: () =>
      import("./runtime/flights-runtime").then((m) => m.buildFlightAdminRoutes()),
    loadMcpAdminRoutes: () => import("./runtime/mcp-runtime").then((m) => m.buildMcpAdminRoutes()),
    loadCatalogBookingRoutes: () =>
      import("./runtime/catalog-booking-runtime").then((m) => {
        // OpenAPIHono parent so the booking-engine sub-apps' `.openapi()` defs
        // (quote/book/drafts/holds) surface in the operator spec via the
        // build-time lazy-merge — `mergeLazyOpenApiPaths` skips plain `Hono`
        // wrappers, which carry no registry (voyant#2114 / voyant#2208). The
        // mount accepts a `Pick<Hono, "route" | "get">`, so the OpenAPIHono is
        // passed without a cast despite its non-blank default `Env`.
        const app = new OpenAPIHono()
        m.mountCatalogBookingRoutes(app)
        return app
      }),
    loadCatalogContentRoutes: () =>
      import("./routes/catalog-content").then((m) => {
        // OpenAPIHono parent so the product content sub-app's `.openapi()` def
        // (`GET /{id}/content`) surfaces in the operator spec via the build-time
        // lazy-merge — `mergeLazyOpenApiPaths` skips plain `Hono` wrappers, which
        // carry no registry (voyant#2114). The cruise/accommodation content
        // factories are still plain `Hono`, so only the product content routes
        // are documented for now.
        const app = new OpenAPIHono()
        m.mountCatalogContentRoutes(app)
        return app
      }),
    loadMediaRoutes: () =>
      import("./runtime/media-runtime").then((m) => m.buildOperatorMediaRoutes()),
    loadPaymentLinkRoutes: () =>
      import("./runtime/payment-link-runtime").then((m) => m.buildOperatorPaymentLinkRoutes()),
    loadContractDocumentRoutes: () =>
      import("./runtime/contract-document-runtime").then((m) => m.buildContractDocumentRoutes()),
    // Lazy `operator/*` standard extension builders/loaders.
    loadBookingScheduleAdminRoutes: async () =>
      createBookingScheduleExtension().adminRoutes ?? new OpenAPIHono(),
    loadPaymentPolicyPublicRoutes: async () =>
      createBookingScheduleExtension().publicRoutes ?? new OpenAPIHono(),
    loadQuoteVersionSnapshotRoutes: async () =>
      createOperatorQuoteVersionSnapshotExtension().adminRoutes ?? new OpenAPIHono(),
    loadBookingMaintenanceRoutes: async () => {
      const app = new Hono<{ Variables: { db: VoyantDb } }>()
      app.post("/:bookingId/rebuild-tax-lines", async (c) => {
        const bookingId = c.req.param("bookingId")
        try {
          const [
            { rebuildBookingItemTaxLines },
            { operatorPostgresDb },
            { resolveBookingTaxSettings: resolveTax },
          ] = await Promise.all([
            import("@voyant-travel/commerce/checkout"),
            import("./runtime/operator-runtime-adapter"),
            import("@voyant-travel/operator-settings"),
          ])
          const result = await rebuildBookingItemTaxLines(
            operatorPostgresDb(c.get("db")),
            bookingId,
            {
              resolveBookingTaxSettings: resolveTax,
            },
          )
          return c.json({ data: result })
        } catch (err) {
          return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
        }
      })
      return app
    },
    loadActionLedgerHealthRoutes: () =>
      import("./runtime/action-ledger-health-runtime").then((m) =>
        m.createActionLedgerHealthAdminRoutes(),
      ),
    loadProposalAdminRoutes: () =>
      import("./routes/proposal-routes").then((m) => m.createProposalAdminRoutes()),
    loadProposalPublicRoutes: () =>
      import("./routes/proposal-routes").then((m) => m.createProposalPublicRoutes()),
    loadCatalogOffersRoutes: () =>
      import("./runtime/catalog-offers-runtime").then((m) =>
        m.createCatalogOffersAdminRoutesForOperator(),
      ),
    loadCatalogCheckoutRoutes: () =>
      import("./routes/catalog-checkout").then((m) => m.createCatalogCheckoutPublicRoutes()),
  }
}

/**
 * The deployment-local module factories — the only two families that aren't
 * package-owned standard (Better-Auth team invitations + the operator's own
 * Better-Auth team invitations — coupled to the deployment's auth client).
 * `createVoyantApp` merges these onto the standard `frameworkComposition` set;
 * `app.ts` passes them as `modules`. (operator-settings is now a standard
 * package module owned by the framework.)
 */
/**
 * Custom modules dropped into `src/modules/<name>/index.ts` are auto-discovered
 * and mounted — the "build your own module without forking" seam. Vite compiles
 * this `import.meta.glob` to static imports at build time (Workers-safe); each
 * module's default export is a `HonoModule`/`ModuleFactory` (see
 * `defineDeploymentModule`), keyed by its `<name>` directory. Empty until a
 * deployment adds one. Schema for a custom module (`src/modules/<name>/schema.ts`)
 * is picked up by the deployment drizzle configs and migrated as a deployment
 * source after the framework bundle. See docs/architecture/custom-modules.md.
 */
const discoveredModules = modulesFromGlob<OperatorCapabilities>(
  import.meta.glob("../modules/*/index.ts", { eager: true }),
)

export const deploymentLocalModules: Record<string, ModuleFactory<OperatorCapabilities>> = {
  ...discoveredModules,
  "operator/invitations": () => ({
    module: { name: "invitations" },
    lazyAdminRoutes: () =>
      import("./routes/invitations").then((m) => m.createInvitationsAdminRoutes()),
    lazyPublicRoutes: () =>
      import("./routes/invitations").then((m) => m.createInvitationsPublicRoutes()),
    // Invitation redemption is reached from an emailed link without a session
    // (ADR-0008); the public surface is anonymous.
    anonymous: true,
  }),
  // Cloud-mode team management mounted at /v1/admin/team — proxies member
  // management to the Voyant Cloud platform when VOYANT_ADMIN_AUTH_MODE is
  // "voyant-cloud". The local invitations surface above stays the local-mode
  // path; these routes 404 in local mode.
  "operator/team": () => ({
    module: { name: "team" },
    lazyAdminRoutes: () => import("./routes/team").then((m) => m.createTeamAdminRoutes()),
  }),
  // Cruise admin/public routes mounted at /v1/{admin,public}/cruises with the
  // booking-engine SourceAdapterRegistry injected into context. Provider-neutral:
  // external cruise providers are wired in `lib/cruise-adapters-runtime.ts`.
  // Reuse the package's `cruisesModule` metadata (not a bare `{ name }`) so the
  // `requiresTransactionalDb` flag survives — createApp routes these prefixes to
  // the transactional DB, which the cruise mutation/booking handlers need.
  "operator/cruises": () => ({
    module: cruisesModule,
    lazyAdminRoutes: () => import("./routes/cruises").then((m) => m.createCruiseAdminRoutes()),
    lazyPublicRoutes: () => import("./routes/cruises").then((m) => m.createCruisePublicRoutes()),
    // Storefront cruise detail/search is part of the auth-less journey (ADR-0008).
    anonymous: true,
  }),
  // Charter admin/public routes mounted at /v1/{admin,public}/charters. Charters
  // is operator-local (niche luxury-yacht vertical) — NOT in the framework
  // standard set; the operator is the only deployment that surfaces it
  // (voyant#2191). External charter providers resolve through the package's
  // process-global adapter registry, so — unlike cruises — no
  // SourceAdapterRegistry injection is needed; local charters work unconditionally
  // and external keys 501 with no adapter registered. Reuse the package's
  // `chartersModule` metadata (not a bare `{ name }`) so `requiresTransactionalDb`
  // survives — createApp routes these prefixes to the transactional DB the charter
  // mutation/booking/quote handlers need. The public `chartersPublicRoutes`
  // bundle is an OpenAPIHono, so its `.openapi()` defs surface in the operator
  // storefront spec via the build-time lazy-merge (voyant#2114).
  "operator/charters": () => ({
    module: chartersModule,
    lazyAdminRoutes: () => import("./routes/charters").then((m) => m.createCharterAdminRoutes()),
    lazyPublicRoutes: () => import("./routes/charters").then((m) => m.createCharterPublicRoutes()),
    // Storefront charter browse/detail is part of the auth-less journey (ADR-0008).
    anonymous: true,
  }),
  // Realtime channels (voyant#1695). Mints scoped client tokens at
  // /v1/{admin,public}/realtime/token and bridges domain events to channels as
  // invalidation hints. Provider-agnostic and fully optional: inert until
  // VOYANT_REALTIME_ENABLED is set (see lib/realtime.ts).
  "operator/realtime": () =>
    createRealtimeHonoModule({
      resolveProviders: resolveRealtimeProviders,
      bridgeRoutes: operatorRealtimeBridgeRoutes,
    }),
  // MICE group-program spine (voyant#1489). Operator-local (niche) — NOT in the
  // framework standard set. Room blocks (the standard allotment primitive it
  // links to) ship in accommodations via the framework composition.
  "@voyant-travel/mice": () => miceHonoModule,
}

/**
 * Custom extensions dropped into `src/extensions/<name>/index.ts` are
 * auto-discovered and mounted onto an EXISTING module's surface (the "custom
 * route on an existing module without forking" seam). Same build-time
 * `import.meta.glob` mechanism as modules; each default export is a
 * `HonoExtension`/`ExtensionFactory` (see `defineDeploymentExtension`) targeting
 * `extension.module`. Empty until a deployment adds one. The standard extensions
 * stay framework-owned (with injected provider closures); these are purely
 * deployment-local. See docs/architecture/custom-modules.md.
 */
const discoveredExtensions = extensionsFromGlob<OperatorCapabilities>(
  import.meta.glob("../extensions/*/index.ts", { eager: true }),
)

export const deploymentLocalExtensions: Record<string, ExtensionFactory<OperatorCapabilities>> = {
  ...discoveredExtensions,
  // MICE booking sidecar (booking_mice_details) — operator-local (voyant#1489).
  "@voyant-travel/mice/booking-extension": () => miceBookingExtension,
}

/**
 * The full composed manifest + registry — DERIVED from the framework-owned
 * standard set plus the deployment-local additions. `app.ts` builds the app via
 * `createVoyantApp` (which assembles the same internally); these exports remain
 * for `voyant db doctor` parity inspection and the composition tests.
 */
export const OPERATOR_RUNTIME_MANIFEST = {
  modules: [...FRAMEWORK_RUNTIME_MANIFEST.modules, ...Object.keys(deploymentLocalModules)],
  extensions: [...FRAMEWORK_RUNTIME_MANIFEST.extensions, ...Object.keys(deploymentLocalExtensions)],
} satisfies CompositionManifest

export const operatorComposition: CompositionRegistry<OperatorCapabilities> = {
  modules: { ...frameworkComposition.modules, ...deploymentLocalModules },
  extensions: { ...frameworkComposition.extensions, ...deploymentLocalExtensions },
}
