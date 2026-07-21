/**
 * Manifest-driven runtime composition for the operator starter.
 *
 * agent-quality: file-size exception -- this is the deployment's single
 * composition source of truth (one factory entry per mounted module/extension,
 * now that every route family composes here instead of ad-hoc additionalRoutes).
 * Keeping the manifest + registry + capabilities in one file is intentional; the
 * length scales with the module count, not with logic complexity.
 *
 * The standard module/extension set + their order come from the generated
 * project graph. This file composes that graph once, then appends the PMS-local
 * factories. The resulting manifest and registry remain useful to db doctor and
 * composition tests without maintaining a second product list.
 */

import { OpenAPIHono } from "@hono/zod-openapi"
import {
  composeVoyantGraphRuntime,
  extensionsFromGlob,
  type FrameworkProviders,
  modulesFromGlob,
} from "@voyant-travel/framework"
import type { VoyantDb } from "@voyant-travel/hono"
import type {
  CompositionManifest,
  CompositionRegistry,
  ExtensionFactory,
  ModuleFactory,
} from "@voyant-travel/hono/composition"
import { createNetopiaCheckoutStarter } from "@voyant-travel/plugin-netopia"
// PMS domain packages — graduated from `src/modules/*` deployment-local prototypes
// into published workspace packages (PLAN §3.1). Registered EXPLICITLY below (the
// `src/modules/*` glob stays wired for future app-local prototypes). Five default-
// export a ready `ModuleFactory`; channels exports a factory taking its two app-
// injected deps (connector registry + stay-booking write path).
import ariModule from "@voyant-travel/pms-ari"
import { createChannelsModule } from "@voyant-travel/pms-channels"
import foliosModule from "@voyant-travel/pms-folios"
import { createFrontDeskModule } from "@voyant-travel/pms-front-desk"
import housekeepingModule from "@voyant-travel/pms-housekeeping"
import unitsModule from "@voyant-travel/pms-units"
import { relationshipsService } from "@voyant-travel/relationships"
import { storageObjectRuntimePort } from "@voyant-travel/storage/runtime-port"
import { Hono } from "hono"
import { resolveOperatorCustomFields } from "../lib/custom-fields"
import { resolveNotificationProviders } from "../lib/notifications"
import { asPostgresDb } from "./lib/booking-engine-db"
import { resolveBookingRequirementsProductSnapshot } from "./lib/booking-requirements-product-snapshot"
import { buildCatalogContext } from "./lib/catalog-context"
import { getChannelConnectors } from "./lib/channel-connectors"
import { persistConfirmedStayBooking, persistStayBooking } from "./lib/persist-stay-booking"
import { createBookingScheduleExtension } from "./routes/booking-schedule"
import { createChannelPushExtension } from "./routes/channel-push"
import { createOperatorQuoteVersionSnapshotExtension } from "./routes/quote-version-snapshot-routes"
import { AUTO_GENERATE_CONTRACT_OPTIONS } from "./runtime/contract-document-runtime"
import {
  createOperatorBookingPiiService,
  createOperatorDocumentStorage,
  createOperatorInvoiceExchangeRateResolver,
  createOperatorInvoiceSettlementPollers,
  createOperatorSmartbillRuntimeHost,
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
import { createGeneratedProjectRuntime } from "../../.voyant/runtime/project-runtime.generated"
import {
  createOperatorWorkerRuntimeHostPrimitives,
  deliverOperatorGraphEvent,
} from "./runtime/worker-runtime-host"

/**
 * The operator deployment's capability container. Every template-specific
 * resolver/service a module factory needs is gathered here so wiring lives in
 * one typed place rather than being threaded through `createApp`.
 */
// `extends FrameworkProviders` keeps the app-local capability container
// compatible with the framework while package-owned requirements flow through
// generated runtime ports.
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
    // Flights is excluded from this stays-only deployment (see OPERATOR_EXCLUDED
    // below), so the framework's flights factory never runs — this required
    // provider port stays as an inert stub only to satisfy `FrameworkProviders`.
    loadFlightAdminRoutes: async () => new OpenAPIHono(),
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
 * Deployment-local module factories appended to the generated graph.
 */
/**
 * Custom modules dropped into `src/modules/<name>/index.ts` are auto-discovered
 * and mounted — the "build your own module without forking" seam. Vite compiles
 * this `import.meta.glob` to static imports at build time (Workers-safe); each
 * module's default export is a `HonoModule`/`ModuleFactory` (see
 * `defineDeploymentModule`), keyed by its `<name>` directory. The seam stays
 * wired for future app-local PROTOTYPES; `src/modules/` is currently empty because
 * the six PMS domains graduated into published `@voyant-travel/pms-*` packages
 * (PLAN §3.1) — they register EXPLICITLY below. Schema for a custom module
 * (`src/modules/<name>/schema.ts`) is picked up by the deployment drizzle configs
 * and migrated as a deployment source after the framework bundle. See
 * docs/architecture/custom-modules.md and packages/README.md.
 */
const discoveredModules = modulesFromGlob<OperatorCapabilities>(
  import.meta.glob("../modules/*/index.ts", { eager: true }),
)

/**
 * The graduated PMS domain packages, registered explicitly under the same
 * composition keys the `src/modules/*` glob used to produce (so counts + mounted
 * URLs are unchanged — only the code's provenance moved to `packages/*`). Five
 * default-export a ready factory; `channels` is built with its two app-injected
 * deps: the connector registry (`getChannelConnectors`) and the accommodation
 * stay-booking write path (`persistStayBooking`), which stays app-side. The
 * `asPostgresDb` adapter bridges the request `db` to the write path's signature.
 */
const pmsDomainModules: Record<string, ModuleFactory<OperatorCapabilities>> = {
  ari: ariModule,
  units: unitsModule,
  // Front-desk reservations persist through the shared owned-stay write path,
  // marked `direct` so reports distinguish desk-created reservations from OTA
  // ingests and storefront/walk-in drafts. They confirm immediately — no
  // payment step gates a desk reservation (folios carry the charges); the
  // checkout/finalize saga confirms storefront bookings instead.
  "front-desk": createFrontDeskModule({
    persistStayBooking: (db, input, opts) =>
      persistConfirmedStayBooking(asPostgresDb(db), input, { ...opts, source: "direct" }),
  }),
  housekeeping: housekeepingModule,
  folios: foliosModule,
  channels: createChannelsModule({
    getConnectors: getChannelConnectors,
    persistStayBooking: (db, input, opts) =>
      persistStayBooking(asPostgresDb(db), input, { ...opts, source: "ota" }),
  }),
}

export const deploymentLocalModules: Record<string, ModuleFactory<OperatorCapabilities>> = {
  ...discoveredModules,
  ...pmsDomainModules,
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
}

export const operatorProjectRuntime = createGeneratedProjectRuntime()
const graphPrimitives = createOperatorWorkerRuntimeHostPrimitives(
  {} as CloudflareBindings,
  deliverOperatorGraphEvent,
)
const graphPorts = operatorProjectRuntime.createRuntimePorts({
  primitives: graphPrimitives,
  runtimePorts: {
    "smartbill.runtime-host": createOperatorSmartbillRuntimeHost(),
    [storageObjectRuntimePort.id]: { resolve: () => null },
  },
})
export const operatorGraphComposition = await composeVoyantGraphRuntime({
  runtime: operatorProjectRuntime.graphRuntime,
  ports: graphPorts,
  capabilities: buildOperatorProviders(),
})

const graphModuleFactories = Object.fromEntries(
  operatorGraphComposition.modules.map((module, index) => [
    `selected-graph-module:${index}:${module.module.name}`,
    () => module,
  ]),
) as CompositionRegistry<OperatorCapabilities>["modules"]

const graphExtensionFactories = Object.fromEntries(
  operatorGraphComposition.extensions.map((extension, index) => [
    `selected-graph-extension:${index}:${extension.extension.name}`,
    () => extension,
  ]),
) as CompositionRegistry<OperatorCapabilities>["extensions"]

/**
 * The full composed manifest + registry, derived from the selected graph plus
 * deployment-local additions. These exports remain for db-doctor parity and
 * composition tests.
 */
export const OPERATOR_RUNTIME_MANIFEST = {
  modules: [...Object.keys(graphModuleFactories), ...Object.keys(deploymentLocalModules)],
  extensions: [...Object.keys(graphExtensionFactories), ...Object.keys(deploymentLocalExtensions)],
} satisfies CompositionManifest

export const operatorComposition: CompositionRegistry<OperatorCapabilities> = {
  modules: { ...graphModuleFactories, ...deploymentLocalModules },
  extensions: { ...graphExtensionFactories, ...deploymentLocalExtensions },
}
