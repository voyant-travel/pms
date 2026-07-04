/**
 * PURE folio → finance invoice mapper (PLAN §4.4, §7; ADR 0001). Maps a folio's
 * non-payment postings to a finance invoice header + line items. No db, no
 * finance import — the settlement service feeds the result to
 * `financeService.createInvoice` / `createInvoiceLineItem`. Unit-tested directly.
 *
 * Mapping (per ADR 0001):
 *   - Payments are excluded (they settle upstream; the invoice states what is
 *     billed, not what is paid).
 *   - Non-payment postings are aggregated by TYPE into a net amount.
 *   - `tax`-type net → invoice `taxCents`.
 *   - Every other type with a POSITIVE net → one invoice line
 *     (`quantity: 1`, `unitPriceCents == totalCents == net`), so lines are valid
 *     (finance line items are non-negative and require `unit × qty == total`) and
 *     always sum to the invoice subtotal.
 *   - If any non-payment type nets NEGATIVE (a standalone credit not paired with a
 *     charge), the mapper returns an error — staff record credits as a reversal of
 *     the specific charge instead. Full credit-note modelling is a follow-up.
 */

import { netByType, type PostingAmount } from "./balance.js"

/** Human labels for the invoice line description, per posting type. */
const TYPE_LABEL: Record<string, string> = {
  room: "Accommodation",
  fee: "Fees",
  extra: "Extras",
  adjustment: "Adjustment",
  transfer: "Transfer",
}

export interface FolioInvoiceLine {
  description: string
  quantity: number
  unitPriceCents: number
  totalCents: number
}

export interface FolioInvoiceInput {
  currency: string
  subtotalCents: number
  taxCents: number
  totalCents: number
  lineItems: FolioInvoiceLine[]
}

export type BuildFolioInvoiceResult =
  | { ok: true; invoice: FolioInvoiceInput }
  | { ok: false; error: string }

/**
 * PURE: build the finance invoice input from a folio's postings. Returns an error
 * result (mapped to a 409 by the service) when the folio has no billable charges
 * or contains a negative-net posting type.
 */
export function buildFolioInvoiceInput(
  currency: string,
  postings: readonly PostingAmount[],
): BuildFolioInvoiceResult {
  const nonPayment = postings.filter((p) => p.type !== "payment")
  const nets = netByType(nonPayment)

  for (const [type, net] of Object.entries(nets)) {
    if (net < 0) {
      return {
        ok: false,
        error: `posting type "${type}" nets to a credit (${net}); record credits as a reversal of the specific charge before settling`,
      }
    }
  }

  const taxCents = nets.tax ?? 0
  const lineItems: FolioInvoiceLine[] = []
  for (const [type, net] of Object.entries(nets)) {
    if (type === "tax" || net <= 0) continue
    lineItems.push({
      description: TYPE_LABEL[type] ?? type,
      quantity: 1,
      unitPriceCents: net,
      totalCents: net,
    })
  }

  const subtotalCents = lineItems.reduce((sum, l) => sum + l.totalCents, 0)
  if (subtotalCents === 0 && taxCents === 0) {
    return { ok: false, error: "folio has no billable charges to invoice" }
  }

  // Deterministic order (largest charge first) so the invoice reads sensibly.
  lineItems.sort((a, b) => b.totalCents - a.totalCents)

  return {
    ok: true,
    invoice: { currency, subtotalCents, taxCents, totalCents: subtotalCents + taxCents, lineItems },
  }
}

/** Derive the fiscal invoice number from the folio number (ADR 0001: `INV-<folio>`). */
export function invoiceNumberForFolio(folioNumber: string): string {
  return `INV-${folioNumber}`
}
