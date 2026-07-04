import { defineVoyantConfig } from "@voyant-travel/core/config"

/**
 * voyant.config.ts — manifest powering CLI tooling (generators, link-table
 * sync, schema resolution, admin composition). Standard runtime composition is
 * owned by `@voyant-travel/framework`; deployment-local additions are appended
 * through `createVoyantApp` in `src/api/app.ts`.
 */
export default defineVoyantConfig({
  deployment: "cloudflare-worker",
  projectConfig: {
    database: { urlEnv: "DATABASE_URL", adapter: "serverless" },
    cache: { provider: "kv", binding: "CACHE" },
    auth: { provider: "better-auth" },
  },
  admin: { enabled: true, path: "/app" },
  // Mounted Hono modules that own migrated schema. Route-only modules that own
  // no tables are mounted by runtime composition rather than schema discovery.
  modules: [
    "@voyant-travel/action-ledger",
    "@voyant-travel/relationships",
    "@voyant-travel/quotes",
    "@voyant-travel/identity",
    "@voyant-travel/distribution",
    "@voyant-travel/inventory",
    "@voyant-travel/commerce",
    "@voyant-travel/catalog",
    "@voyant-travel/bookings",
    "@voyant-travel/finance",
    "@voyant-travel/operations",
    "@voyant-travel/notifications",
    // Flights: schema is migrated and the admin surface is package-delivered
    // (@voyant-travel/flights-react/admin); the API routes are still mounted
    // app-locally in src/api/flights.ts rather than as the package's Hono
    // module.
    "@voyant-travel/flights",
    "@voyant-travel/legal",
    "@voyant-travel/storefront",
    "@voyant-travel/trips",
    // Operator-tenant settings (profile + payment + booking-tax) — a standard
    // module: schema-owning + routes mounted via the framework composition.
    "@voyant-travel/operator-settings",
    // Accommodations — now a standard runtime module (voyant#1489): room blocks
    // are mounted via the framework composition (accommodationsHonoModule), and
    // its schema (incl. room_blocks) is migrated.
    "@voyant-travel/accommodations",
    // MICE group-program spine (voyant#1489) — deployment-local (niche),
    // mounted via createVoyantApp's deploymentLocalModules. Listed here so its
    // schema (mice_programs) is discovered for migration generation.
    "@voyant-travel/mice",
  ],
  plugins: ["@voyant-travel/plugin-smartbill"],
  // Mounted Hono extensions that own migrated schema.
  extensions: ["@voyant-travel/catalog-authoring"],
  // Schema this template migrates but does not mount as a module or extension:
  //  - workflow-runs: only its admin routes are mounted, not a module
  //  - charters / cruises: schema migrated ahead of route mounting
  additionalSchemas: [
    "@voyant-travel/availability",
    "@voyant-travel/workflow-runs",
    "@voyant-travel/charters",
    "@voyant-travel/cruises",
  ],
  // Template-local Drizzle schema(s) owned by no package: the generated
  // cross-module link tables (folded into the migration history instead of
  // applied out-of-band via sync-links — regenerate with
  // `voyant db sync-links --emit-drizzle`).
  schemas: ["./drizzle.links.generated.ts"],
  featureFlags: {
    links_enabled: true,
    query_graph: true,
  },
})
