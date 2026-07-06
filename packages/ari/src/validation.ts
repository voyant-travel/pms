/**
 * Request validation schemas for the ARI (availability, rates & inventory)
 * authoring module. These describe the admin write/query contracts over the
 * upstream `@voyant-travel/accommodations` inventory tables; they are the single
 * source of truth for the shapes the routes parse via `parseJsonBody` /
 * `parseQuery`, and are re-exported from the module `index.ts` so the admin UI
 * half can import the inferred types.
 */

import { paginationSchema } from "@voyant-travel/types"
import { z } from "zod"

/** A loose TypeID reference column (cross-entity refs are plain text upstream). */
const typeid = z.string().min(1)
/** ISO-4217 currency code — stored verbatim upstream. */
const currency = z.string().length(3)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
const nonNegativeInt = z.number().int().min(0)
const cents = z.number().int()

/** Query-string boolean: only the literal strings `"true"` / `"false"`. */
const booleanQuery = z.enum(["true", "false"]).transform((value) => value === "true")

export const inventoryModeSchema = z.enum(["pooled", "serialized", "virtual"])
export const chargeFrequencySchema = z.enum([
  "per_night",
  "per_stay",
  "per_person_per_night",
  "per_person_per_stay",
])
export const guaranteeModeSchema = z.enum([
  "none",
  "card_hold",
  "deposit",
  "full_prepay",
  "on_request",
])
/** Occupancy basis the upstream read path understands (see service-owned-stays). */
export const occupancyBasisSchema = z.enum(["room", "per_person"])
/** ISO weekday: 1 = Monday … 7 = Sunday. */
export const weekdaySchema = z.number().int().min(1).max(7)

const metadata = z.record(z.string(), z.unknown())

// --- room types --------------------------------------------------------------

export const insertRoomTypeSchema = z.object({
  propertyId: typeid,
  supplierId: typeid.nullish(),
  code: z.string().min(1).nullish(),
  name: z.string().min(1),
  description: z.string().nullish(),
  inventoryMode: inventoryModeSchema.default("pooled"),
  roomClass: z.string().nullish(),
  maxAdults: nonNegativeInt.nullish(),
  maxChildren: nonNegativeInt.nullish(),
  maxInfants: nonNegativeInt.nullish(),
  standardOccupancy: nonNegativeInt.nullish(),
  maxOccupancy: nonNegativeInt.nullish(),
  minOccupancy: nonNegativeInt.nullish(),
  bedroomCount: nonNegativeInt.nullish(),
  bathroomCount: nonNegativeInt.nullish(),
  areaValue: nonNegativeInt.nullish(),
  areaUnit: z.string().nullish(),
  accessibilityNotes: z.string().nullish(),
  smokingAllowed: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  metadata: metadata.nullish(),
})
// propertyId is immutable — a room type never moves property.
export const updateRoomTypeSchema = insertRoomTypeSchema.partial().omit({ propertyId: true })

export const roomTypeListQuerySchema = paginationSchema.extend({
  propertyId: typeid.optional(),
  inventoryMode: inventoryModeSchema.optional(),
  active: booleanQuery.optional(),
})

// --- room type bed configs (nested under a room type) ------------------------

export const insertBedConfigSchema = z.object({
  bedType: z.string().min(1),
  quantity: z.number().int().min(1).optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().nullish(),
})
export const updateBedConfigSchema = insertBedConfigSchema.partial()

// --- meal plans --------------------------------------------------------------

export const insertMealPlanSchema = z.object({
  propertyId: typeid,
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullish(),
  includesBreakfast: z.boolean().optional(),
  includesLunch: z.boolean().optional(),
  includesDinner: z.boolean().optional(),
  includesDrinks: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  metadata: metadata.nullish(),
})
export const updateMealPlanSchema = insertMealPlanSchema.partial().omit({ propertyId: true })

export const mealPlanListQuerySchema = paginationSchema.extend({
  propertyId: typeid.optional(),
  active: booleanQuery.optional(),
})

// --- rate plans --------------------------------------------------------------

export const insertRatePlanSchema = z.object({
  propertyId: typeid,
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullish(),
  mealPlanId: typeid.nullish(),
  priceCatalogId: z.string().nullish(),
  cancellationPolicyId: z.string().nullish(),
  marketId: z.string().nullish(),
  currencyCode: currency,
  chargeFrequency: chargeFrequencySchema.default("per_night"),
  guaranteeMode: guaranteeModeSchema.default("none"),
  commissionable: z.boolean().optional(),
  refundable: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  customerPaymentPolicy: z.unknown().nullish(),
  metadata: metadata.nullish(),
})
export const updateRatePlanSchema = insertRatePlanSchema.partial().omit({ propertyId: true })

export const ratePlanListQuerySchema = paginationSchema.extend({
  propertyId: typeid.optional(),
  mealPlanId: typeid.optional(),
  active: booleanQuery.optional(),
})

// --- rate plan ↔ room type joins (nested under a rate plan) ------------------

export const insertRatePlanRoomTypeSchema = z.object({
  roomTypeId: typeid,
  productId: z.string().nullish(),
  optionId: z.string().nullish(),
  unitId: z.string().nullish(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

// --- calendar: read grid -----------------------------------------------------

export const calendarQuerySchema = z.object({
  propertyId: typeid,
  from: isoDate,
  to: isoDate,
})

// --- calendar: bulk rate upsert ----------------------------------------------

export const bulkRateOperationSchema = z.object({
  ratePlanId: typeid,
  roomTypeId: typeid,
  from: isoDate,
  to: isoDate,
  weekdays: z.array(weekdaySchema).max(7).optional(),
  sellCurrency: currency,
  sellAmountCents: cents,
  costCurrency: currency.nullish(),
  costAmountCents: cents.nullish(),
  taxAmountCents: cents.nullish(),
  feeAmountCents: cents.nullish(),
  occupancyBasis: occupancyBasisSchema.optional(),
  includedAdults: nonNegativeInt.optional(),
  includedChildren: nonNegativeInt.optional(),
  includedInfants: nonNegativeInt.optional(),
  metadata: metadata.nullish(),
})
export const bulkRatesInputSchema = z.object({
  operations: z.array(bulkRateOperationSchema).min(1).max(200),
})

// --- calendar: bulk inventory upsert -----------------------------------------

export const bulkInventoryOperationSchema = z.object({
  roomTypeId: typeid,
  from: isoDate,
  to: isoDate,
  weekdays: z.array(weekdaySchema).max(7).optional(),
  capacity: nonNegativeInt,
  closed: z.boolean().optional(),
  metadata: metadata.nullish(),
})
export const bulkInventoryInputSchema = z.object({
  operations: z.array(bulkInventoryOperationSchema).min(1).max(200),
})

// --- pricing: base rates -----------------------------------------------------

/**
 * Upsert a base "starting from" nightly price for a (rate plan × room type)
 * pair. Idempotent on the pair so the grid can create-or-update a cell in one
 * call.
 */
export const upsertRateBaseSchema = z.object({
  propertyId: typeid,
  ratePlanId: typeid,
  roomTypeId: typeid,
  currency,
  baseAmountCents: nonNegativeInt,
})

export const rateBaseListQuerySchema = z.object({
  propertyId: typeid,
})

// --- pricing: rules ----------------------------------------------------------

export const pricingRuleKindSchema = z.enum(["season", "weekday"])
export const pricingAdjustmentTypeSchema = z.enum(["percent", "absolute", "set"])

/**
 * A named season / weekday pricing rule. Cross-field invariants:
 *   - `season` rules require both `fromDate` and `toDate`.
 *   - `weekday` rules require a non-empty `weekdays` mask.
 * Scope arrays are `null`/omitted = "all rate plans / room types".
 */
const pricingRuleShape = {
  propertyId: typeid,
  name: z.string().min(1),
  kind: pricingRuleKindSchema,
  fromDate: isoDate.nullish(),
  toDate: isoDate.nullish(),
  weekdays: z.array(weekdaySchema).min(1).max(7).nullish(),
  adjustmentType: pricingAdjustmentTypeSchema,
  adjustmentValue: z.number().int(),
  roomTypeIds: z.array(typeid).min(1).nullish(),
  ratePlanIds: z.array(typeid).min(1).nullish(),
  priority: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
}

/** Enforce the kind-specific invariants (shared by insert + update-with-kind). */
function refinePricingRule(
  data: {
    kind?: "season" | "weekday"
    fromDate?: string | null
    toDate?: string | null
    weekdays?: number[] | null
  },
  ctx: z.RefinementCtx,
): void {
  if (data.kind === "season") {
    if (!data.fromDate || !data.toDate) {
      ctx.addIssue({
        code: "custom",
        message: "season rules require both fromDate and toDate",
        path: ["fromDate"],
      })
    } else if (data.toDate < data.fromDate) {
      ctx.addIssue({
        code: "custom",
        message: "toDate must not precede fromDate",
        path: ["toDate"],
      })
    }
  }
  if (data.kind === "weekday" && (!data.weekdays || data.weekdays.length === 0)) {
    ctx.addIssue({
      code: "custom",
      message: "weekday rules require a non-empty weekdays mask",
      path: ["weekdays"],
    })
  }
}

export const insertPricingRuleSchema = z.object(pricingRuleShape).superRefine(refinePricingRule)

export const updatePricingRuleSchema = z
  .object(pricingRuleShape)
  .omit({ propertyId: true })
  .partial()
  .superRefine(refinePricingRule)

export const pricingRuleListQuerySchema = paginationSchema.extend({
  propertyId: typeid.optional(),
  active: booleanQuery.optional(),
})

// --- pricing: preview / apply ------------------------------------------------

export const pricingHorizonSchema = z.object({
  propertyId: typeid,
  from: isoDate,
  to: isoDate,
})

export type InsertRoomTypeInput = z.infer<typeof insertRoomTypeSchema>
export type UpdateRoomTypeInput = z.infer<typeof updateRoomTypeSchema>
export type RoomTypeListQuery = z.infer<typeof roomTypeListQuerySchema>
export type InsertBedConfigInput = z.infer<typeof insertBedConfigSchema>
export type UpdateBedConfigInput = z.infer<typeof updateBedConfigSchema>
export type InsertMealPlanInput = z.infer<typeof insertMealPlanSchema>
export type UpdateMealPlanInput = z.infer<typeof updateMealPlanSchema>
export type MealPlanListQuery = z.infer<typeof mealPlanListQuerySchema>
export type InsertRatePlanInput = z.infer<typeof insertRatePlanSchema>
export type UpdateRatePlanInput = z.infer<typeof updateRatePlanSchema>
export type RatePlanListQuery = z.infer<typeof ratePlanListQuerySchema>
export type InsertRatePlanRoomTypeInput = z.infer<typeof insertRatePlanRoomTypeSchema>
export type CalendarQuery = z.infer<typeof calendarQuerySchema>
export type BulkRateOperation = z.infer<typeof bulkRateOperationSchema>
export type BulkRatesInput = z.infer<typeof bulkRatesInputSchema>
export type BulkInventoryOperation = z.infer<typeof bulkInventoryOperationSchema>
export type BulkInventoryInput = z.infer<typeof bulkInventoryInputSchema>
export type UpsertRateBaseInput = z.infer<typeof upsertRateBaseSchema>
export type RateBaseListQuery = z.infer<typeof rateBaseListQuerySchema>
export type InsertPricingRuleInput = z.infer<typeof insertPricingRuleSchema>
export type UpdatePricingRuleInput = z.infer<typeof updatePricingRuleSchema>
export type PricingRuleListQuery = z.infer<typeof pricingRuleListQuerySchema>
export type PricingHorizonInput = z.infer<typeof pricingHorizonSchema>
