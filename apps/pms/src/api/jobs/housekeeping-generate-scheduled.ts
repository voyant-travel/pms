/**
 * Housekeeping auto-generation — Cloudflare Workers cron entrypoint that runs the
 * idempotent task generation (departures → clean, stayovers → turndown; departed
 * units marked dirty) for every property, for the current business date (PLAN
 * §4.3). Idempotent per (unit, date) via the tasks' unique `source_key`, so a
 * re-run — or an overlap with a manual `POST /generate` — is a no-op.
 */

import { properties } from "@voyant-travel/operations/places"
import { generateTasksForDate } from "@voyant-travel/pms-housekeeping"
import { formatIsoDate } from "@voyant-travel/pms-units"
import { withDbFromEnv } from "../lib/db"

export { HOUSEKEEPING_GENERATE_CRON } from "../../scheduled-crons"

export interface HousekeepingGenerateResult {
  date: string
  properties: number
  inserted: number
  markedDirty: number
}

export async function runScheduledHousekeepingGenerate(
  _event: ScheduledController,
  env: CloudflareBindings,
): Promise<HousekeepingGenerateResult> {
  const date = formatIsoDate(new Date())
  return withDbFromEnv(env, async (db) => {
    const rows = await db.select({ id: properties.id }).from(properties)
    let inserted = 0
    let markedDirty = 0
    for (const { id } of rows) {
      const result = await generateTasksForDate(db, id, date)
      inserted += result.inserted
      markedDirty += result.markedDirty
    }
    return { date, properties: rows.length, inserted, markedDirty }
  })
}
