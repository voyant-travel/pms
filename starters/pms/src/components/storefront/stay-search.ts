import { z } from "zod"

/**
 * Property-first stay search — the URL/query contract shared by the
 * storefront landing (`/shop`), the property detail page, and the
 * booking journey. Pure (no router imports) so route files parse the
 * same schema and the view-model helpers stay unit-testable without a
 * live catalog.
 *
 * `checkIn`/`checkOut` are `YYYY-MM-DD` (local calendar dates, no
 * timezone). Occupancy is adults + children + rooms; those flow
 * straight into the accommodations booking draft (`pax` + room
 * `quantity`).
 */
export const staySearchSchema = z.object({
  /** Free-text destination — sent as the catalog `query`. */
  destination: z.string().optional(),
  /** Stay window, `YYYY-MM-DD`. */
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  adults: z.coerce.number().int().min(1).max(16).optional(),
  children: z.coerce.number().int().min(0).max(12).optional(),
  rooms: z.coerce.number().int().min(1).max(8).optional(),
})

export type StaySearch = z.infer<typeof staySearchSchema>

/** Occupancy with defaults applied (adults ≥ 1, rooms ≥ 1). */
export interface StayOccupancy {
  adults: number
  children: number
  rooms: number
}

export function resolveOccupancy(
  search: Pick<StaySearch, "adults" | "children" | "rooms">,
): StayOccupancy {
  return {
    adults: search.adults ?? 2,
    children: search.children ?? 0,
    rooms: search.rooms ?? 1,
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function parseIsoDate(value: string | undefined): number | null {
  if (!value || !ISO_DATE.test(value)) return null
  const ms = Date.parse(`${value}T00:00:00Z`)
  return Number.isNaN(ms) ? null : ms
}

/** Whole nights between check-in and check-out, or `null` if invalid. */
export function countNights(
  checkIn: string | undefined,
  checkOut: string | undefined,
): number | null {
  const a = parseIsoDate(checkIn)
  const b = parseIsoDate(checkOut)
  if (a === null || b === null) return null
  const nights = Math.round((b - a) / 86_400_000)
  return nights > 0 ? nights : null
}

/** True when both dates parse and check-out is strictly after check-in. */
export function isValidStayRange(
  checkIn: string | undefined,
  checkOut: string | undefined,
): boolean {
  return countNights(checkIn, checkOut) !== null
}

function isoDateFromOffset(days: number, from: number = Date.now()): string {
  return new Date(from + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Today's calendar date as `YYYY-MM-DD`. Used as the `min` on check-in /
 * check-out date inputs so a guest can't pick a stay in the past (which
 * would only fail later with an unhelpful "unavailable" quote).
 */
export function todayIso(from: number = Date.now()): string {
  return isoDateFromOffset(0, from)
}

/**
 * Sensible default window used when the landing page is opened without
 * dates: check-in today, check-out in two nights. Kept here (not inline
 * in the route) so it's deterministic under test via the `from` seam.
 */
export function defaultStayDates(from: number = Date.now()): { checkIn: string; checkOut: string } {
  return { checkIn: isoDateFromOffset(0, from), checkOut: isoDateFromOffset(2, from) }
}

/** Search params for the accommodations booking journey route. */
export interface BookingJourneySearch {
  checkIn: string
  checkOut: string
  roomTypeId: string
  ratePlanId: string
  adult: number
  child?: number
  rooms?: number
}

/**
 * Build the `/shop/book/accommodations/$id` search object from the
 * current stay search + the room/rate the guest picked. Omits zero
 * children and single-room so the URL stays clean; the booking route
 * defaults them back.
 */
export function toBookingJourneySearch(
  stay: Pick<StaySearch, "checkIn" | "checkOut" | "adults" | "children" | "rooms">,
  selection: { roomTypeId: string; ratePlanId: string },
): BookingJourneySearch | null {
  if (!stay.checkIn || !stay.checkOut || !isValidStayRange(stay.checkIn, stay.checkOut)) return null
  const occ = resolveOccupancy(stay)
  return {
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    roomTypeId: selection.roomTypeId,
    ratePlanId: selection.ratePlanId,
    adult: occ.adults,
    ...(occ.children > 0 ? { child: occ.children } : {}),
    ...(occ.rooms > 1 ? { rooms: occ.rooms } : {}),
  }
}
