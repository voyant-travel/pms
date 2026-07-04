/**
 * PURE night-audit posting plan (PLAN §4.4). Given the property's in-house stays
 * and their resolved per-night amounts for business date D, produce the room (and
 * tax) postings to append, each with a deterministic idempotency `sourceKey`, so
 * re-running the same date is a no-op. No db — the service resolves amounts + the
 * folio ids, calls this, then bulk-inserts with ON CONFLICT DO NOTHING.
 *
 * In-house selection (documented decision): a stay is charged for night D iff its
 * reservation spans that night — `checkInDate <= D < checkOutDate` (stays are
 * half-open: a guest arriving on the 5th and departing the 7th occupies the
 * nights of the 5th and 6th, NOT the 7th). We select by RESERVATION (upstream
 * `status = 'reserved'`, which excludes `cancelled` / `no_show`), NOT by the
 * front-desk `checked_in` ops flag: revenue accrues on the reserved night whether
 * or not the desk has clicked check-in. Cancelled/no-show stays are filtered
 * upstream of this planner.
 *
 * Pricing + fallback (documented decision): the per-night amount comes from the
 * upstream `stay_daily_rates` row for (stayItem, D). Upstream `stay_booking_items`
 * carries NO total column, so the fallback when D has no daily-rate row is the
 * stay's AVERAGE nightly rate — the sum of its `stay_daily_rates` ÷ `nightCount`.
 * A stay with zero daily-rate rows is left UNPRICED (reported, never charged a
 * guessed amount).
 */

/** A candidate stay for the audit, with amounts already resolved by the service. */
export interface AuditStay {
  bookingItemId: string
  folioId: string
  checkInDate: string
  checkOutDate: string
  currency: string
  /** Room sell amount for night D in minor units, or null when unpriceable. */
  roomAmountCents: number | null
  /** Tax amount for night D in minor units (from the daily-rate row), or null/0. */
  taxAmountCents: number | null
}

export interface PlannedPosting {
  folioId: string
  businessDate: string
  type: "room" | "tax"
  description: string
  amountCents: number
  currency: string
  quantity: number
  unitAmountCents: number | null
  source: "night_audit"
  sourceKey: string
  reversalOfId: null
  createdBy: null
}

export interface NightAuditPlan {
  date: string
  postings: PlannedPosting[]
  /** Booking-item ids that span D but had no resolvable amount (skipped). */
  unpriced: string[]
}

/** PURE: is a stay in-house for night D? `checkIn <= D < checkOut` (half-open). */
export function spansNight(checkInDate: string, checkOutDate: string, date: string): boolean {
  return checkInDate <= date && date < checkOutDate
}

/** Deterministic idempotency key for a night-audit room charge. */
export function roomSourceKey(bookingItemId: string, date: string): string {
  return `room:${bookingItemId}:${date}`
}

/** Deterministic idempotency key for a night-audit tax posting. */
export function taxSourceKey(bookingItemId: string, date: string): string {
  return `tax:${bookingItemId}:${date}`
}

/**
 * PURE fallback: resolve the nightly room amount. Prefers the explicit daily-rate
 * amount for D; falls back to the average nightly rate; returns null when neither
 * is available (unpriceable stay). `nightCount` guards divide-by-zero.
 */
export function resolveNightlyAmountCents(
  dailyRateCents: number | null | undefined,
  dailyRatesTotalCents: number | null | undefined,
  nightCount: number,
): number | null {
  if (dailyRateCents !== null && dailyRateCents !== undefined) return dailyRateCents
  if (dailyRatesTotalCents !== null && dailyRatesTotalCents !== undefined && nightCount > 0) {
    return Math.round(dailyRatesTotalCents / nightCount)
  }
  return null
}

/**
 * PURE: build the night-audit posting plan for `date` from the in-house stays.
 * Each priced stay yields a `room` posting; a stay whose daily-rate row carries a
 * positive tax yields an additional `tax` posting. Idempotency keys make the plan
 * safe to re-apply. Stays already filtered to those spanning D by the caller (the
 * planner still guards with `spansNight` so a mis-supplied stay is dropped).
 */
export function planNightAuditPostings(date: string, stays: readonly AuditStay[]): NightAuditPlan {
  const postings: PlannedPosting[] = []
  const unpriced: string[] = []

  for (const stay of stays) {
    if (!spansNight(stay.checkInDate, stay.checkOutDate, date)) continue

    if (stay.roomAmountCents === null) {
      unpriced.push(stay.bookingItemId)
      continue
    }

    postings.push({
      folioId: stay.folioId,
      businessDate: date,
      type: "room",
      description: `Room charge — night of ${date}`,
      amountCents: stay.roomAmountCents,
      currency: stay.currency,
      quantity: 1,
      unitAmountCents: stay.roomAmountCents,
      source: "night_audit",
      sourceKey: roomSourceKey(stay.bookingItemId, date),
      reversalOfId: null,
      createdBy: null,
    })

    if (stay.taxAmountCents !== null && stay.taxAmountCents > 0) {
      postings.push({
        folioId: stay.folioId,
        businessDate: date,
        type: "tax",
        description: `Tax — night of ${date}`,
        amountCents: stay.taxAmountCents,
        currency: stay.currency,
        quantity: 1,
        unitAmountCents: stay.taxAmountCents,
        source: "night_audit",
        sourceKey: taxSourceKey(stay.bookingItemId, date),
        reversalOfId: null,
        createdBy: null,
      })
    }
  }

  return { date, postings, unpriced }
}
