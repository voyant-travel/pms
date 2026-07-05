/**
 * End-to-end test of the deployment runner against the REAL operator package
 * sources, exercised on two database states:
 *
 *   • FRESH      — empty DB: every package source + the deployment execute;
 *                  no `framework/*` rows; the schema materialises.
 *   • SEEDED     — a DB already materialised by the retired monolithic bundle (we
 *                  seed it by executing the bundle + deployment, leaving inert
 *                  `framework/*` ledger rows). The runner must take the EXISTING
 *                  path, IMPORT-BASELINE the cutline (record without executing —
 *                  no duplicate-CREATE errors), leave the schema intact, and be
 *                  idempotent on re-run.
 *
 * Requires a CREATEDB-capable Postgres in `TEST_DATABASE_URL`; skips otherwise.
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  applyMigrations,
  type Cutline,
  discoverMigrationSources,
  loadFrameworkBundleSource,
  loadMigrationFolder,
  type MigrationSource,
  runDeploymentMigrations,
} from "@voyant-travel/framework-migrations"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { schema } from "../../drizzle.schemas.generated.ts"

const DB_URL = process.env.TEST_DATABASE_URL
const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), "..")
// The generated `../../packages/…` schema paths resolve from the deployment root.
const baseDir = join(scriptsDir, "..")

/** Read the committed cutline JSON directly — `loadCutline()` resolves it via
 *  `import.meta.url`, which Vitest's transform doesn't keep as a file URL. */
function readCutline(): Cutline {
  const p = join(
    scriptsDir,
    "..",
    "..",
    "..",
    "packages",
    "framework-migrations",
    "cutline.generated.json",
  )
  return (JSON.parse(readFileSync(p, "utf8")) as { cutline: Cutline }).cutline
}

const urlFor = (name: string) => {
  const u = new URL(DB_URL as string)
  u.pathname = `/${name}`
  return u.toString()
}

async function onDb<T>(name: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: urlFor(name) })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

async function loadRealSources(): Promise<MigrationSource[]> {
  const discovered = discoverMigrationSources(schema, {
    baseDir,
    deploymentMigrationsDir: join(baseDir, "migrations"),
  })
  const sources: MigrationSource[] = []
  for (let i = 0; i < discovered.length; i++) {
    const d = discovered[i]
    if (!d?.hasMigrations) continue
    sources.push({
      name: d.name,
      priority: i,
      migrations: await loadMigrationFolder(d.migrationsDir),
    })
  }
  return sources
}

/** The seed: monolithic bundle (priority 0) + deployment ./migrations (1). */
async function loadBundleSeedSources(): Promise<MigrationSource[]> {
  const bundle = await loadFrameworkBundleSource()
  const deployment: MigrationSource = {
    name: "deployment",
    priority: 1,
    migrations: await loadMigrationFolder(join(scriptsDir, "..", "migrations")),
  }
  return [bundle, deployment]
}

async function tableExists(c: Client, table: string): Promise<boolean> {
  const r = await c.query<{ reg: string | null }>(`SELECT to_regclass($1) AS reg`, [
    `public.${table}`,
  ])
  return r.rows[0]?.reg != null
}

async function ledgerCount(c: Client, where = ""): Promise<number> {
  const r = await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM drizzle._voyant_migrations${where ? ` WHERE ${where}` : ""}`,
  )
  return r.rows[0]?.n ?? 0
}

describe.skipIf(!DB_URL)("runDeploymentMigrations (real operator sources)", () => {
  let sources: MigrationSource[]
  let seedSources: MigrationSource[]
  let cutline: Cutline
  let admin: Client
  // Tables proving coverage: a package baseline + an onboarded-owner table.
  const probeTables = ["reference_airlines", "product_authoring_requests"]

  beforeAll(async () => {
    sources = await loadRealSources()
    seedSources = await loadBundleSeedSources()
    cutline = readCutline()
    admin = new Client({ connectionString: urlFor("postgres") })
    await admin.connect()
  }, 60_000)

  afterAll(async () => {
    await admin?.end()
  })

  async function withFreshDb(name: string, fn: () => Promise<void>): Promise<void> {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    await admin.query(`CREATE DATABASE "${name}"`)
    try {
      await fn()
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    }
  }

  it("FRESH: executes every source, records no framework rows, materialises the schema", async () => {
    await withFreshDb("d2_run_fresh", async () => {
      const result = await onDb("d2_run_fresh", (c) => runDeploymentMigrations(c, sources, cutline))
      expect(result.existing).toBe(false)
      expect(result.baselined).toHaveLength(0)
      const totalMigrations = sources.reduce((n, s) => n + s.migrations.length, 0)
      expect(result.executed).toHaveLength(totalMigrations)

      await onDb("d2_run_fresh", async (c) => {
        for (const t of probeTables) expect(await tableExists(c, t)).toBe(true)
        expect(await ledgerCount(c, `"source" = 'framework'`)).toBe(0)
        expect(await ledgerCount(c)).toBe(totalMigrations)
      })
    })
  }, 120_000)

  it("SEEDED: import-baselines the cutline without re-executing, schema intact, idempotent", async () => {
    await withFreshDb("d2_run_existing", async () => {
      // 1) Seed a realistic pre-collector database: execute the bundle + deployment and
      //    record framework/* + deployment/* ledger rows.
      await onDb("d2_run_existing", async (c) => {
        await applyMigrations(c, seedSources)
      })

      // 2) Run the runner. It must DETECT existing, import-baseline the
      //    cutline (record, not execute — re-running the CREATEs would throw
      //    "table already exists"), and execute only post-cutline increments.
      const result = await onDb("d2_run_existing", (c) =>
        runDeploymentMigrations(c, sources, cutline),
      )
      expect(result.existing).toBe(true)

      const cutlineTagCount = sources.reduce(
        (n, s) => n + s.migrations.filter((m) => (cutline[s.name] ?? []).includes(m.tag)).length,
        0,
      )
      expect(result.baselined).toHaveLength(cutlineTagCount)
      // Every current package migration is cutline-covered (the union proof), so
      // nothing executes on the transition; the deployment/* rows are already
      // recorded and are skipped.
      expect(result.executed).toHaveLength(0)

      await onDb("d2_run_existing", async (c) => {
        // framework history preserved as inert rows; cutline now recorded too.
        expect(await ledgerCount(c, `"source" = 'framework'`)).toBeGreaterThan(0)
        for (const t of probeTables) expect(await tableExists(c, t)).toBe(true)
      })

      // 3) Idempotent: a second run baselines/executes nothing more.
      const again = await onDb("d2_run_existing", (c) =>
        runDeploymentMigrations(c, sources, cutline),
      )
      expect(again.executed).toHaveLength(0)
      expect(again.baselined).toHaveLength(0)
    })
  }, 120_000)
})
