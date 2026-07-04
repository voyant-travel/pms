/**
 * PURE folio balance + posting-summary math (PLAN §4.4). No db, no side effects —
 * the single source of truth for "what does this folio owe". Unit-tested directly.
 *
 * Convention (see schema.ts): charges are POSITIVE `amountCents`, payments and
 * credits are NEGATIVE. The folio balance is simply the signed sum of every
 * posting. A fully-paid folio nets to 0; a positive balance is owed by the guest;
 * a negative balance is a credit due to the guest.
 */

/** The minimal posting shape the balance math needs (structural). */
export interface PostingAmount {
  type: string
  amountCents: number
}

/** Signed sum of every posting's amount — the folio balance in minor units. */
export function folioBalanceCents(postings: readonly PostingAmount[]): number {
  return postings.reduce((sum, p) => sum + p.amountCents, 0)
}

/** Sum of the charge side only (non-payment postings) — what was billed, net of credits. */
export function chargesBalanceCents(postings: readonly PostingAmount[]): number {
  return postings.reduce((sum, p) => (p.type === "payment" ? sum : sum + p.amountCents), 0)
}

/** Sum of payment postings (negative), returned as a positive "paid" figure. */
export function paidCents(postings: readonly PostingAmount[]): number {
  const payments = postings.reduce((sum, p) => (p.type === "payment" ? sum + p.amountCents : sum), 0)
  return payments === 0 ? 0 : -payments
}

/** Net amount per posting type (signed), e.g. `{ room: 20000, tax: 1800, payment: -21800 }`. */
export function netByType(postings: readonly PostingAmount[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of postings) out[p.type] = (out[p.type] ?? 0) + p.amountCents
  return out
}

export interface FolioBalanceSummary {
  balanceCents: number
  chargesCents: number
  paidCents: number
  byType: Record<string, number>
}

/** One-shot summary used by `GET /folios/:id` (balance + charges + paid + by-type). */
export function summarizeFolio(postings: readonly PostingAmount[]): FolioBalanceSummary {
  return {
    balanceCents: folioBalanceCents(postings),
    chargesCents: chargesBalanceCents(postings),
    paidCents: paidCents(postings),
    byType: netByType(postings),
  }
}
