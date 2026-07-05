/**
 * One-time backfill for the custom-fields unification (ADR:
 * docs/architecture/custom-fields-unification-adr.md). Moves existing
 * `custom_field_values` rows into each entity's `custom_fields` jsonb column —
 * the unified store the value API now reads/writes. Run ONCE during the upgrade,
 * after `voyant db migrate` (which adds the columns) and after deploying the
 * repointed value API:
 *
 *     DATABASE_URL=… tsx scripts/backfill-custom-fields.ts
 *
 * Idempotent + safe: each entity's existing `custom_fields` keys WIN over the
 * backfilled ones (`backfilled || current`), so re-running never clobbers a
 * value written through the new path. The typed value columns collapse to the
 * same single jsonb representation the value API uses.
 */
import { config } from "dotenv"
import { Client } from "pg"

config({ path: ".env" })
config({ path: "../../.env" })
config({ path: "../../.env.local" })
config({ path: ".dev.vars", override: true })

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set")
}

// entity_type → physical table (must match custom-fields-value-mapping.ts).
const ENTITY_TABLES: Record<string, string> = {
  person: "people",
  organization: "organizations",
  activity: "activities",
  quote: "quotes",
}

/**
 * Per-`field_type` SQL that collapses the typed value columns to one jsonb value
 * (mirrors `jsonbValueFromTyped`). `v` is a `custom_field_values` row, `d` its
 * definition.
 */
const VALUE_EXPR = `
  CASE d.field_type
    WHEN 'monetary' THEN jsonb_build_object('amountCents', v.monetary_value_cents, 'currency', v.currency_code)
    WHEN 'double'   THEN to_jsonb(v.number_value)
    WHEN 'boolean'  THEN to_jsonb(v.boolean_value)
    WHEN 'date'     THEN to_jsonb(v.date_value::text)
    WHEN 'set'      THEN v.json_value
    WHEN 'json'     THEN v.json_value
    WHEN 'address'  THEN v.json_value
    ELSE to_jsonb(v.text_value)
  END`

const client = new Client({ connectionString: databaseUrl })

try {
  await client.connect()

  // No-op cleanly if the legacy table is already gone (post-retirement re-run).
  const { rows: tableExists } = await client.query<{ reg: string | null }>(
    "SELECT to_regclass('public.custom_field_values') AS reg",
  )
  if (!tableExists[0]?.reg) {
    console.log("custom_field_values no longer exists — nothing to backfill.")
  } else {
    let total = 0
    for (const [entityType, table] of Object.entries(ENTITY_TABLES)) {
      const result = await client.query(
        `UPDATE "${table}" t
           SET custom_fields = sub.cf || t.custom_fields,
               updated_at = now()
         FROM (
           SELECT v.entity_id, jsonb_object_agg(d.key, ${VALUE_EXPR}) AS cf
           FROM custom_field_values v
           JOIN custom_field_definitions d ON d.id = v.definition_id
           WHERE v.entity_type = $1
           GROUP BY v.entity_id
         ) sub
         WHERE t.id = sub.entity_id`,
        [entityType],
      )
      const n = result.rowCount ?? 0
      total += n
      console.log(`  ${entityType}: backfilled ${n} ${table} row(s)`)
    }
    console.log(`\nBackfill complete (${total} entity row(s) updated).`)

    if (process.argv.includes("--clear")) {
      // Values are now on the entity rows — empty the side table so the guarded
      // retirement migration (DROP custom_field_values) can proceed.
      const cleared = await client.query("DELETE FROM custom_field_values")
      console.log(`Cleared ${cleared.rowCount ?? 0} custom_field_values row(s).`)
    } else {
      console.log(
        "Verify the entity custom_fields columns, then re-run with --clear to empty\n" +
          "custom_field_values so the retirement migration can drop it.",
      )
    }
  }
} finally {
  await client.end()
}
