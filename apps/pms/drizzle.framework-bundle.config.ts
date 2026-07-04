/**
 * Generates the D.1 standard-profile aggregate migration bundle shipped by
 * @voyant-travel/framework-migrations. Schema = the operator reference profile's
 * package-owned schemas (drizzle.schemas.generated.ts) MINUS the deployment-local
 * cross-module link tables (those stay a deployment migration source). Regenerate
 * with `node scripts/generate-framework-migration-bundle.mjs`.
 */
import { defineConfig } from "drizzle-kit"
import { schema } from "./drizzle.schemas.generated.ts"

export default defineConfig({
  schema: [...schema].filter((s) => !s.includes("drizzle.links.generated")),
  out: "../../packages/framework-migrations/migrations",
  dialect: "postgresql",
})
