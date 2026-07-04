/**
 * Client-side data layer for the ARI (availability, rates & inventory)
 * authoring admin pages. Thin wrappers over the deployment-local module mounted
 * at `/v1/admin/pms/ari/*` (see `src/modules/ari`), plus the query keys the
 * pages share so a mutation in one place can invalidate the right reads.
 *
 * Request/response shapes come from the module's exported zod-inferred input
 * types (`import type` — no runtime coupling to the server-only drizzle schema);
 * stored rows are those inputs plus the server-assigned `id` and audit columns.
 */

import { api } from "@/lib/api-client"
import type {
  BulkInventoryOperation,
  BulkRateOperation,
  CalendarGrid,
  InsertBedConfigInput,
  InsertMealPlanInput,
  InsertRatePlanInput,
  InsertRatePlanRoomTypeInput,
  InsertRoomTypeInput,
  UpdateBedConfigInput,
  UpdateMealPlanInput,
  UpdateRatePlanInput,
  UpdateRoomTypeInput,
} from "../../modules/ari"

const BASE = "/v1/admin/pms/ari"

// --- stored-row shapes -------------------------------------------------------

type Stored<T> = T & { id: string; createdAt?: string; updatedAt?: string }

export type RoomType = Stored<InsertRoomTypeInput> & { active?: boolean | null }
export type BedConfig = Stored<InsertBedConfigInput> & { roomTypeId: string }
export type MealPlan = Stored<InsertMealPlanInput> & { active?: boolean | null }
export type RatePlan = Stored<InsertRatePlanInput> & { active?: boolean | null }
export type RatePlanRoomType = Stored<InsertRatePlanRoomTypeInput> & { ratePlanId: string }

interface ListEnvelope<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}
interface ItemEnvelope<T> {
  data: T
}

// --- query keys --------------------------------------------------------------

export const ariKeys = {
  all: ["ari"] as const,
  properties: () => [...ariKeys.all, "properties"] as const,
  roomTypes: (propertyId?: string) => [...ariKeys.all, "room-types", propertyId ?? null] as const,
  bedConfigs: (roomTypeId: string) => [...ariKeys.all, "bed-configs", roomTypeId] as const,
  mealPlans: (propertyId?: string) => [...ariKeys.all, "meal-plans", propertyId ?? null] as const,
  ratePlans: (propertyId?: string) => [...ariKeys.all, "rate-plans", propertyId ?? null] as const,
  ratePlanRoomTypes: (ratePlanId: string) =>
    [...ariKeys.all, "rate-plan-room-types", ratePlanId] as const,
  calendar: (propertyId: string, from: string, to: string) =>
    [...ariKeys.all, "calendar", propertyId, from, to] as const,
}

// --- room types --------------------------------------------------------------

export function listRoomTypes(propertyId: string): Promise<ListEnvelope<RoomType>> {
  return api.get<ListEnvelope<RoomType>>(
    `${BASE}/room-types?propertyId=${propertyId}&limit=200&offset=0`,
  )
}
export function createRoomType(input: InsertRoomTypeInput): Promise<ItemEnvelope<RoomType>> {
  return api.post<ItemEnvelope<RoomType>>(`${BASE}/room-types`, input)
}
export function updateRoomType(
  id: string,
  input: UpdateRoomTypeInput,
): Promise<ItemEnvelope<RoomType>> {
  return api.patch<ItemEnvelope<RoomType>>(`${BASE}/room-types/${id}`, input)
}
export function deleteRoomType(id: string): Promise<{ success: true }> {
  return api.delete<{ success: true }>(`${BASE}/room-types/${id}`)
}

// --- bed configs -------------------------------------------------------------

export function listBedConfigs(roomTypeId: string): Promise<ItemEnvelope<BedConfig[]>> {
  return api.get<ItemEnvelope<BedConfig[]>>(`${BASE}/room-types/${roomTypeId}/bed-configs`)
}
export function createBedConfig(
  roomTypeId: string,
  input: InsertBedConfigInput,
): Promise<ItemEnvelope<BedConfig>> {
  return api.post<ItemEnvelope<BedConfig>>(`${BASE}/room-types/${roomTypeId}/bed-configs`, input)
}
export function updateBedConfig(
  id: string,
  input: UpdateBedConfigInput,
): Promise<ItemEnvelope<BedConfig>> {
  return api.patch<ItemEnvelope<BedConfig>>(`${BASE}/bed-configs/${id}`, input)
}
export function deleteBedConfig(id: string): Promise<{ success: true }> {
  return api.delete<{ success: true }>(`${BASE}/bed-configs/${id}`)
}

// --- meal plans --------------------------------------------------------------

export function listMealPlans(propertyId: string): Promise<ListEnvelope<MealPlan>> {
  return api.get<ListEnvelope<MealPlan>>(
    `${BASE}/meal-plans?propertyId=${propertyId}&limit=200&offset=0`,
  )
}
export function createMealPlan(input: InsertMealPlanInput): Promise<ItemEnvelope<MealPlan>> {
  return api.post<ItemEnvelope<MealPlan>>(`${BASE}/meal-plans`, input)
}
export function updateMealPlan(
  id: string,
  input: UpdateMealPlanInput,
): Promise<ItemEnvelope<MealPlan>> {
  return api.patch<ItemEnvelope<MealPlan>>(`${BASE}/meal-plans/${id}`, input)
}
export function deleteMealPlan(id: string): Promise<{ success: true }> {
  return api.delete<{ success: true }>(`${BASE}/meal-plans/${id}`)
}

// --- rate plans --------------------------------------------------------------

export function listRatePlans(propertyId: string): Promise<ListEnvelope<RatePlan>> {
  return api.get<ListEnvelope<RatePlan>>(
    `${BASE}/rate-plans?propertyId=${propertyId}&limit=200&offset=0`,
  )
}
export function createRatePlan(input: InsertRatePlanInput): Promise<ItemEnvelope<RatePlan>> {
  return api.post<ItemEnvelope<RatePlan>>(`${BASE}/rate-plans`, input)
}
export function updateRatePlan(
  id: string,
  input: UpdateRatePlanInput,
): Promise<ItemEnvelope<RatePlan>> {
  return api.patch<ItemEnvelope<RatePlan>>(`${BASE}/rate-plans/${id}`, input)
}
export function deleteRatePlan(id: string): Promise<{ success: true }> {
  return api.delete<{ success: true }>(`${BASE}/rate-plans/${id}`)
}

// --- rate plan <-> room type joins -------------------------------------------

export function listRatePlanRoomTypes(
  ratePlanId: string,
): Promise<ItemEnvelope<RatePlanRoomType[]>> {
  return api.get<ItemEnvelope<RatePlanRoomType[]>>(`${BASE}/rate-plans/${ratePlanId}/room-types`)
}
export function attachRatePlanRoomType(
  ratePlanId: string,
  input: InsertRatePlanRoomTypeInput,
): Promise<ItemEnvelope<RatePlanRoomType>> {
  return api.post<ItemEnvelope<RatePlanRoomType>>(
    `${BASE}/rate-plans/${ratePlanId}/room-types`,
    input,
  )
}
export function detachRatePlanRoomType(id: string): Promise<{ success: true }> {
  return api.delete<{ success: true }>(`${BASE}/rate-plan-room-types/${id}`)
}

// --- calendar ----------------------------------------------------------------

export function getCalendar(
  propertyId: string,
  from: string,
  to: string,
): Promise<ItemEnvelope<CalendarGrid>> {
  return api.get<ItemEnvelope<CalendarGrid>>(
    `${BASE}/calendar?propertyId=${propertyId}&from=${from}&to=${to}`,
  )
}
export function bulkUpsertRates(
  operations: BulkRateOperation[],
): Promise<ItemEnvelope<{ upserted: number }>> {
  return api.put<ItemEnvelope<{ upserted: number }>>(`${BASE}/calendar/rates`, { operations })
}
export function bulkUpsertInventory(
  operations: BulkInventoryOperation[],
): Promise<ItemEnvelope<{ upserted: number }>> {
  return api.put<ItemEnvelope<{ upserted: number }>>(`${BASE}/calendar/inventory`, { operations })
}

// --- property selector data --------------------------------------------------

interface PropertyRow {
  id: string
  facilityId: string
  brandName: string | null
  propertyType: string
}
interface FacilityRow {
  id: string
  name: string
}

export interface PropertyOption {
  id: string
  label: string
  propertyType: string
}

/**
 * List sellable properties for the section selector. Properties carry no
 * display name of their own (the name lives on the linked facility), so we
 * fetch both and join `facilityId -> facility.name`, falling back to the
 * brand name and finally the id.
 */
export async function listPropertyOptions(): Promise<PropertyOption[]> {
  const [properties, facilities] = await Promise.all([
    api.get<ListEnvelope<PropertyRow>>("/v1/admin/operations/properties?limit=200&offset=0"),
    api.get<ListEnvelope<FacilityRow>>("/v1/admin/operations/facilities?limit=200&offset=0"),
  ])
  const nameByFacility = new Map(facilities.data.map((f) => [f.id, f.name]))
  return properties.data.map((p) => ({
    id: p.id,
    label: nameByFacility.get(p.facilityId) ?? p.brandName ?? p.id,
    propertyType: p.propertyType,
  }))
}
