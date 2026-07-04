/**
 * CRUD service for the ARI authoring surface: room types (+ bed configs), meal
 * plans, rate plans (+ room-type joins). These write directly to the upstream
 * `@voyant-travel/accommodations` inventory tables (imported as the canonical
 * Drizzle tables — never redefined) because the upstream package ships the
 * schema and the read/quote path but no authoring services yet (see PLAN §4.5,
 * §7). Cross-entity refs (property → room type) are loose TypeID text columns
 * upstream, so existence is validated here in the service layer.
 */

import {
  mealPlans,
  ratePlanRoomTypes,
  ratePlans,
  roomTypeBedConfigs,
  roomTypes,
} from "@voyant-travel/accommodations/schema"
import { ApiHttpError } from "@voyant-travel/hono"
import { properties } from "@voyant-travel/operations/places"
import { type ListResponse, listResponse } from "@voyant-travel/types"
import { and, asc, count, eq, type SQL } from "drizzle-orm"

import type { AriDb } from "./db.js"
import type {
  InsertBedConfigInput,
  InsertMealPlanInput,
  InsertRatePlanInput,
  InsertRatePlanRoomTypeInput,
  InsertRoomTypeInput,
  MealPlanListQuery,
  RatePlanListQuery,
  RoomTypeListQuery,
  UpdateBedConfigInput,
  UpdateMealPlanInput,
  UpdateRatePlanInput,
  UpdateRoomTypeInput,
} from "./validation.js"

/** Drop `undefined` keys so a PATCH only writes the fields the caller sent. */
function definedOnly<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

function notFound(entity: string): never {
  throw new ApiHttpError(`${entity} not found`, { status: 404, code: "not_found" })
}

/** Guard a loose `property_id` reference before writing a child row. */
export async function assertPropertyExists(db: AriDb, propertyId: string): Promise<void> {
  const [row] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1)
  if (!row) {
    throw new ApiHttpError(`property ${propertyId} does not exist`, {
      status: 404,
      code: "not_found",
    })
  }
}

// --- room types --------------------------------------------------------------

export async function listRoomTypes(
  db: AriDb,
  query: RoomTypeListQuery,
): Promise<ListResponse<typeof roomTypes.$inferSelect>> {
  const clauses: SQL[] = []
  if (query.propertyId) clauses.push(eq(roomTypes.propertyId, query.propertyId))
  if (query.inventoryMode) clauses.push(eq(roomTypes.inventoryMode, query.inventoryMode))
  if (query.active !== undefined) clauses.push(eq(roomTypes.active, query.active))
  const where = clauses.length ? and(...clauses) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(roomTypes)
      .where(where)
      .orderBy(asc(roomTypes.sortOrder), asc(roomTypes.name))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(roomTypes).where(where),
  ])
  return listResponse(rows, { total, limit: query.limit, offset: query.offset })
}

export async function getRoomType(db: AriDb, id: string) {
  const [row] = await db.select().from(roomTypes).where(eq(roomTypes.id, id)).limit(1)
  return row ?? null
}

export async function createRoomType(db: AriDb, input: InsertRoomTypeInput) {
  await assertPropertyExists(db, input.propertyId)
  const [row] = await db.insert(roomTypes).values(input).returning()
  return row
}

export async function updateRoomType(db: AriDb, id: string, input: UpdateRoomTypeInput) {
  const [row] = await db
    .update(roomTypes)
    .set({ ...definedOnly(input), updatedAt: new Date() })
    .where(eq(roomTypes.id, id))
    .returning()
  return row ?? null
}

export async function deleteRoomType(db: AriDb, id: string) {
  const [row] = await db.delete(roomTypes).where(eq(roomTypes.id, id)).returning()
  return row ?? null
}

// --- bed configs (nested under a room type) ----------------------------------

export async function listBedConfigs(db: AriDb, roomTypeId: string) {
  return db
    .select()
    .from(roomTypeBedConfigs)
    .where(eq(roomTypeBedConfigs.roomTypeId, roomTypeId))
    .orderBy(asc(roomTypeBedConfigs.createdAt))
}

export async function createBedConfig(db: AriDb, roomTypeId: string, input: InsertBedConfigInput) {
  if (!(await getRoomType(db, roomTypeId))) notFound("Room type")
  const [row] = await db
    .insert(roomTypeBedConfigs)
    .values({ ...input, roomTypeId })
    .returning()
  return row
}

export async function updateBedConfig(db: AriDb, id: string, input: UpdateBedConfigInput) {
  const [row] = await db
    .update(roomTypeBedConfigs)
    .set({ ...definedOnly(input), updatedAt: new Date() })
    .where(eq(roomTypeBedConfigs.id, id))
    .returning()
  return row ?? null
}

export async function deleteBedConfig(db: AriDb, id: string) {
  const [row] = await db.delete(roomTypeBedConfigs).where(eq(roomTypeBedConfigs.id, id)).returning()
  return row ?? null
}

// --- meal plans --------------------------------------------------------------

export async function listMealPlans(
  db: AriDb,
  query: MealPlanListQuery,
): Promise<ListResponse<typeof mealPlans.$inferSelect>> {
  const clauses: SQL[] = []
  if (query.propertyId) clauses.push(eq(mealPlans.propertyId, query.propertyId))
  if (query.active !== undefined) clauses.push(eq(mealPlans.active, query.active))
  const where = clauses.length ? and(...clauses) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(mealPlans)
      .where(where)
      .orderBy(asc(mealPlans.sortOrder), asc(mealPlans.name))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(mealPlans).where(where),
  ])
  return listResponse(rows, { total, limit: query.limit, offset: query.offset })
}

export async function getMealPlan(db: AriDb, id: string) {
  const [row] = await db.select().from(mealPlans).where(eq(mealPlans.id, id)).limit(1)
  return row ?? null
}

export async function createMealPlan(db: AriDb, input: InsertMealPlanInput) {
  await assertPropertyExists(db, input.propertyId)
  const [row] = await db.insert(mealPlans).values(input).returning()
  return row
}

export async function updateMealPlan(db: AriDb, id: string, input: UpdateMealPlanInput) {
  const [row] = await db
    .update(mealPlans)
    .set({ ...definedOnly(input), updatedAt: new Date() })
    .where(eq(mealPlans.id, id))
    .returning()
  return row ?? null
}

export async function deleteMealPlan(db: AriDb, id: string) {
  const [row] = await db.delete(mealPlans).where(eq(mealPlans.id, id)).returning()
  return row ?? null
}

// --- rate plans --------------------------------------------------------------

export async function listRatePlans(
  db: AriDb,
  query: RatePlanListQuery,
): Promise<ListResponse<typeof ratePlans.$inferSelect>> {
  const clauses: SQL[] = []
  if (query.propertyId) clauses.push(eq(ratePlans.propertyId, query.propertyId))
  if (query.mealPlanId) clauses.push(eq(ratePlans.mealPlanId, query.mealPlanId))
  if (query.active !== undefined) clauses.push(eq(ratePlans.active, query.active))
  const where = clauses.length ? and(...clauses) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(ratePlans)
      .where(where)
      .orderBy(asc(ratePlans.sortOrder), asc(ratePlans.name))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(ratePlans).where(where),
  ])
  return listResponse(rows, { total, limit: query.limit, offset: query.offset })
}

export async function getRatePlan(db: AriDb, id: string) {
  const [row] = await db.select().from(ratePlans).where(eq(ratePlans.id, id)).limit(1)
  return row ?? null
}

export async function createRatePlan(db: AriDb, input: InsertRatePlanInput) {
  await assertPropertyExists(db, input.propertyId)
  const [row] = await db.insert(ratePlans).values(input).returning()
  return row
}

export async function updateRatePlan(db: AriDb, id: string, input: UpdateRatePlanInput) {
  const [row] = await db
    .update(ratePlans)
    .set({ ...definedOnly(input), updatedAt: new Date() })
    .where(eq(ratePlans.id, id))
    .returning()
  return row ?? null
}

export async function deleteRatePlan(db: AriDb, id: string) {
  const [row] = await db.delete(ratePlans).where(eq(ratePlans.id, id)).returning()
  return row ?? null
}

// --- rate plan ↔ room type joins ---------------------------------------------

export async function listRatePlanRoomTypes(db: AriDb, ratePlanId: string) {
  return db
    .select()
    .from(ratePlanRoomTypes)
    .where(eq(ratePlanRoomTypes.ratePlanId, ratePlanId))
    .orderBy(asc(ratePlanRoomTypes.sortOrder), asc(ratePlanRoomTypes.createdAt))
}

export async function attachRatePlanRoomType(
  db: AriDb,
  ratePlanId: string,
  input: InsertRatePlanRoomTypeInput,
) {
  if (!(await getRatePlan(db, ratePlanId))) notFound("Rate plan")
  if (!(await getRoomType(db, input.roomTypeId))) notFound("Room type")
  const [row] = await db
    .insert(ratePlanRoomTypes)
    .values({ ...input, ratePlanId })
    .onConflictDoUpdate({
      target: [ratePlanRoomTypes.ratePlanId, ratePlanRoomTypes.roomTypeId],
      set: {
        productId: input.productId ?? null,
        optionId: input.optionId ?? null,
        unitId: input.unitId ?? null,
        active: input.active ?? true,
        sortOrder: input.sortOrder ?? 0,
        updatedAt: new Date(),
      },
    })
    .returning()
  return row
}

export async function detachRatePlanRoomType(db: AriDb, id: string) {
  const [row] = await db.delete(ratePlanRoomTypes).where(eq(ratePlanRoomTypes.id, id)).returning()
  return row ?? null
}
