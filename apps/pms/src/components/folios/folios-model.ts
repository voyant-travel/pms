/**
 * PURE view-model helpers for the Folios admin surface (PLAN §4.4). No React, no
 * fetch, no server-only imports — the shaping the ledger table, settle/close
 * guards and the daily-report cards share, unit-tested directly.
 *
 * Money formatting reuses the ARI `formatMoney` / `inputToCents` helpers (also
 * pure) so major-unit inputs convert to integer cents identically across surfaces.
 */

import { formatMoney, inputToCents } from "../ari/calendar-grid-model"

export { formatMoney, inputToCents }

// --- ledger shaping ----------------------------------------------------------

/** Minimal posting shape the ledger view-model needs (structural). */
export interface LedgerPosting {
  id: string
  reversalOfId: string | null
  businessDate: string
  type: string
  description: string
  amountCents: number
  quantity: number
  source: string
}

/** Whether a reversal posting was created by a void or by a transfer leg. */
export type ReversalKind = "void" | "transfer"

export interface LedgerRow<P extends LedgerPosting = LedgerPosting> {
  posting: P
  /** Signed cumulative balance up to and including this row (minor units). */
  runningBalanceCents: number
  /** This row reverses an earlier posting (has a `reversalOfId`). */
  isReversal: boolean
  /** A later posting on this folio reverses THIS one (voided / transferred out). */
  isReversed: boolean
  /** For a reversal row, whether it came from a void or a transfer. */
  reversalKind: ReversalKind | null
}

/**
 * Shape a folio's postings (already ordered by business date then insert time)
 * into ledger rows: a running balance, void/reversal linkage, and the kind of a
 * reversal. Charges are positive, payments/credits negative — the running balance
 * is the signed cumulative sum, matching the server's `folioBalanceCents`.
 */
export function toLedgerRows<P extends LedgerPosting>(postings: readonly P[]): LedgerRow<P>[] {
  const reversedIds = new Set<string>()
  for (const p of postings) if (p.reversalOfId) reversedIds.add(p.reversalOfId)

  let running = 0
  return postings.map((posting) => {
    running += posting.amountCents
    const isReversal = posting.reversalOfId !== null
    return {
      posting,
      runningBalanceCents: running,
      isReversal,
      isReversed: reversedIds.has(posting.id),
      reversalKind: isReversal ? (posting.source === "transfer" ? "transfer" : "void") : null,
    }
  })
}

// --- lifecycle guards (mirror the server rules) ------------------------------

export type FolioStatus = "open" | "settled" | "closed" | "voided"

/** Only an OPEN folio accepts postings (service-postings `loadOpenFolio`). */
export function canAddPosting(status: FolioStatus): boolean {
  return status === "open"
}

/** Only an OPEN folio can be settled (service-settlement `loadOpenFolioForSettle`). */
export function canSettleFolio(status: FolioStatus): boolean {
  return status === "open"
}

/** Only a SETTLED folio can be closed (service-settlement `closeFolio`). */
export function canCloseFolio(status: FolioStatus): boolean {
  return status === "settled"
}

/**
 * A posting is voidable when its folio is open and the posting is neither a
 * reversal itself nor already reversed — voiding those is a no-op server-side, so
 * the UI hides the action to avoid confusion.
 */
export function canVoidPosting(
  status: FolioStatus,
  row: Pick<LedgerRow, "isReversal" | "isReversed">,
): boolean {
  return status === "open" && !row.isReversal && !row.isReversed
}

/** A posting is transferable under the same conditions as a void. */
export function canTransferPosting(
  status: FolioStatus,
  row: Pick<LedgerRow, "isReversal" | "isReversed">,
): boolean {
  return canVoidPosting(status, row)
}

// --- daily report cards ------------------------------------------------------

/** The minimal daily-report shape the cards need (structural, matches `DailyReport`). */
export interface ReportLike {
  occupancy: number
  roomsSold: number
  adrCents: number
  revParCents: number
  totalRevenueCents: number
  revenueByType: Record<string, number>
}

/**
 * Minor units as a bare major-unit string (no currency code), e.g. `120` or
 * `120.50`. Used by the daily report, whose KPIs aggregate postings that may
 * carry different currencies, so a single symbol would be misleading.
 */
export function formatMajor(cents: number): string {
  const major = cents / 100
  return Number.isInteger(major) ? major.toString() : major.toFixed(2)
}

/** Occupancy ratio (0..1) as a rounded percentage string, e.g. `72.5%`. */
export function formatPercent(ratio: number): string {
  const pct = Math.round(ratio * 1000) / 10
  return `${pct}%`
}

export interface RevenueRow {
  type: string
  amountCents: number
}

/**
 * Revenue-by-type rows for the report table: non-payment types first (they are
 * the revenue lines), payments last, each stable-sorted by type name. Zero-value
 * types are dropped.
 */
export function revenueByTypeRows(revenueByType: Record<string, number>): RevenueRow[] {
  return Object.entries(revenueByType)
    .filter(([, amount]) => amount !== 0)
    .map(([type, amountCents]) => ({ type, amountCents }))
    .sort((a, b) => {
      const aPay = a.type === "payment" ? 1 : 0
      const bPay = b.type === "payment" ? 1 : 0
      if (aPay !== bPay) return aPay - bPay
      return a.type.localeCompare(b.type)
    })
}
