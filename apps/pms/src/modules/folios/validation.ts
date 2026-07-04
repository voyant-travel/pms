/**
 * Request validation schemas for the `pms-folios` module. Single source of truth
 * for the shapes the routes parse via `parseJsonBody` / `parseQuery`; re-exported
 * from `index.ts` so the admin UI half can import the inferred types.
 */

import { paginationSchema } from "@voyant-travel/types"
import { z } from "zod"

/** A loose TypeID reference column (cross-entity refs are plain text). */
const typeid = z.string().min(1)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
const currency = z.string().length(3)
const metadata = z.record(z.string(), z.unknown())

// --- enums (shared with the schema) ------------------------------------------

export const folioKindSchema = z.enum(["stay", "house"])
export const folioStatusSchema = z.enum(["open", "settled", "closed", "voided"])
export const folioPostingTypeSchema = z.enum([
  "room",
  "tax",
  "fee",
  "extra",
  "payment",
  "adjustment",
  "transfer",
])

/** Manual postings may not be `transfer` (use the transfer route) — that keeps
 *  the transfer link pair consistent. Night-audit + payment-sync are internal. */
export const manualPostingTypeSchema = z.enum(["room", "tax", "fee", "extra", "payment", "adjustment"])

// --- folios ------------------------------------------------------------------

/**
 * Open a folio. `kind = stay` requires a `bookingItemId` (and usually a
 * `bookingId`); `kind = house` is a free account (no booking). Refined below.
 */
export const openFolioSchema = z
  .object({
    propertyId: typeid,
    kind: folioKindSchema.default("stay"),
    bookingId: typeid.nullish(),
    bookingItemId: typeid.nullish(),
    guestName: z.string().nullish(),
    currency,
    metadata: metadata.nullish(),
  })
  .refine((v) => v.kind !== "stay" || (v.bookingItemId != null && v.bookingItemId.length > 0), {
    message: "a stay folio requires a bookingItemId",
    path: ["bookingItemId"],
  })

export const folioListQuerySchema = paginationSchema.extend({
  propertyId: typeid.optional(),
  status: folioStatusSchema.optional(),
  bookingId: typeid.optional(),
})

// --- postings ----------------------------------------------------------------

/** Post a manual charge / adjustment / payment to a folio. */
export const createPostingSchema = z.object({
  businessDate: isoDate,
  type: manualPostingTypeSchema,
  description: z.string().min(1).max(500),
  amountCents: z.number().int(),
  quantity: z.number().int().min(1).default(1),
  unitAmountCents: z.number().int().nullish(),
  // For payment postings, the upstream payment id this mirrors (ADR 0001).
  paymentRef: typeid.nullish(),
  metadata: metadata.nullish(),
})

/** Move an existing posting to another folio (reversal on source + copy on target). */
export const transferPostingSchema = z.object({
  postingId: typeid,
  targetFolioId: typeid,
})

// --- settlement --------------------------------------------------------------

/**
 * Settle a folio. `expectedBalanceCents` is an optional reconciliation intent
 * (ADR 0001): when supplied it must equal the folio's current balance, else the
 * settle is rejected (409) — a guard against settling a folio that changed under
 * the operator.
 */
export const settleFolioSchema = z.object({
  expectedBalanceCents: z.number().int().optional(),
  issueDate: isoDate.optional(),
  dueDate: isoDate.optional(),
})

// --- reports -----------------------------------------------------------------

export const dailyReportQuerySchema = z.object({
  propertyId: typeid,
  date: isoDate,
})

// --- night audit -------------------------------------------------------------

export const nightAuditQuerySchema = z.object({
  propertyId: typeid,
})

export type OpenFolioInput = z.infer<typeof openFolioSchema>
export type FolioListQuery = z.infer<typeof folioListQuerySchema>
export type CreatePostingInput = z.infer<typeof createPostingSchema>
export type TransferPostingInput = z.infer<typeof transferPostingSchema>
export type SettleFolioInput = z.infer<typeof settleFolioSchema>
export type DailyReportQuery = z.infer<typeof dailyReportQuerySchema>
export type NightAuditQuery = z.infer<typeof nightAuditQuerySchema>
