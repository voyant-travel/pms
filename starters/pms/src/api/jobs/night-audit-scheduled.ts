/**
 * Night audit — Cloudflare Workers cron entrypoint that runs the idempotent
 * per-night posting + business-date roll (PLAN §4.4) for every property, each at
 * its own current business date. Postings are idempotent per (bookingItem, date)
 * via the postings' unique `source_key`, so a re-run — or an overlap with a manual
 * `POST /night-audit/run` — is a no-op.
 */

import { properties } from "@voyant-travel/operations/places"

import { runNightAudit } from "@voyant-travel/pms-folios"
import { withDbFromEnv } from "../lib/db"

export { NIGHT_AUDIT_CRON } from "../../scheduled-crons"

export interface NightAuditScheduledResult {
  properties: number
  posted: number
  unpriced: number
}

export async function runScheduledNightAudit(
  _event: ScheduledController,
  env: CloudflareBindings,
): Promise<NightAuditScheduledResult> {
  return withDbFromEnv(env, async (db) => {
    const rows = await db.select({ id: properties.id }).from(properties)
    let posted = 0
    let unpriced = 0
    for (const { id } of rows) {
      const result = await runNightAudit(db, id)
      posted += result.posted
      unpriced += result.unpriced.length
    }
    return { properties: rows.length, posted, unpriced }
  })
}
