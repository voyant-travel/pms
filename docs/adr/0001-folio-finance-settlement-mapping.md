# ADR 0001 — Folio ↔ Finance settlement mapping

Status: Accepted (2026-07-05)
Phase: 5 (folios + night audit — PLAN §4.4, §6, §7)

## Context

The PMS needs a guest ledger (a *folio*): the running account of everything a
stay owes — room charges posted nightly by the night audit, taxes, extras, fees,
adjustments, payments, and transfers between accounts. The Voyant framework
already ships a **finance** package (`@voyant-travel/finance`) that owns invoices,
invoice line items, receipts, and payment records.

These two ledgers overlap but are not the same thing. PLAN §7 flags this
explicitly and requires the settlement mapping to be decided in a Phase-5 ADR
*before* building. The open question: when a stay checks out and its folio is
settled, how many finance invoices does that produce, and how do folio postings
relate to invoice line items?

Two ledgers, two jobs:

- **Folio = operational ledger.** Lives in this repo (`pms-folios`). Tracks the
  day-to-day operational lifecycle `open → settled → closed` (plus `voided`).
  Postings are appended by staff and by the night-audit cron. It is the source of
  truth for "what does this room owe *right now*", is mutated continuously during
  the stay, and is an operations artifact — not a fiscal document.
- **Finance = fiscal ledger.** Lives upstream (`@voyant-travel/finance`).
  Invoices and receipts are the legally/accounting-meaningful records. They are
  immutable once issued, feed e-invoicing plugins (e.g. SmartBill), and are the
  source of truth for "what was billed".

## Decision

1. **One finance invoice per folio, created at settlement.** When a folio is
   settled (`POST /folios/:id/settle`), the PMS creates exactly one upstream
   finance invoice. Its id is stored back on the folio (`financeInvoiceId`). The
   folio remains the operational record; the invoice is its fiscal projection.

2. **Folio postings map to invoice line items.** The invoice line items are
   derived from the folio's non-payment postings, aggregated by posting type
   (room, fee, extra, adjustment) into one line per type with a positive net;
   `tax`-type postings sum into the invoice `taxCents`. This keeps line items
   valid (finance line items are non-negative and must satisfy
   `unitPrice × quantity == total`) and guarantees the invoice total reconciles
   with the folio's non-payment balance. See "Consequences" for the credit edge.

3. **Payments stay upstream; they appear on the folio as payment postings.**
   Money movement (card capture, bank transfer, refund) is recorded in
   finance/transactions upstream, as today. The folio mirrors each as a
   `payment`-type posting (negative `amountCents`) carrying the upstream payment
   id in `sourceKey` / metadata (source `payment_sync`). Payments are therefore
   excluded from the invoice line items — the invoice states what is *billed*;
   the folio balance nets billed against paid.

4. **Voids are reversal postings, never deletes.** Postings are immutable. A
   void (`POST /postings/:id/void`) appends a reversal posting of the *same type*
   with the negated amount and `reversalOfId` set to the original. A transfer
   (`POST /folios/:id/transfer`) appends a same-type reversal on the source folio
   and a matching copy on the target, linked by a shared transfer `sourceKey`.
   Because a void/transfer reversal shares the original's type, it nets to zero
   within that type and simply disappears from the settled invoice — no special
   casing.

## Alternatives considered

- **One invoice per booking (rejected).** A booking can carry several stay items
  (multiple rooms / room-nights) and could be re-invoiced across stays. Mapping a
  booking directly to an invoice loses the per-stay operational account the front
  desk works against (house accounts, room moves, split folios) and can't
  represent a house-account folio that has no booking at all. The folio is the
  right granularity for a *stay's* fiscal projection.

- **One invoice per posting batch / per night (rejected).** Emitting a fiscal
  document per night-audit run (or per posting) produces a blizzard of
  micro-invoices, breaks the "immutable once issued" property (a stayover's
  charges arrive over many nights), and makes reconciliation and e-invoicing
  unworkable. The night audit posts to the *folio*; the fiscal document is cut
  once, at settlement.

## Consequences

- The settlement code calls the finance service layer directly from deployment
  code: `financeService.createInvoice(db, data)` for the invoice header (explicit
  `invoiceNumber` + pre-computed `*Cents` totals, so no invoice-number-series
  provisioning is required) and `financeService.createInvoiceLineItem(db,
  invoiceId, line)` per derived line. Both accept the request `db` handle and are
  cleanly callable outside the package (verified against
  `@voyant-travel/finance` `service-invoice-core.ts` / `service-invoice-line-items.ts`).

- **Low-level `createInvoice` trade-off.** Using the bare creator (rather than
  `issueInvoiceFromBooking`) means the `invoice.issued` domain event is **not**
  emitted, so e-invoicing plugins (SmartBill, etc.) do not fire automatically on
  folio settlement. E-invoicing on settlement is a documented follow-up (PLAN
  §4.4 "E-invoicing per market via existing plugins"); it will be wired by
  switching the settlement creator to an event-emitting path once a folio→booking
  snapshot + invoice-number-series resolver is provided at the deployment.

- **Finance requires a `bookingId`.** `createInvoice` asserts the referenced
  booking exists. **Stay folios** carry `bookingId` + `bookingItemId`, so they
  settle to a real fiscal invoice. **House-account folios** (kind `house`) have no
  upstream booking, so they cannot produce a finance invoice via this path: they
  settle operationally (`status = settled`, `financeInvoiceId = null`) with the
  reason recorded. A house-account fiscal document (person/organization-billed,
  bookingless) is a finance-package gap and a follow-up, not something to hack
  around here.

- **Negative-net posting types.** Because finance line items are non-negative,
  settlement refuses (409) if any non-payment posting *type* nets negative (e.g. a
  standalone downward `adjustment` not paired with a charge). Staff record credits
  as a **reversal of the specific charge** (which nets that charge's type toward
  zero) rather than as a free-floating negative. Full credit-note modelling is a
  finance-package follow-up.

- **Folio number generation** is `F-<seq>` per property, computed from a
  count/max query at open time. Two concurrent opens can race to the same number;
  the `(propertyId, folioNumber)` unique index makes the loser fail loudly. A
  gap-free sequence is a v1 acceptable risk (retry-on-conflict is the follow-up).
