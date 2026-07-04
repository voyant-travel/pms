/**
 * Request validation schemas for the `pms-channels` module. Single source of truth
 * for the shapes the admin routes parse via `parseJsonBody` / `parseQuery`;
 * re-exported from `index.ts` so the admin UI half can import the inferred types.
 * The public webhook body is intentionally NOT validated here — it is an opaque
 * channel payload handed to `ChannelConnector.parseReservation`.
 */

import { paginationSchema } from "@voyant-travel/types"
import { z } from "zod"

const typeid = z.string().min(1)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
const currency = z.string().length(3)

export const ariEventStatusSchema = z.enum(["pending", "pushed", "failed", "skipped"])
export const reservationStatusSchema = z.enum(["received", "ingested", "failed", "ignored"])

// --- outbound ARI enqueue ----------------------------------------------------

export const ariDeltaDateSchema = z
  .object({
    date: isoDate,
    capacity: z.number().int().min(0).optional(),
    closed: z.boolean().optional(),
    sellAmountCents: z.number().int().min(0).optional(),
    currency: currency.optional(),
  })
  .refine((d) => d.sellAmountCents === undefined || d.currency !== undefined, {
    message: "currency is required when sellAmountCents is set",
    path: ["currency"],
  })

export const ariDeltaSchema = z.object({
  propertyId: typeid,
  roomTypeId: typeid,
  ratePlanId: typeid.optional(),
  dates: z.array(ariDeltaDateSchema).min(1),
})

/** Body of `POST /channels/ari/enqueue`: which channel + the delta to push. */
export const enqueueAriSchema = z.object({
  channel: z.string().min(1),
  delta: ariDeltaSchema,
})

// --- ledger list queries -----------------------------------------------------

export const ariEventListQuerySchema = paginationSchema.extend({
  channel: z.string().min(1).optional(),
  status: ariEventStatusSchema.optional(),
  propertyId: typeid.optional(),
})

export const reservationListQuerySchema = paginationSchema.extend({
  channel: z.string().min(1).optional(),
  status: reservationStatusSchema.optional(),
})

export type AriDeltaInput = z.infer<typeof ariDeltaSchema>
export type EnqueueAriInput = z.infer<typeof enqueueAriSchema>
export type AriEventListQuery = z.infer<typeof ariEventListQuerySchema>
export type ReservationListQuery = z.infer<typeof reservationListQuerySchema>
