/**
 * Client-side data layer for the Housekeeping admin pages. Thin wrappers over the
 * deployment-local `pms/housekeeping` module mounted at
 * `/v1/admin/pms/housekeeping/*` (see `packages/housekeeping`), plus the shared
 * query keys so a mutation invalidates the right reads.
 *
 * Request/response shapes come from the module's zod-inferred input types and pure
 * return types (`import type` only — no runtime coupling to the server-only drizzle
 * schema). Stored rows are the inputs plus the server-assigned id + audit columns,
 * mirroring `front-desk-client.ts` / `ari-client.ts`.
 */

import type {
  GenerationResult,
  InsertMaintenanceBlockInput,
  InsertTaskInput,
  RoomStatus,
  RoomStatusEntry,
  TaskStatus,
  UpdateMaintenanceBlockInput,
  UpdateTaskInput,
} from "@voyant-travel/pms-housekeeping"
import { api } from "@/lib/api-client"

const BASE = "/v1/admin/pms/housekeeping"

// --- enum aliases (for the dialogs / selects) --------------------------------

export type TaskType = InsertTaskInput["type"]
export type MaintenanceReason = InsertMaintenanceBlockInput["reason"]
export type MaintenanceStatus = NonNullable<UpdateMaintenanceBlockInput["status"]>
export type { GenerationResult, RoomStatus, RoomStatusEntry, TaskStatus }

// --- stored-row shapes -------------------------------------------------------

export interface HousekeepingTask {
  id: string
  unitId: string
  propertyId: string
  type: TaskType
  status: TaskStatus
  priority: number
  assigneeUserId: string | null
  dueDate: string | null
  source: "auto" | "manual"
  sourceKey: string | null
  notes: string | null
  metadata: Record<string, unknown> | null
  createdAt?: string
  updatedAt?: string
}

export interface MaintenanceBlock {
  id: string
  unitId: string
  propertyId: string
  fromDate: string
  toDate: string
  reason: MaintenanceReason
  description: string | null
  status: MaintenanceStatus
  createdBy: string | null
  metadata: Record<string, unknown> | null
  createdAt?: string
  updatedAt?: string
}

interface ListEnvelope<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}
interface ItemEnvelope<T> {
  data: T
}
/** Maintenance mutations echo which serialized room type was recomputed (if any). */
export interface MaintenanceMutationResult {
  data: MaintenanceBlock
  recomputedRoomTypeId: string | null
}

// --- query keys --------------------------------------------------------------

export const housekeepingKeys = {
  all: ["housekeeping"] as const,
  tasks: (propertyId: string, date: string) =>
    [...housekeepingKeys.all, "tasks", propertyId, date] as const,
  roomStatus: (propertyId: string) => [...housekeepingKeys.all, "room-status", propertyId] as const,
  maintenance: (propertyId: string) =>
    [...housekeepingKeys.all, "maintenance", propertyId] as const,
}

// --- housekeeping tasks ------------------------------------------------------

export interface TaskListQueryInput {
  propertyId: string
  date?: string
  status?: TaskStatus
  type?: TaskType
  assigneeUserId?: string
}

export function listTasks(query: TaskListQueryInput): Promise<ListEnvelope<HousekeepingTask>> {
  const params = new URLSearchParams({ limit: "200", offset: "0", propertyId: query.propertyId })
  if (query.date) params.set("date", query.date)
  if (query.status) params.set("status", query.status)
  if (query.type) params.set("type", query.type)
  if (query.assigneeUserId) params.set("assigneeUserId", query.assigneeUserId)
  return api.get<ListEnvelope<HousekeepingTask>>(`${BASE}/tasks?${params.toString()}`)
}
export function createTask(input: InsertTaskInput): Promise<ItemEnvelope<HousekeepingTask>> {
  return api.post<ItemEnvelope<HousekeepingTask>>(`${BASE}/tasks`, input)
}
export function updateTask(
  id: string,
  input: UpdateTaskInput,
): Promise<ItemEnvelope<HousekeepingTask>> {
  return api.patch<ItemEnvelope<HousekeepingTask>>(`${BASE}/tasks/${id}`, input)
}
export function deleteTask(id: string): Promise<{ success: true }> {
  return api.delete<{ success: true }>(`${BASE}/tasks/${id}`)
}
export function setTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<ItemEnvelope<HousekeepingTask>> {
  return api.post<ItemEnvelope<HousekeepingTask>>(`${BASE}/tasks/${id}/status`, { status })
}

// --- room status -------------------------------------------------------------

export function listRoomStatus(propertyId: string): Promise<ItemEnvelope<RoomStatusEntry[]>> {
  return api.get<ItemEnvelope<RoomStatusEntry[]>>(`${BASE}/room-status?propertyId=${propertyId}`)
}
export function setRoomStatus(
  unitId: string,
  roomStatus: RoomStatus,
): Promise<ItemEnvelope<unknown>> {
  return api.post<ItemEnvelope<unknown>>(`${BASE}/room-status`, { unitId, roomStatus })
}

// --- auto-generation ---------------------------------------------------------

export function generateTasks(
  propertyId: string,
  date: string,
): Promise<ItemEnvelope<GenerationResult>> {
  return api.post<ItemEnvelope<GenerationResult>>(
    `${BASE}/generate?propertyId=${propertyId}&date=${date}`,
  )
}

// --- maintenance blocks ------------------------------------------------------

export interface MaintenanceListQueryInput {
  propertyId: string
  unitId?: string
  status?: MaintenanceStatus
}

export function listMaintenanceBlocks(
  query: MaintenanceListQueryInput,
): Promise<ListEnvelope<MaintenanceBlock>> {
  const params = new URLSearchParams({ limit: "200", offset: "0", propertyId: query.propertyId })
  if (query.unitId) params.set("unitId", query.unitId)
  if (query.status) params.set("status", query.status)
  return api.get<ListEnvelope<MaintenanceBlock>>(`${BASE}/maintenance-blocks?${params.toString()}`)
}
export function createMaintenanceBlock(
  input: InsertMaintenanceBlockInput,
): Promise<MaintenanceMutationResult> {
  return api.post<MaintenanceMutationResult>(`${BASE}/maintenance-blocks`, input)
}
export function updateMaintenanceBlock(
  id: string,
  input: UpdateMaintenanceBlockInput,
): Promise<MaintenanceMutationResult> {
  return api.patch<MaintenanceMutationResult>(`${BASE}/maintenance-blocks/${id}`, input)
}
export function resolveMaintenanceBlock(id: string): Promise<MaintenanceMutationResult> {
  return api.post<MaintenanceMutationResult>(`${BASE}/maintenance-blocks/${id}/resolve`)
}
export function cancelMaintenanceBlock(id: string): Promise<MaintenanceMutationResult> {
  return api.post<MaintenanceMutationResult>(`${BASE}/maintenance-blocks/${id}/cancel`)
}
