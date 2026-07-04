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

export type TapeChartQuery = z.infer<typeof tapeChartQuerySchema>
export type BoardsQuery = z.infer<typeof boardsQuerySchema>
export type CheckInInput = z.infer<typeof checkInSchema>
export type CheckOutInput = z.infer<typeof checkOutSchema>
export type NoShowInput = z.infer<typeof noShowSchema>
