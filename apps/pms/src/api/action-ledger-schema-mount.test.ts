import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

describe("operator action ledger schema mounting", () => {
  it("keeps the action ledger schema in the migration schema set", () => {
    // drizzle.config consumes the generated manifest (derived from
    // voyant.config.ts), which must still include the action-ledger schema.
    const config = readFileSync(resolve(appRoot, "drizzle.config.ts"), "utf8")
    expect(config).toContain("./drizzle.schemas.generated.ts")

    const generated = readFileSync(resolve(appRoot, "drizzle.schemas.generated.ts"), "utf8")
    expect(generated).toContain("@voyant-travel+action-ledger")
    expect(generated).toContain("@voyant-travel/action-ledger/dist/schema.js")
  })

  it("keeps the action ledger migration in the framework bundle", () => {
    // The action ledger is package-owned: its CREATE TABLEs ship in the
    // framework migration bundle (collector source `framework`), not in the
    // deployment's own ./migrations folder (which holds only link tables +
    // custom modules since the single-folder collapse).
    const migration = readFileSync(
      resolve(
        appRoot,
        "node_modules/@voyant-travel/framework-migrations/migrations/0000_framework_baseline.sql",
      ),
      "utf8",
    )

    expect(migration).toContain('CREATE TABLE "action_ledger_entries"')
    expect(migration).toContain('CREATE TABLE "action_approvals"')
    expect(migration).toContain('CREATE TABLE "action_mutation_details"')
    expect(migration).toContain('CREATE TABLE "action_ledger_outbox"')
  })
})
