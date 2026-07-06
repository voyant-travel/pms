/**
 * Request validation schemas for the `pms-front-desk` module. Single source of
 * truth for the shapes the routes parse; re-exported from `index.ts` for the UI.
 */

import { z } from "zod"

const typeid = z.string().min(1)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")

export const stayOpsStatusSchema = z.enum(["expected", "checked_in", "checked_out", "no_show"])

// --- tape chart + boards (read) ----------------------------------------------

export const tapeChartQuerySchema = z.object({
  propertyId: typeid,
  from: isoDate,
  to: isoDate,
})

export const boardsQuerySchema = z.object({
  propertyId: typeid,
  date: isoDate,
})

// --- check-in / check-out / no-show (write) ----------------------------------

export const checkInSchema = z.object({
  bookingItemId: typeid,
  docType: z.string().nullish(),
  docNumber: z.string().nullish(),
  notes: z.string().nullish(),
})

export const checkOutSchema = z.object({
  bookingItemId: typeid,
})

export const noShowSchema = z.object({
  bookingItemId: typeid,
})

// --- new reservation (availability + create) ---------------------------------

/**
 * Front-desk availability probe: property + stay window + party. `rooms` is how
 * many rooms of the SAME type the desk wants (drives the `remaining >= rooms`
 * check and per-night quantity). Infants are not a front-desk input (they don't
 * consume a bed), so the party is adults + children.
 */
export const availabilityRequestSchema = z.object({
  propertyId: typeid,
  checkIn: isoDate,
  checkOut: isoDate,
  adults: z.number().int().min(1),
  children: z.number().int().min(0).default(0),
  rooms: z.number().int().min(1).default(1),
})

const reservationSelectionSchema = z.object({
  roomTypeId: typeid,
  ratePlanId: typeid,
  quantity: z.number().int().min(1).default(1),
})

/**
 * Create an owned-stay reservation from a picked room type × rate plan. v1 books
 * ONE room type per reservation (with a room `quantity`) through the shared
 * single-item stay write path; `selections` is an array for forward-compatibility
 * but the route rejects more than one entry (see `service-reservations.ts`).
 */
export const createReservationSchema = z.object({
  propertyId: typeid,
  checkIn: isoDate,
  checkOut: isoDate,
  occupancy: z.object({
    adults: z.number().int().min(1),
    children: z.number().int().min(0).default(0),
    infants: z.number().int().min(0).default(0),
  }),
  selections: z.array(reservationSelectionSchema).min(1),
  guest: z.object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    email: z.string().trim().email().nullish(),
    phone: z.string().trim().min(1).nullish(),
  }),
  notes: z.string().nullish(),
})

export type TapeChartQuery = z.infer<typeof tapeChartQuerySchema>
export type BoardsQuery = z.infer<typeof boardsQuerySchema>
export type CheckInInput = z.infer<typeof checkInSchema>
export type CheckOutInput = z.infer<typeof checkOutSchema>
export type NoShowInput = z.infer<typeof noShowSchema>
export type AvailabilityRequest = z.infer<typeof availabilityRequestSchema>
export type ReservationSelection = z.infer<typeof reservationSelectionSchema>
export type CreateReservationInput = z.infer<typeof createReservationSchema>
