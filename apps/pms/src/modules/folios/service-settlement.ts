/**
 * Folio settlement + close (PLAN §4.4, §7; ADR 0001). Settlement projects the
 * folio's non-payment postings to ONE upstream finance invoice and stores its id
 * on the folio. The PURE mapping is `settlement.ts`; this service loads the folio,
 * enforces the reconciliation guard, and calls the finance service layer directly
 * (`financeService.createInvoice` + `createInvoiceLineItem`) — cleanly callable
 * from deployment code (finance is a composed dependency).
 *
 * Two settlement paths (ADR 0001):
 *   - STAY folio with a bookingId → a real finance invoice is minted
 *     (`financeInvoiceId` set). We use the low-level `createInvoice` (explicit
 *     number + pre-computed totals) so no invoice-number-series provisioning is
 *     needed; the trade-off is that the `invoice.issued` event does NOT fire, so
 *     e-invoicing plugins are a documented follow-up.
 *   - HOUSE folio (no upstream booking) → settled operationally with
 *     `financeInvoiceId = null` and the reason recorded. A bookingless
 *     person/organization-billed invoice is a finance-package gap (follow-up).
 */

import { bookings } from "@voyant-travel/bookings/schema"
import { financeService } from "@voyant-travel/finance"
import { ApiHttpError } from "@voyant-travel/hono"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { formatIsoDate } from "../units/dates.js"
import { folioBalanceCents } from "./balance.js"
import type { FoliosDb } from "./db.js"
import { type FolioRow, folioPostings, folios } from "./schema.js"
import { buildFolioInvoiceInput, invoiceNumberForFolio } from "./settlement.js"
import type { SettleFolioInput } from "./validation.js"

/** Finance's service layer types `db` as `PostgresJsDatabase`; drizzle's runtime
 *  API is identical across flavors, so the request db is passed through (the same
 *  cast the operator uses for commerce/checkout — see operator-runtime-adapter). */
const financeDb = (db: FoliosDb): PostgresJsDatabase => db as unknown as PostgresJsDatabase

export interface SettleResult {
  folio: FolioRow
  financeInvoiceId: string | null
  balanceCents: number
  /** Present when no fiscal invoice was minted (house account / missing booking). */
  reason?: string
}

async function loadOpenFolioForSettle(db: FoliosDb, folioId: string): Promise<FolioRow> {
  const [folio] = await db.select().from(folios).where(eq(folios.id, folioId)).limit(1)
  if (!folio) {
    throw new ApiHttpError(`folio ${folioId} not found`, { status: 404, code: "not_found" })
  }
  if (folio.status !== "open") {
    throw new ApiHttpError(
      `folio ${folioId} is ${folio.status}; only an open folio can be settled`,
      {
        status: 409,
        code: "folio_not_open",
      },
    )
  }
  return folio
}

/** Create the upstream finance invoice for a stay folio; returns its id or null. */
async function createFinanceInvoice(
  db: FoliosDb,
  folio: FolioRow,
  input: SettleFolioInput,
  postings: (typeof folioPostings.$inferSelect)[],
): Promise<{ invoiceId: string } | { skip: string }> {
  if (folio.kind !== "stay" || !folio.bookingId) {
    return { skip: "house-account folio has no upstream booking to attach a fiscal invoice to" }
  }
  const [booking] = await db
    .select({ personId: bookings.personId, organizationId: bookings.organizationId })
    .from(bookings)
    .where(eq(bookings.id, folio.bookingId))
    .limit(1)
  if (!booking) {
    return {
      skip: `booking ${folio.bookingId} not found upstream; settled without a fiscal invoice`,
    }
  }

  const mapped = buildFolioInvoiceInput(folio.currency, postings)
  if (!mapped.ok) {
    throw new ApiHttpError(`cannot settle: ${mapped.error}`, {
      status: 409,
      code: "folio_not_billable",
    })
  }

  const today = formatIsoDate(new Date())
  const pg = financeDb(db)
  const invoice = await financeService.createInvoice(pg, {
    invoiceNumber: invoiceNumberForFolio(folio.folioNumber),
    bookingId: folio.bookingId,
    personId: booking.personId ?? null,
    organizationId: booking.organizationId ?? null,
    status: "issued",
    currency: mapped.invoice.currency,
    subtotalCents: mapped.invoice.subtotalCents,
    taxCents: mapped.invoice.taxCents,
    totalCents: mapped.invoice.totalCents,
    paidCents: 0,
    balanceDueCents: mapped.invoice.totalCents,
    issueDate: input.issueDate ?? today,
    dueDate: input.dueDate ?? today,
  })
  if (!invoice) {
    throw new ApiHttpError("finance did not return the created invoice", {
      status: 502,
      code: "invoice_create_failed",
    })
  }

  let sortOrder = 0
  for (const line of mapped.invoice.lineItems) {
    await financeService.createInvoiceLineItem(pg, invoice.id, {
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      totalCents: line.totalCents,
      sortOrder: sortOrder++,
    })
  }

  return { invoiceId: invoice.id }
}

/** Settle a folio: mint the fiscal invoice (stay) and flip status to `settled`. */
export async function settleFolio(
  db: FoliosDb,
  folioId: string,
  input: SettleFolioInput,
): Promise<SettleResult> {
  const folio = await loadOpenFolioForSettle(db, folioId)
  const postings = await db.select().from(folioPostings).where(eq(folioPostings.folioId, folioId))
  const balanceCents = folioBalanceCents(postings)

  if (input.expectedBalanceCents !== undefined && input.expectedBalanceCents !== balanceCents) {
    throw new ApiHttpError(
      `folio balance is ${balanceCents}, not the expected ${input.expectedBalanceCents}`,
      { status: 409, code: "balance_mismatch" },
    )
  }

  const result = await createFinanceInvoice(db, folio, input, postings)
  const financeInvoiceId = "invoiceId" in result ? result.invoiceId : null
  const reason = "skip" in result ? result.skip : undefined

  const now = new Date()
  const [updated] = await db
    .update(folios)
    .set({
      status: "settled",
      financeInvoiceId,
      settledAt: now,
      updatedAt: now,
      ...(reason ? { metadata: { ...(folio.metadata ?? {}), settlementNote: reason } } : {}),
    })
    .where(eq(folios.id, folioId))
    .returning()

  return { folio: updated, financeInvoiceId, balanceCents, reason }
}

/** Close a settled folio (archive). Only a settled folio can be closed. */
export async function closeFolio(db: FoliosDb, folioId: string): Promise<FolioRow> {
  const [folio] = await db.select().from(folios).where(eq(folios.id, folioId)).limit(1)
  if (!folio) {
    throw new ApiHttpError(`folio ${folioId} not found`, { status: 404, code: "not_found" })
  }
  if (folio.status !== "settled") {
    throw new ApiHttpError(
      `folio ${folioId} is ${folio.status}; only a settled folio can be closed`,
      {
        status: 409,
        code: "folio_not_settled",
      },
    )
  }
  const now = new Date()
  const [updated] = await db
    .update(folios)
    .set({ status: "closed", closedAt: now, updatedAt: now })
    .where(eq(folios.id, folioId))
    .returning()
  return updated
}
