/**
 * Admin routes for the ARI authoring module. Mounted at `/v1/admin/pms/ari/*`
 * (the module name is `pms/ari`). Routes stay thin: parse via
 * `parseJsonBody`/`parseQuery`, resolve the request db, call the service, and
 * serialize. Not-found is a 404 envelope; validation/existence failures throw
 * shared API errors that the app's error boundary serializes.
 */

import type { VoyantDb } from "@voyant-travel/hono"
import { parseJsonBody, parseQuery } from "@voyant-travel/hono"
import { Hono } from "hono"

import type { AriDb } from "./db.js"
import { bulkUpsertInventory, bulkUpsertRates, getCalendar } from "./service-calendar.js"
import {
  attachRatePlanRoomType,
  createBedConfig,
  createMealPlan,
  createRatePlan,
  createRoomType,
  deleteBedConfig,
  deleteMealPlan,
  deleteRatePlan,
  deleteRoomType,
  detachRatePlanRoomType,
  getMealPlan,
  getRatePlan,
  getRoomType,
  listBedConfigs,
  listMealPlans,
  listRatePlanRoomTypes,
  listRatePlans,
  listRoomTypes,
  updateBedConfig,
  updateMealPlan,
  updateRatePlan,
  updateRoomType,
} from "./service-crud.js"
import {
  applyPricing,
  createPricingRule,
  deletePricingRule,
  deleteRateBase,
  getPricingRule,
  listPricingRules,
  listRateBases,
  previewPricing,
  updatePricingRule,
  upsertRateBase,
} from "./service-pricing.js"
import {
  bulkInventoryInputSchema,
  bulkRatesInputSchema,
  calendarQuerySchema,
  insertBedConfigSchema,
  insertMealPlanSchema,
  insertPricingRuleSchema,
  insertRatePlanRoomTypeSchema,
  insertRatePlanSchema,
  insertRoomTypeSchema,
  mealPlanListQuerySchema,
  pricingHorizonSchema,
  pricingRuleListQuerySchema,
  rateBaseListQuerySchema,
  ratePlanListQuerySchema,
  roomTypeListQuerySchema,
  updateBedConfigSchema,
  updateMealPlanSchema,
  updatePricingRuleSchema,
  updateRatePlanSchema,
  updateRoomTypeSchema,
  upsertRateBaseSchema,
} from "./validation.js"

type AriEnv = { Variables: { db: VoyantDb } }

const notFound = (entity: string) => ({ error: `${entity} not found` })

/** Narrow `c.get("db")` (VoyantDb) to the service db type (same union). */
const dbOf = (db: VoyantDb): AriDb => db

export const ariAdminRoutes = new Hono<AriEnv>()
  // --- room types ------------------------------------------------------------
  .get("/room-types", async (c) =>
    c.json(await listRoomTypes(dbOf(c.get("db")), parseQuery(c, roomTypeListQuerySchema))),
  )
  .post("/room-types", async (c) =>
    c.json(
      {
        data: await createRoomType(dbOf(c.get("db")), await parseJsonBody(c, insertRoomTypeSchema)),
      },
      201,
    ),
  )
  .get("/room-types/:id", async (c) => {
    const row = await getRoomType(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ data: row }) : c.json(notFound("Room type"), 404)
  })
  .patch("/room-types/:id", async (c) => {
    const row = await updateRoomType(
      dbOf(c.get("db")),
      c.req.param("id"),
      await parseJsonBody(c, updateRoomTypeSchema),
    )
    return row ? c.json({ data: row }) : c.json(notFound("Room type"), 404)
  })
  .delete("/room-types/:id", async (c) => {
    const row = await deleteRoomType(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ success: true }) : c.json(notFound("Room type"), 404)
  })
  // --- bed configs (nested) --------------------------------------------------
  .get("/room-types/:roomTypeId/bed-configs", async (c) =>
    c.json({ data: await listBedConfigs(dbOf(c.get("db")), c.req.param("roomTypeId")) }),
  )
  .post("/room-types/:roomTypeId/bed-configs", async (c) =>
    c.json(
      {
        data: await createBedConfig(
          dbOf(c.get("db")),
          c.req.param("roomTypeId"),
          await parseJsonBody(c, insertBedConfigSchema),
        ),
      },
      201,
    ),
  )
  .patch("/bed-configs/:id", async (c) => {
    const row = await updateBedConfig(
      dbOf(c.get("db")),
      c.req.param("id"),
      await parseJsonBody(c, updateBedConfigSchema),
    )
    return row ? c.json({ data: row }) : c.json(notFound("Bed config"), 404)
  })
  .delete("/bed-configs/:id", async (c) => {
    const row = await deleteBedConfig(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ success: true }) : c.json(notFound("Bed config"), 404)
  })
  // --- meal plans ------------------------------------------------------------
  .get("/meal-plans", async (c) =>
    c.json(await listMealPlans(dbOf(c.get("db")), parseQuery(c, mealPlanListQuerySchema))),
  )
  .post("/meal-plans", async (c) =>
    c.json(
      {
        data: await createMealPlan(dbOf(c.get("db")), await parseJsonBody(c, insertMealPlanSchema)),
      },
      201,
    ),
  )
  .get("/meal-plans/:id", async (c) => {
    const row = await getMealPlan(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ data: row }) : c.json(notFound("Meal plan"), 404)
  })
  .patch("/meal-plans/:id", async (c) => {
    const row = await updateMealPlan(
      dbOf(c.get("db")),
      c.req.param("id"),
      await parseJsonBody(c, updateMealPlanSchema),
    )
    return row ? c.json({ data: row }) : c.json(notFound("Meal plan"), 404)
  })
  .delete("/meal-plans/:id", async (c) => {
    const row = await deleteMealPlan(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ success: true }) : c.json(notFound("Meal plan"), 404)
  })
  // --- rate plans ------------------------------------------------------------
  .get("/rate-plans", async (c) =>
    c.json(await listRatePlans(dbOf(c.get("db")), parseQuery(c, ratePlanListQuerySchema))),
  )
  .post("/rate-plans", async (c) =>
    c.json(
      {
        data: await createRatePlan(dbOf(c.get("db")), await parseJsonBody(c, insertRatePlanSchema)),
      },
      201,
    ),
  )
  .get("/rate-plans/:id", async (c) => {
    const row = await getRatePlan(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ data: row }) : c.json(notFound("Rate plan"), 404)
  })
  .patch("/rate-plans/:id", async (c) => {
    const row = await updateRatePlan(
      dbOf(c.get("db")),
      c.req.param("id"),
      await parseJsonBody(c, updateRatePlanSchema),
    )
    return row ? c.json({ data: row }) : c.json(notFound("Rate plan"), 404)
  })
  .delete("/rate-plans/:id", async (c) => {
    const row = await deleteRatePlan(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ success: true }) : c.json(notFound("Rate plan"), 404)
  })
  // --- rate plan ↔ room type joins ------------------------------------------
  .get("/rate-plans/:ratePlanId/room-types", async (c) =>
    c.json({ data: await listRatePlanRoomTypes(dbOf(c.get("db")), c.req.param("ratePlanId")) }),
  )
  .post("/rate-plans/:ratePlanId/room-types", async (c) =>
    c.json(
      {
        data: await attachRatePlanRoomType(
          dbOf(c.get("db")),
          c.req.param("ratePlanId"),
          await parseJsonBody(c, insertRatePlanRoomTypeSchema),
        ),
      },
      201,
    ),
  )
  .delete("/rate-plan-room-types/:id", async (c) => {
    const row = await detachRatePlanRoomType(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ success: true }) : c.json(notFound("Rate plan room type"), 404)
  })
  // --- rates & availability calendar -----------------------------------------
  .get("/calendar", async (c) =>
    c.json({ data: await getCalendar(dbOf(c.get("db")), parseQuery(c, calendarQuerySchema)) }),
  )
  .put("/calendar/rates", async (c) => {
    const { operations } = await parseJsonBody(c, bulkRatesInputSchema)
    return c.json({ data: await bulkUpsertRates(dbOf(c.get("db")), operations) })
  })
  .put("/calendar/inventory", async (c) => {
    const { operations } = await parseJsonBody(c, bulkInventoryInputSchema)
    return c.json({ data: await bulkUpsertInventory(dbOf(c.get("db")), operations) })
  })
  // --- pricing: base rates ---------------------------------------------------
  .get("/rate-base", async (c) => {
    const { propertyId } = parseQuery(c, rateBaseListQuerySchema)
    return c.json({ data: await listRateBases(dbOf(c.get("db")), propertyId) })
  })
  .post("/rate-base", async (c) =>
    c.json(
      {
        data: await upsertRateBase(dbOf(c.get("db")), await parseJsonBody(c, upsertRateBaseSchema)),
      },
      201,
    ),
  )
  .delete("/rate-base/:id", async (c) => {
    const row = await deleteRateBase(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ success: true }) : c.json(notFound("Rate base"), 404)
  })
  // --- pricing: rules --------------------------------------------------------
  .get("/pricing-rules", async (c) =>
    c.json(await listPricingRules(dbOf(c.get("db")), parseQuery(c, pricingRuleListQuerySchema))),
  )
  .post("/pricing-rules", async (c) =>
    c.json(
      {
        data: await createPricingRule(
          dbOf(c.get("db")),
          await parseJsonBody(c, insertPricingRuleSchema),
        ),
      },
      201,
    ),
  )
  .get("/pricing-rules/:id", async (c) => {
    const row = await getPricingRule(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ data: row }) : c.json(notFound("Pricing rule"), 404)
  })
  .patch("/pricing-rules/:id", async (c) => {
    const row = await updatePricingRule(
      dbOf(c.get("db")),
      c.req.param("id"),
      await parseJsonBody(c, updatePricingRuleSchema),
    )
    return row ? c.json({ data: row }) : c.json(notFound("Pricing rule"), 404)
  })
  .delete("/pricing-rules/:id", async (c) => {
    const row = await deletePricingRule(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ success: true }) : c.json(notFound("Pricing rule"), 404)
  })
  // --- pricing: preview (read-only) + apply (OVERWRITES daily rates) ---------
  .post("/pricing-rules/preview", async (c) =>
    c.json({
      data: await previewPricing(dbOf(c.get("db")), await parseJsonBody(c, pricingHorizonSchema)),
    }),
  )
  .post("/pricing-rules/apply", async (c) =>
    c.json({
      data: await applyPricing(dbOf(c.get("db")), await parseJsonBody(c, pricingHorizonSchema)),
    }),
  )

export type AriAdminRoutes = typeof ariAdminRoutes
