"use client"

/**
 * React Query hooks feeding the hotel Dashboard panels. Each hook wraps an
 * existing domain client read (folios / front-desk / units / ARI /
 * housekeeping) under that client's shared query key, so the dashboard reuses
 * cache entries the domain pages already populate — switching to Folios after
 * viewing the dashboard hits a warm cache, and a mutation there invalidates the
 * dashboard too. The only dashboard-owned read is recent reservations.
 *
 * Panels share reads (boards feeds both the KPI strip and the front-desk panel;
 * the daily report feeds the KPI strip and the revenue panel) — React Query
 * dedupes by key, so the shared reads fetch once.
 */

import { useQuery } from "@tanstack/react-query"

import { ariKeys, listRoomTypes } from "../ari/ari-client"
import { foliosKeys, getBusinessDate, getDailyReport, listFolios } from "../folios/folios-client"
import { frontDeskKeys, getBoards, listRoomUnits } from "../front-desk/front-desk-client"
import {
  housekeepingKeys,
  listMaintenanceBlocks,
  listRoomStatus,
  listTasks,
} from "../housekeeping/housekeeping-client"
import { dashboardKeys, listRecentReservations } from "./dashboard-client"

/** The business date for the property (drives every date-scoped read). */
export function useBusinessDate(propertyId: string) {
  return useQuery({
    queryKey: foliosKeys.businessDate(propertyId),
    queryFn: () => getBusinessDate(propertyId),
    enabled: Boolean(propertyId),
  })
}

export function useDailyReport(propertyId: string, date: string) {
  return useQuery({
    queryKey: foliosKeys.report(propertyId, date),
    queryFn: () => getDailyReport(propertyId, date),
    enabled: Boolean(propertyId && date),
  })
}

export function useBoards(propertyId: string, date: string) {
  return useQuery({
    queryKey: frontDeskKeys.boards(propertyId, date),
    queryFn: () => getBoards(propertyId, date),
    enabled: Boolean(propertyId && date),
  })
}

/** Room-type id → display name, for the front-desk lists. */
export function useRoomTypeNames(propertyId: string) {
  return useQuery({
    queryKey: ariKeys.roomTypes(propertyId),
    queryFn: () => listRoomTypes(propertyId),
    enabled: Boolean(propertyId),
    select: (envelope) => new Map(envelope.data.map((rt) => [rt.id, rt.name])),
  })
}

/** Unit id → room number, for resolving assigned arrivals. */
export function useUnitNumbers(propertyId: string) {
  return useQuery({
    queryKey: frontDeskKeys.units(propertyId),
    queryFn: () => listRoomUnits({ propertyId }),
    enabled: Boolean(propertyId),
    select: (envelope) => new Map(envelope.data.map((unit) => [unit.id, unit.unitNumber])),
  })
}

export function useHousekeepingTasks(propertyId: string, date: string) {
  return useQuery({
    queryKey: housekeepingKeys.tasks(propertyId, date),
    queryFn: () => listTasks({ propertyId, date }),
    enabled: Boolean(propertyId && date),
  })
}

export function useRoomStatus(propertyId: string) {
  return useQuery({
    queryKey: housekeepingKeys.roomStatus(propertyId),
    queryFn: () => listRoomStatus(propertyId),
    enabled: Boolean(propertyId),
  })
}

export function useActiveMaintenance(propertyId: string) {
  return useQuery({
    queryKey: housekeepingKeys.maintenance(propertyId),
    queryFn: () => listMaintenanceBlocks({ propertyId, status: "active" }),
    enabled: Boolean(propertyId),
  })
}

export function useOpenFolios(propertyId: string) {
  return useQuery({
    queryKey: foliosKeys.list(propertyId, "open"),
    queryFn: () => listFolios({ propertyId, status: "open" }),
    enabled: Boolean(propertyId),
  })
}

export function useRecentReservations(limit = 5) {
  return useQuery({
    queryKey: dashboardKeys.recentReservations(limit),
    queryFn: () => listRecentReservations(limit),
  })
}
