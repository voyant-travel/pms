/**
 * Generates the *deployment* migration source (`./migrations`) — applied AFTER
 * the framework bundle by the collector (these are deployment-owned; they span
 * modules or are deployment-local, so they can't be package-owned). Two kinds:
 *
 *   1. cross-module link (pivot) tables (`drizzle.links.generated.ts`);
 *   2. **custom deployment modules** dropped in `src/modules/<name>/schema.ts`
 *      (the "build your own module" seam) — the glob is empty until a deployment
 *      adds one.
 *
 * Regenerate with `pnpm -C starters/operator db:generate:deployment` (alias for
 * `drizzle-kit generate --config=drizzle.deployment-migrations.config.ts`).
 */
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: [
    "./drizzle.links.generated.ts",
    // Graduated PMS domain packages (PLAN §3.1). `packages/ari` owns no schema
    // (it authors upstream accommodations tables), so the glob simply skips it.
    "../../packages/*/src/schema.ts",
    // App-local module/extension prototypes (the "build your own module" seam) —
    // empty until a deployment adds one; graduate them to `packages/*` when they
    // settle.
    "./src/modules/*/schema.ts",
    "./src/extensions/*/schema.ts",
  ],
  out: "./migrations",
  dialect: "postgresql",
})
