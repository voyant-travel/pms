/**
 * Deployment migration runner — D.2 package-owned migrations + topological
 * collector (`@voyant-travel/framework-migrations`). Each schema-owning package
 * SHIPS its own drizzle `migrations/` folder; this runner discovers them from
 * the same generated list `drizzle.config.ts` consumes
 * (`drizzle.schemas.generated.ts` ← `voyant.config.ts`), orders them deps-first
 * by `voyant.requiresSchemas`, and applies:
 *
 *   1. each package source (topological order — a package's deps migrate first)
 *   2. this deployment's own `./migrations` (cross-module link tables + any
 *      custom `src/{modules,extensions}` schema) LAST — they FK into package tables
 *
 * recording each in the `drizzle._voyant_migrations` ledger keyed by
 * `(source, tag, content_hash)`. The retired framework bundle is NO LONGER a
 * source; any `framework/*` ledger rows are left untouched as inert history.
 *
 * Two paths, auto-detected (see {@link runDeploymentMigrations}):
 *   • FRESH    — execute every source.
 *   • EXISTING — a pre-D.2 DB whose schema D.1's bundle or the legacy runner
 *                already materialised: import-baseline the cutline (record
 *                without executing, gated by a parity check), execute increments.
 *
 * See docs/architecture/migration-collector-d2.md.
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  discoverMigrationSources,
  loadCutline,
  loadMigrationFolder,
  type MigrationSource,
  runDeploymentMigrations,
} from "@voyant-travel/framework-migrations"
import { config } from "dotenv"
import { Client } from "pg"
import { schema } from "../drizzle.schemas.generated.ts"

const explicitDatabaseUrl = process.env.DATABASE_URL
config({ path: ".env" })
config({ path: "../../.env" })
config({ path: "../../.env.local" })
config({ path: ".dev.vars", override: true })
// An explicitly-provided DATABASE_URL (CI, the migration-replay oracle, ad-hoc
// runs) must WIN over `.dev.vars` (loaded with `override: true` for local-dev
// ergonomics), which would otherwise redirect every run at the local dev DB.
if (explicitDatabaseUrl) process.env.DATABASE_URL = explicitDatabaseUrl

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set")
}

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
// The generated schema paths (`../../packages/…`) resolve from the deployment
// root, where `drizzle.config` lives; the deployment's own migrations are `./migrations`.
const baseDir = path.resolve(scriptsDir, "..")
const client = new Client({ connectionString: databaseUrl })

try {
  await client.connect()

  // Discover package sources (deps-first) + the deployment's ./migrations (last).
  const discovered = discoverMigrationSources(schema, {
    baseDir,
    deploymentMigrationsDir: path.join(baseDir, "migrations"),
  })
  const sources: MigrationSource[] = []
  for (let i = 0; i < discovered.length; i++) {
    const d = discovered[i] as (typeof discovered)[number]
    if (!d.hasMigrations) {
      // A schema-owning source with no migrations folder is a packaging gap. CI's
      // D.2 union reverse-coverage verifier guards against this; warn and skip so
      // the runner stays usable rather than crashing mid-deploy.
      console.warn(`⚠️  migration source '${d.name}' has no migrations folder — skipping.`)
      continue
    }
    sources.push({
      name: d.name,
      priority: i, // discovery order: deps-first, deployment last
      migrations: await loadMigrationFolder(d.migrationsDir),
    })
  }

  const cutline = await loadCutline()
  const { existing, executed, baselined } = await runDeploymentMigrations(
    client,
    sources,
    cutline,
    {
      onApplied: (id) => console.log(`✓ applied ${id}`),
      onBaselined: (id) => console.log(`▷ baselined ${id}`),
    },
  )

  if (existing && baselined.length > 0) {
    console.log(
      "(existing pre-D.2 deployment — cutline import-baselined onto the collector ledger.)",
    )
  }

  const total = executed.length + baselined.length
  if (total === 0) {
    console.log("No pending migrations.")
  } else {
    console.log("")
    console.log(
      `Recorded ${total} migration(s) — ${executed.length} executed, ${baselined.length} baselined.`,
    )
    if (executed.length > 0) {
      // Postgres drivers cache prepared-statement plans per connection. Long-lived
      // workers / dev servers started before this run hold stale plans referencing
      // the old schema and will fail on the first query that touches a changed
      // column. Tell the caller to restart them.
      console.log("⚠️  Restart any long-lived workers / dev servers now —")
      console.log("    drizzle's prepared-statement cache is keyed to the old schema.")
    }
  }
} finally {
  await client.end()
}
