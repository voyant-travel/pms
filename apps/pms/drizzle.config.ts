import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"

// Schema list is DERIVED from voyant.config.ts (modules + additionalSchemas +
// starter-local schemas) and emitted to this committed file. Do not hand-edit
// the list — run `voyant db schemas --emit` (or `voyant db generate`) to
// refresh it; `voyant db doctor` fails if it drifts.
import { schema } from "./drizzle.schemas.generated.ts"

// This config describes the live AGGREGATE schema — it is `push`/`studio`/`check`
// /replay-oracle only. It does NOT generate migrations: the framework bundle is
// owned by @voyant-travel/framework-migrations, and the deployment's own
// migrations (`./migrations`) are generated via drizzle.deployment-migrations.config.ts.
// Do not run `drizzle-kit generate` against this config — use `pnpm db:generate`.
//
// Custom deployment modules/extensions (`src/{modules,extensions}/<name>/schema.ts`)
// extend the live aggregate schema beyond the generated standard set — so
// `push`/`studio`/`check` and the migration-replay oracle see them too. Empty
// until a deployment adds one; their migrations are emitted into the deployment
// source (`./migrations`).
const customDeploymentSchemas = ["./src/modules/*/schema.ts", "./src/extensions/*/schema.ts"]

// An explicitly-provided DATABASE_URL (CI, the migration-replay oracle, ad-hoc
// `DATABASE_URL=… pnpm db:push`) must WIN — `.dev.vars` is loaded with
// `override: true` for local `pnpm dev` ergonomics, but without this guard it
// silently clobbers the caller's DATABASE_URL and redirects every db command at
// the local dev DB. Capture the explicit value first, then restore it last.
const explicitDatabaseUrl = process.env.DATABASE_URL
config({ path: ".env" })
config({ path: "../../.env" })
config({ path: "../../.env.local" })
config({ path: ".dev.vars", override: true })
if (explicitDatabaseUrl) process.env.DATABASE_URL = explicitDatabaseUrl

function resolveDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? ""
}

export default defineConfig({
  schema: [...schema, ...customDeploymentSchemas],
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
})
