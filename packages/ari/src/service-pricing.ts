/**
 * Pricing service: CRUD over the module-owned `pms_rate_base` and
 * `pms_pricing_rules` tables, plus the preview/apply flows that turn base
 * prices + named rules into concrete nightly rates.
 *
 * `preview` is read-only: it computes what `apply` WOULD write and summarizes
 * the deltas so the UI can show a before/after panel. `apply` materializes via
 * the existing `bulkUpsertRates` bulk op (chunked ≤2000 ops/call to stay under
 * Postgres' bind-parameter ceiling), OVERWRITING the daily rates in the range
 * for the scoped (rate plan × room type) pairs — the day-level calendar remains
 * the after-the-fact exception surface.
 *
 * Cross-entity refs are loose text columns, so property existence is checked in
 * the service layer (mirroring `service-crud.ts`).
 */

import { ratePlanDailyRates } from "@voyant-travel/accommodations/schema"
import { and, asc, count, eq, gte, inArray, lte, type SQL } from "drizzle-orm"

import { expandDates } from "./date-mask.js"
import type { AriDb } from "./db.js"
import {
  computeNightlyPrice,
  materializePlan,
  type PricingRule,
  type RateBase,
} from "./pricing-engine.js"
import { pricingRules, rateBases } from "./schema.js"
import { bulkUpsertRates } from "./service-calendar.js"
import { assertPropertyExists } from "./service-crud.js"
import type {
  InsertPricingRuleInput,
  PricingHorizonInput,
  PricingRuleListQuery,
  UpdatePricingRuleInput,
  UpsertRateBaseInput,
} from "./validation.js"

const APPLY_CHUNK = 2000

/** Drop `undefined` keys so a PATCH only writes the fields the caller sent. */
function definedOnly<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

// --- base rates --------------------------------------------------------------

export async function listRateBases(db: AriDb, propertyId: string) {
  return db
    .select()
    .from(rateBases)
    .where(eq(rateBases.propertyId, propertyId))
    .orderBy(asc(rateBases.createdAt))
}

/** Create-or-update the base price for a (rate plan × room type) pair. */
export async function upsertRateBase(db: AriDb, input: UpsertRateBaseInput) {
  await assertPropertyExists(db, input.propertyId)
  const [row] = await db
    .insert(rateBases)
    .values(input)
    .onConflictDoUpdate({
      target: [rateBases.ratePlanId, rateBases.roomTypeId],
      set: {
        currency: input.currency,
        baseAmountCents: input.baseAmountCents,
        propertyId: input.propertyId,
        updatedAt: new Date(),
      },
    })
    .returning()
  return row
}

export async function deleteRateBase(db: AriDb, id: string) {
  const [row] = await db.delete(rateBases).where(eq(rateBases.id, id)).returning()
  return row ?? null
}

// --- pricing rules -----------------------------------------------------------

export async function listPricingRules(db: AriDb, query: PricingRuleListQuery) {
  const clauses: SQL[] = []
  if (query.propertyId) clauses.push(eq(pricingRules.propertyId, query.propertyId))
  if (query.active !== undefined) clauses.push(eq(pricingRules.active, query.active))
  const where = clauses.length ? and(...clauses) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(pricingRules)
      .where(where)
      .orderBy(asc(pricingRules.priority), asc(pricingRules.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(pricingRules).where(where),
  ])
  return { data: rows, total, limit: query.limit, offset: query.offset }
}

export async function getPricingRule(db: AriDb, id: string) {
  const [row] = await db.select().from(pricingRules).where(eq(pricingRules.id, id)).limit(1)
  return row ?? null
}

export async function createPricingRule(db: AriDb, input: InsertPricingRuleInput) {
  await assertPropertyExists(db, input.propertyId)
  const [row] = await db
    .insert(pricingRules)
    .values({
      propertyId: input.propertyId,
      name: input.name,
      kind: input.kind,
      fromDate: input.fromDate ?? null,
      toDate: input.toDate ?? null,
      weekdays: input.weekdays ?? null,
      adjustmentType: input.adjustmentType,
      adjustmentValue: input.adjustmentValue,
      roomTypeIds: input.roomTypeIds ?? null,
      ratePlanIds: input.ratePlanIds ?? null,
      priority: input.priority ?? 0,
      active: input.active ?? true,
    })
    .returning()
  return row
}

export async function updatePricingRule(db: AriDb, id: string, input: UpdatePricingRuleInput) {
  const [row] = await db
    .update(pricingRules)
    .set({ ...definedOnly(input), updatedAt: new Date() })
    .where(eq(pricingRules.id, id))
    .returning()
  return row ?? null
}

export async function deletePricingRule(db: AriDb, id: string) {
  const [row] = await db.delete(pricingRules).where(eq(pricingRules.id, id)).returning()
  return row ?? null
}

// --- preview / apply ---------------------------------------------------------

/** Map a stored rule row to the engine shape. */
function toEngineRule(row: typeof pricingRules.$inferSelect): PricingRule {
  return {
    kind: row.kind,
    fromDate: row.fromDate,
    toDate: row.toDate,
    weekdays: row.weekdays,
    adjustmentType: row.adjustmentType,
    adjustmentValue: row.adjustmentValue,
    ratePlanIds: row.ratePlanIds,
    roomTypeIds: row.roomTypeIds,
    priority: row.priority,
    active: row.active,
  }
}

/** Map a stored base row to the engine shape. */
function toEngineBase(row: typeof rateBases.$inferSelect): RateBase {
  return {
    ratePlanId: row.ratePlanId,
    roomTypeId: row.roomTypeId,
    currency: row.currency,
    baseAmountCents: row.baseAmountCents,
  }
}

async function loadPricingInputs(db: AriDb, propertyId: string) {
  await assertPropertyExists(db, propertyId)
  const [baseRows, ruleRows] = await Promise.all([
    db.select().from(rateBases).where(eq(rateBases.propertyId, propertyId)),
    db
      .select()
      .from(pricingRules)
      .where(and(eq(pricingRules.propertyId, propertyId), eq(pricingRules.active, true)))
      .orderBy(asc(pricingRules.priority), asc(pricingRules.createdAt)),
  ])
  return {
    bases: baseRows.map(toEngineBase),
    rules: ruleRows.map(toEngineRule),
  }
}

export interface PreviewPair {
  ratePlanId: string
  roomTypeId: string
  currency: string
  baseAmountCents: number
  datesTotal: number
  datesChanged: number
  minBefore: number | null
  maxBefore: number | null
  minAfter: number | null
  maxAfter: number | null
  sample: { date: string; before: number | null; after: number }[]
}

export interface PreviewResult {
  propertyId: string
  from: string
  to: string
  datesTotal: number
  totalDatesChanged: number
  pairs: PreviewPair[]
}

const SAMPLE_SIZE = 14

/**
 * Compute (without writing) what applying the current bases + active rules over
 * `from..to` would produce, and summarize the before/after deltas per pair.
 */
export async function previewPricing(
  db: AriDb,
  input: PricingHorizonInput,
): Promise<PreviewResult> {
  const dates = expandDates(input.from, input.to)
  const { bases, rules } = await loadPricingInputs(db, input.propertyId)

  const existing = await loadExistingRates(db, bases, input.from, input.to)

  const pairs: PreviewPair[] = []
  let totalDatesChanged = 0
  for (const base of bases) {
    let datesChanged = 0
    let minBefore: number | null = null
    let maxBefore: number | null = null
    let minAfter: number | null = null
    let maxAfter: number | null = null
    const sample: PreviewPair["sample"] = []
    for (const date of dates) {
      const after = computeNightlyPrice(base, rules, date)
      const before = existing.get(`${base.ratePlanId}|${base.roomTypeId}|${date}`) ?? null
      if (before !== after) datesChanged++
      if (before !== null) {
        minBefore = minBefore === null ? before : Math.min(minBefore, before)
        maxBefore = maxBefore === null ? before : Math.max(maxBefore, before)
      }
      minAfter = minAfter === null ? after : Math.min(minAfter, after)
      maxAfter = maxAfter === null ? after : Math.max(maxAfter, after)
      if (sample.length < SAMPLE_SIZE) sample.push({ date, before, after })
    }
    totalDatesChanged += datesChanged
    pairs.push({
      ratePlanId: base.ratePlanId,
      roomTypeId: base.roomTypeId,
      currency: base.currency,
      baseAmountCents: base.baseAmountCents,
      datesTotal: dates.length,
      datesChanged,
      minBefore,
      maxBefore,
      minAfter,
      maxAfter,
      sample,
    })
  }

  return {
    propertyId: input.propertyId,
    from: input.from,
    to: input.to,
    datesTotal: dates.length,
    totalDatesChanged,
    pairs,
  }
}

/** Load existing daily sell prices keyed by `plan|room|date` for the horizon. */
async function loadExistingRates(
  db: AriDb,
  bases: readonly RateBase[],
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const roomTypeIds = [...new Set(bases.map((b) => b.roomTypeId))]
  const ratePlanIds = [...new Set(bases.map((b) => b.ratePlanId))]
  const map = new Map<string, number>()
  if (roomTypeIds.length === 0 || ratePlanIds.length === 0) return map
  const rows = await db
    .select({
      ratePlanId: ratePlanDailyRates.ratePlanId,
      roomTypeId: ratePlanDailyRates.roomTypeId,
      date: ratePlanDailyRates.date,
      sellAmountCents: ratePlanDailyRates.sellAmountCents,
    })
    .from(ratePlanDailyRates)
    .where(
      and(
        inArray(ratePlanDailyRates.roomTypeId, roomTypeIds),
        inArray(ratePlanDailyRates.ratePlanId, ratePlanIds),
        gte(ratePlanDailyRates.date, from),
        lte(ratePlanDailyRates.date, to),
      ),
    )
  for (const r of rows) {
    map.set(`${r.ratePlanId}|${r.roomTypeId}|${r.date}`, r.sellAmountCents)
  }
  return map
}

export interface ApplyResult {
  propertyId: string
  from: string
  to: string
  pairs: number
  upserted: number
}

/**
 * Materialize the current bases + active rules over `from..to` into
 * `rate_plan_daily_rates`. OVERWRITES existing daily rates for the scoped pairs
 * in the range. Chunked to stay under Postgres' bind-parameter ceiling.
 */
export async function applyPricing(db: AriDb, input: PricingHorizonInput): Promise<ApplyResult> {
  const { bases, rules } = await loadPricingInputs(db, input.propertyId)
  const ops = materializePlan(bases, rules, input.from, input.to)
  let upserted = 0
  for (let i = 0; i < ops.length; i += APPLY_CHUNK) {
    const res = await bulkUpsertRates(db, ops.slice(i, i + APPLY_CHUNK))
    upserted += res.upserted
  }
  return {
    propertyId: input.propertyId,
    from: input.from,
    to: input.to,
    pairs: bases.length,
    upserted,
  }
}
