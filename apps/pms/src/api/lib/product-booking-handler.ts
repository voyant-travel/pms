import { bookingRequirementsService } from "@voyant-travel/bookings/requirements"
import type {
  AddonOffer,
  OwnedBookingHandlerRegistry,
  PaxBandDependency,
  PaxBandSpec,
  TravelerFieldRequirement,
} from "@voyant-travel/catalog/booking-engine"
import {
  extraPriceRules,
  optionPriceRules,
  optionUnitPriceRules,
  priceCatalogs,
  pricingCategories,
  pricingCategoryDependencies,
  resolveOptionPriceRulesForDate,
} from "@voyant-travel/commerce"
import {
  createBooking as createFinanceBooking,
  resolveBookingSellTaxRate,
} from "@voyant-travel/finance"
import { createProductsBookingHandler } from "@voyant-travel/inventory/booking-engine"
import { productExtras } from "@voyant-travel/inventory/extras"
import { optionUnits, productOptions } from "@voyant-travel/inventory/schema"
import {
  availabilitySlots,
  extendAvailabilityHold,
  placeAvailabilityHold,
  releaseAvailabilityHold,
} from "@voyant-travel/operations"
import { resolveBookingTaxSettings } from "@voyant-travel/operator-settings"
import { and, asc, eq, inArray, or } from "drizzle-orm"
import { asPostgresDb } from "./booking-engine-db"
import type { BookingEngineEnv } from "./booking-engine-runtime"
import { withDbFromEnv } from "./db"
import {
  deriveTravelerCategory,
  humanizeFieldKey,
  persistBookingCreateTaxLines,
  typeForFieldKey,
} from "./product-booking-handler-utils"

export function registerProductBookingHandler(
  registry: OwnedBookingHandlerRegistry,
  env: BookingEngineEnv,
): void {
  registry.register(
    createProductsBookingHandler({
      holds: {
        async place(input) {
          return withDbFromEnv(env as Parameters<typeof withDbFromEnv>[0], async (rawDb) => {
            const db = asPostgresDb(rawDb)
            const result = await placeAvailabilityHold(db, input)
            if (result.status === "ok") {
              return {
                status: "ok",
                holdToken: result.hold.holdToken,
                expiresAt: result.hold.expiresAt,
              }
            }
            if (result.status === "slot_unlimited") {
              return {
                status: "ok",
                holdToken: result.holdToken,
                expiresAt: result.expiresAt,
              }
            }
            if (result.status === "slot_not_found") {
              return { status: "slot_not_found" }
            }
            return {
              status: "insufficient_capacity",
              remaining: result.remaining,
              needed: result.needed,
            }
          })
        },
        async extend(input) {
          return withDbFromEnv(env as Parameters<typeof withDbFromEnv>[0], async (rawDb) => {
            const db = asPostgresDb(rawDb)
            const result = await extendAvailabilityHold(db, input)
            if (result.status === "ok") return { status: "ok", expiresAt: result.expiresAt }
            return { status: "not_found" }
          })
        },
        async release(holdToken) {
          await withDbFromEnv(env as Parameters<typeof withDbFromEnv>[0], async (rawDb) => {
            const db = asPostgresDb(rawDb)
            await releaseAvailabilityHold(db, holdToken)
          })
        },
      },
      // Bridge into bookingsCreate. The handler builds the
      // input shape; the bridge provides the transactional commit.
      // env is captured by the closure so the bridge can resolve
      // the per-request DB lazily.
      async createBooking(input, opts) {
        // `withDbFromEnv` owns the per-call Pool — opens, runs the
        // commit, closes in `finally`. `createFinanceBooking`'s
        // signature still asks for postgres-js; force-cast here since
        // the runtime is neon-serverless on Workers and the drizzle
        // PgDatabase surface is identical across flavors for the
        // ops we use.
        return withDbFromEnv(env as Parameters<typeof withDbFromEnv>[0], async (rawDb) => {
          const db = asPostgresDb(rawDb)
          // `input.initialStatus` is plumbed from the booking-engine
          // commit caller (e.g. trips reserve) so bookings land in
          // the operator's preferred state — `awaiting_payment` for live
          // reservations, `draft` when the operator explicitly asks.
          const outcome = await createFinanceBooking(db, input, opts)
          if (outcome.status === "ok") {
            await persistBookingCreateTaxLines(db, outcome.result.booking.id, input.taxLines)
            return {
              status: "ok",
              bookingId: outcome.result.booking.id,
              bookingNumber: outcome.result.booking.bookingNumber,
            }
          }
          return { status: outcome.status }
        })
      },
      async loadTravelerFields(ctx, productId) {
        // Project booking-requirements rows into the engine's
        // descriptor shape. Per-traveler fields stay; lead-only and
        // booking-scope rows are excluded (they belong on bookingFields).
        const db = asPostgresDb(ctx.db)
        const result = await bookingRequirementsService.listProductContactRequirements(db, {
          productId,
          active: true,
          limit: 100,
          offset: 0,
        })
        const fields: TravelerFieldRequirement[] = []
        for (const row of result.data) {
          if (row.scope !== "traveler" && row.scope !== "lead_traveler") continue
          fields.push({
            key: row.fieldKey,
            label: humanizeFieldKey(row.fieldKey),
            type: typeForFieldKey(row.fieldKey),
            required: row.isRequired,
          })
        }
        // Always include the canonical first/last/email row so the
        // wizard renders something even when no requirements are
        // configured.
        if (!fields.some((f) => f.key === "firstName")) {
          fields.unshift({
            key: "firstName",
            label: "First name",
            type: "text",
            required: true,
          })
        }
        if (!fields.some((f) => f.key === "lastName")) {
          fields.splice(1, 0, {
            key: "lastName",
            label: "Last name",
            type: "text",
            required: true,
          })
        }
        return fields
      },
      async loadAddonCatalog(ctx, productId) {
        const db = asPostgresDb(ctx.db)
        const rows = await db
          .select({
            id: productExtras.id,
            name: productExtras.name,
            description: productExtras.description,
            selectionType: productExtras.selectionType,
            pricingMode: productExtras.pricingMode,
            pricedPerPerson: productExtras.pricedPerPerson,
            minQuantity: productExtras.minQuantity,
            maxQuantity: productExtras.maxQuantity,
            defaultQuantity: productExtras.defaultQuantity,
          })
          .from(productExtras)
          .where(and(eq(productExtras.productId, productId), eq(productExtras.active, true)))
          .orderBy(asc(productExtras.sortOrder), asc(productExtras.name))

        if (rows.length === 0) return []
        const extraIds = rows.map((row) => row.id)
        const priceRows = await db
          .select({
            productExtraId: extraPriceRules.productExtraId,
            pricingMode: extraPriceRules.pricingMode,
            sellAmountCents: extraPriceRules.sellAmountCents,
            sortOrder: extraPriceRules.sortOrder,
          })
          .from(extraPriceRules)
          .where(
            and(
              inArray(extraPriceRules.productExtraId, extraIds),
              eq(extraPriceRules.active, true),
            ),
          )
          .orderBy(asc(extraPriceRules.sortOrder), asc(extraPriceRules.createdAt))

        const priceByExtraId = new Map(
          priceRows.flatMap((row) =>
            row.productExtraId ? [[row.productExtraId, row] as const] : [],
          ),
        )

        return rows.map((row): AddonOffer => {
          const price = priceByExtraId.get(row.id)
          return {
            id: row.id,
            name: row.name,
            description: row.description,
            kind: "extras",
            pricingMode: price?.pricingMode ?? row.pricingMode,
            unitAmountCents: price?.sellAmountCents ?? null,
            currency: null,
            pricedPerPerson: row.pricedPerPerson,
            selectionType: row.selectionType,
            minQuantity: row.minQuantity,
            maxQuantity: row.maxQuantity,
            defaultQuantity: row.defaultQuantity,
          }
        })
      },
      async loadTaxRate(ctx, args) {
        void args.buyerCountry
        void args.buyerType
        const db = asPostgresDb(ctx.db)
        return resolveBookingSellTaxRate(
          db,
          { productId: args.productId },
          { resolveBookingTaxSettings },
        )
      },
      async loadProductOptions(ctx, productId) {
        const db = asPostgresDb(ctx.db)
        const rows = await db
          .select({
            id: productOptions.id,
            code: productOptions.code,
            name: productOptions.name,
            description: productOptions.description,
            isDefault: productOptions.isDefault,
          })
          .from(productOptions)
          .where(and(eq(productOptions.productId, productId), eq(productOptions.status, "active")))
          .orderBy(asc(productOptions.sortOrder), asc(productOptions.createdAt))
        const optionIds = rows.map((row) => row.id)
        const units =
          optionIds.length > 0
            ? await db
                .select({
                  id: optionUnits.id,
                  optionId: optionUnits.optionId,
                  name: optionUnits.name,
                  description: optionUnits.description,
                  unitType: optionUnits.unitType,
                  minQuantity: optionUnits.minQuantity,
                  maxQuantity: optionUnits.maxQuantity,
                })
                .from(optionUnits)
                .where(
                  and(inArray(optionUnits.optionId, optionIds), eq(optionUnits.isHidden, false)),
                )
                .orderBy(asc(optionUnits.sortOrder), asc(optionUnits.createdAt))
            : []
        const unitsByOptionId = new Map<string, typeof units>()
        for (const unit of units) {
          const current = unitsByOptionId.get(unit.optionId) ?? []
          current.push(unit)
          unitsByOptionId.set(unit.optionId, current)
        }
        return rows.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description,
          isDefault: row.isDefault,
          units: unitsByOptionId.get(row.id)?.map((unit) => ({
            id: unit.id,
            name: unit.name,
            description: unit.description,
            unitType: unit.unitType,
            minQuantity: unit.minQuantity,
            maxQuantity: unit.maxQuantity,
          })),
        }))
      },
      async loadPaxBands(ctx, productId) {
        // The journey's traveler bands should be the product's own
        // traveler types ("Adult", "Child under 6") — these live as
        // pricing categories scoped to the product, its options, or its
        // option units (operators add traveler types at any of these
        // levels; "Adult" is often a per-room/base type).
        //
        // Enrichment must never break the quote: on any failure (e.g. a
        // missing migration) we return undefined so the engine falls back
        // to the generic default bands instead of collapsing the shape.
        try {
          const db = asPostgresDb(ctx.db)
          const optionRows = await db
            .select({ id: productOptions.id })
            .from(productOptions)
            .where(
              and(eq(productOptions.productId, productId), eq(productOptions.status, "active")),
            )
          const optionIds = optionRows.map((row) => row.id)
          const unitRows =
            optionIds.length > 0
              ? await db
                  .select({ id: optionUnits.id })
                  .from(optionUnits)
                  .where(inArray(optionUnits.optionId, optionIds))
              : []
          const unitIds = unitRows.map((row) => row.id)

          const scopeClauses = [eq(pricingCategories.productId, productId)]
          if (optionIds.length > 0)
            scopeClauses.push(inArray(pricingCategories.optionId, optionIds))
          if (unitIds.length > 0) scopeClauses.push(inArray(pricingCategories.unitId, unitIds))
          const rows = await db
            .select({
              name: pricingCategories.name,
              categoryType: pricingCategories.categoryType,
              minAge: pricingCategories.minAge,
              maxAge: pricingCategories.maxAge,
            })
            .from(pricingCategories)
            .where(
              and(
                or(...scopeClauses),
                eq(pricingCategories.active, true),
                eq(pricingCategories.internalUseOnly, false),
              ),
            )
            .orderBy(asc(pricingCategories.sortOrder), asc(pricingCategories.name))

          // Only traveler bands — room/vehicle/service/group/other are
          // inventory units, not people.
          const travelerTypes = new Set(["adult", "child", "infant", "senior"])
          const maxByType: Record<string, number> = { adult: 8, child: 6, infant: 4, senior: 8 }
          const orderByType: Record<string, number> = { adult: 0, child: 1, infant: 2, senior: 3 }
          const seen = new Set<string>()
          const bands: PaxBandSpec[] = []
          for (const row of rows) {
            if (!travelerTypes.has(row.categoryType)) continue
            // Pricing matches per-band prices by the traveler-category code,
            // so keep code = categoryType. Dedupe by type (first/lowest
            // sort) while preserving the product's own label.
            if (seen.has(row.categoryType)) continue
            seen.add(row.categoryType)
            bands.push({
              code: row.categoryType,
              label: row.name,
              ...(row.minAge != null ? { minAge: row.minAge } : {}),
              ...(row.maxAge != null ? { maxAge: row.maxAge } : {}),
              minCount: row.categoryType === "adult" ? 1 : 0,
              maxCount: maxByType[row.categoryType] ?? 8,
            })
          }
          // No traveler types configured at all → undefined so the engine
          // keeps the generic adult/child/infant defaults.
          if (bands.length === 0) return undefined
          // Adults are the universal base traveler — a product can define
          // only child/infant add-on types ("Adult" is the room base price,
          // not a category). Guarantee an Adult band so the operator can
          // always add the primary travelers. Its age floor sits just above
          // the highest child band when one is configured.
          if (!seen.has("adult")) {
            const childMaxAge = bands.reduce<number | null>(
              (max, b) => (b.maxAge != null && (max == null || b.maxAge > max) ? b.maxAge : max),
              null,
            )
            bands.push({
              code: "adult",
              label: "Adult",
              ...(childMaxAge != null ? { minAge: childMaxAge + 1 } : {}),
              minCount: 1,
              maxCount: 8,
            })
          }
          bands.sort((a, b) => (orderByType[a.code] ?? 9) - (orderByType[b.code] ?? 9))
          return bands
        } catch (error) {
          console.warn("[booking-engine] loadPaxBands failed; using default bands", error)
          return undefined
        }
      },
      async loadPaxBandDependencies(ctx, productId) {
        // Cross-band occupancy rules ("Child under 6 requires an Adult")
        // are pricing-category dependencies. Resolve the product's
        // traveler categories, then map each dependency's category ids
        // to the pax-band codes the journey validates against.
        //
        // Enrichment must never break the quote — degrade to "no rules"
        // on any failure (e.g. a missing `pricing_category_dependencies`
        // migration) rather than failing the whole booking shape.
        try {
          const db = asPostgresDb(ctx.db)
          const optionRows = await db
            .select({ id: productOptions.id })
            .from(productOptions)
            .where(
              and(eq(productOptions.productId, productId), eq(productOptions.status, "active")),
            )
          const optionIds = optionRows.map((row) => row.id)
          const unitRows =
            optionIds.length > 0
              ? await db
                  .select({ id: optionUnits.id })
                  .from(optionUnits)
                  .where(inArray(optionUnits.optionId, optionIds))
              : []
          const unitIds = unitRows.map((row) => row.id)

          const scopeClauses = [eq(pricingCategories.productId, productId)]
          if (optionIds.length > 0)
            scopeClauses.push(inArray(pricingCategories.optionId, optionIds))
          if (unitIds.length > 0) scopeClauses.push(inArray(pricingCategories.unitId, unitIds))
          const cats = await db
            .select({ id: pricingCategories.id, categoryType: pricingCategories.categoryType })
            .from(pricingCategories)
            .where(and(or(...scopeClauses), eq(pricingCategories.active, true)))
          if (cats.length === 0) return undefined
          const typeById = new Map(cats.map((c) => [c.id, c.categoryType]))

          const deps = await db
            .select({
              dependentId: pricingCategoryDependencies.pricingCategoryId,
              masterId: pricingCategoryDependencies.masterPricingCategoryId,
              dependencyType: pricingCategoryDependencies.dependencyType,
              maxPerMaster: pricingCategoryDependencies.maxPerMaster,
              maxDependentSum: pricingCategoryDependencies.maxDependentSum,
            })
            .from(pricingCategoryDependencies)
            .where(
              and(
                inArray(
                  pricingCategoryDependencies.pricingCategoryId,
                  cats.map((c) => c.id),
                ),
                eq(pricingCategoryDependencies.active, true),
              ),
            )

          const travelerTypes = new Set(["adult", "child", "infant", "senior"])
          const out: PaxBandDependency[] = []
          for (const dep of deps) {
            const dependentCode = typeById.get(dep.dependentId)
            const masterCode = typeById.get(dep.masterId)
            // Both ends must be traveler bands the journey renders, and a
            // band can't depend on itself.
            if (!dependentCode || !masterCode) continue
            if (!travelerTypes.has(dependentCode) || !travelerTypes.has(masterCode)) continue
            if (dependentCode === masterCode) continue
            out.push({
              dependentCode,
              masterCode,
              type: dep.dependencyType,
              ...(dep.maxPerMaster != null ? { maxPerMaster: dep.maxPerMaster } : {}),
              ...(dep.maxDependentSum != null ? { maxDependentSum: dep.maxDependentSum } : {}),
            })
          }
          return out.length > 0 ? out : undefined
        } catch (error) {
          console.warn("[booking-engine] loadPaxBandDependencies failed; skipping rules", error)
          return undefined
        }
      },
      async loadSlotDate(ctx, slotId) {
        const db = asPostgresDb(ctx.db)
        const [slot] = await db
          .select({ dateLocal: availabilitySlots.dateLocal })
          .from(availabilitySlots)
          .where(eq(availabilitySlots.id, slotId))
          .limit(1)
        return slot?.dateLocal ?? null
      },
      async loadResolvedOptionPrice(ctx, args) {
        const db = asPostgresDb(ctx.db)

        // Resolve catalog id: explicit (rare) > default public.
        let catalogId = args.catalogId
        if (!catalogId) {
          const [cat] = await db
            .select({ id: priceCatalogs.id })
            .from(priceCatalogs)
            .where(
              and(
                eq(priceCatalogs.catalogType, "public"),
                eq(priceCatalogs.active, true),
                eq(priceCatalogs.isDefault, true),
              ),
            )
            .limit(1)
          if (!cat) return null
          catalogId = cat.id
        }

        const ruleByOption = await resolveOptionPriceRulesForDate(db, {
          productId: args.productId,
          optionIds: [args.optionId],
          catalogId,
          date: args.date,
        })
        const rule = ruleByOption.get(args.optionId)
        if (!rule) return null

        const [ruleRow, unitPriceRows, unitRows] = await Promise.all([
          db
            .select({ baseSellAmountCents: optionPriceRules.baseSellAmountCents })
            .from(optionPriceRules)
            .where(eq(optionPriceRules.id, rule.id))
            .limit(1),
          db
            .select({
              unitId: optionUnitPriceRules.unitId,
              sellAmountCents: optionUnitPriceRules.sellAmountCents,
              pricingCategoryId: optionUnitPriceRules.pricingCategoryId,
            })
            .from(optionUnitPriceRules)
            .where(
              and(
                eq(optionUnitPriceRules.optionPriceRuleId, rule.id),
                eq(optionUnitPriceRules.active, true),
              ),
            ),
          db
            .select({
              id: optionUnits.id,
              unitType: optionUnits.unitType,
              minAge: optionUnits.minAge,
              maxAge: optionUnits.maxAge,
            })
            .from(optionUnits)
            .where(and(eq(optionUnits.optionId, args.optionId), eq(optionUnits.isHidden, false))),
        ])
        const unitsById = new Map(unitRows.map((u) => [u.id, u]))
        const unitPrices = unitPriceRows.flatMap((up) => {
          const unit = unitsById.get(up.unitId)
          if (!unit) return []
          // Per-category rows (`pricingCategoryId` set) belong to the
          // unit×category matrix used for accommodation products. The
          // booking engine prices per-band today, so we only consume
          // rows where the unit alone determines the price.
          if (up.pricingCategoryId !== null) return []
          return [
            {
              unitId: up.unitId,
              unitType: unit.unitType,
              travelerCategory: deriveTravelerCategory(unit),
              sellAmountCents: up.sellAmountCents,
            },
          ]
        })

        return {
          baseSellAmountCents: ruleRow[0]?.baseSellAmountCents ?? null,
          unitPrices,
        }
      },
    }),
  )
}
