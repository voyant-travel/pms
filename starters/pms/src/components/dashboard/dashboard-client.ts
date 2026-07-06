/**
 * Client-side data layer for the hotel Dashboard (the property-scoped daily
 * overview at `/`).
 *
 * The dashboard is a READ-ONLY composition: its KPI strip, front-desk,
 * housekeeping and revenue panels reuse the existing domain clients
 * (`folios-client`, `front-desk-client`, `housekeeping-client`,
 * `ari-client`) — no new endpoints for those. The only read this module adds is
 * the "recent reservations" list, a thin wrapper over the framework's
 * `GET /v1/admin/bookings` admin list (sorted newest-first). That list is
 * portfolio-wide (the booking record carries no property filter — property lives
 * on its items), so the panel is labelled "across all properties".
 *
 * Response shapes come from the bookings admin route's public contract (mirrored
 * as a plain interface here, `import type` only — no runtime coupling), matching
 * the sibling `*-client.ts` convention.
 */

import { api } from "@/lib/api-client"

// --- recent reservations (bookings admin list) -------------------------------

/** Booking lifecycle status (framework `bookingStatusSchema`). */
export type ReservationStatus =
  | "draft"
  | "on_hold"
  | "awaiting_payment"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "expired"
  | "cancelled"

/** Booking source channel (framework `bookingSourceTypeSchema`). */
export type ReservationSource =
  | "direct"
  | "manual"
  | "affiliate"
  | "ota"
  | "reseller"
  | "api_partner"
  | "internal"

/** One row of the recent-reservations list (subset of the bookings list item). */
export interface RecentReservation {
  id: string
  bookingNumber: string
  status: ReservationStatus
  sourceType: ReservationSource
  contactFirstName: string | null
  contactLastName: string | null
  startDate: string | null
  endDate: string | null
  sellCurrency: string
  sellAmountCents: number | null
  createdAt: string
}

interface ListEnvelope<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}

// --- query keys --------------------------------------------------------------

export const dashboardKeys = {
  all: ["dashboard"] as const,
  recentReservations: (limit: number) =>
    [...dashboardKeys.all, "recent-reservations", limit] as const,
}

/**
 * Latest reservations across the portfolio, newest first. The bookings admin
 * list has no property filter, so this intentionally spans every property — the
 * panel says as much.
 */
export function listRecentReservations(limit = 5): Promise<ListEnvelope<RecentReservation>> {
  const params = new URLSearchParams({
    sortBy: "createdAt",
    sortDir: "desc",
    limit: String(limit),
    offset: "0",
  })
  return api.get<ListEnvelope<RecentReservation>>(`/v1/admin/bookings?${params.toString()}`)
}
