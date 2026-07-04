/**
 * Pure calendar-date helpers for the units module (UTC-only, no timezone drift).
 *
 * The serialized-inventory derivation expands a `from..to` range into concrete
 * `YYYY-MM-DD` dates and reasons about half-open occupancy intervals. Kept pure
 * and standalone so it is trivially unit-testable and free of local-timezone
 * effects — the upstream `date` columns are calendar dates, not instants.
 */

const MS_PER_DAY = 86_400_000
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Hard ceiling on a single expanded range (~2 years) — guards against runaway upserts. */
export const MAX_RANGE_DAYS = 731

/** Parse a `YYYY-MM-DD` calendar date into a UTC-midnight `Date`; reject impossible dates. */
export function parseIsoDate(value: string): Date {
  if (!ISO_DATE_RE.test(value)) throw new RangeError(`invalid ISO date: ${value}`)
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`invalid ISO date: ${value}`)
  }
  return date
}

/** Format a UTC `Date` back to `YYYY-MM-DD`. */
export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Expand an inclusive `from..to` range into the list of `YYYY-MM-DD` dates.
 * Throws on an inverted or oversized range.
 */
export function expandDates(from: string, to: string): string[] {
  const start = parseIsoDate(from)
  const end = parseIsoDate(to)
  if (end.getTime() < start.getTime()) {
    throw new RangeError(`range end ${to} precedes start ${from}`)
  }
  const totalDays = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1
  if (totalDays > MAX_RANGE_DAYS) {
    throw new RangeError(`range ${from}..${to} spans ${totalDays} days (max ${MAX_RANGE_DAYS})`)
  }
  const out: string[] = []
  for (let i = 0; i < totalDays; i++) {
    out.push(formatIsoDate(new Date(start.getTime() + i * MS_PER_DAY)))
  }
  return out
}

/** Add `days` to a `YYYY-MM-DD` date (UTC), returning `YYYY-MM-DD`. */
export function addDays(from: string, days: number): string {
  return formatIsoDate(new Date(parseIsoDate(from).getTime() + days * MS_PER_DAY))
}

/**
 * Do two half-open date intervals `[aFrom, aTo)` and `[bFrom, bTo)` overlap?
 *
 * Stays are half-open: a booking checking in on `aFrom` and out on `aTo`
 * occupies the nights `aFrom … aTo-1`. The departure day is free — a same-day
 * arrival after a departure does NOT conflict. Comparison is lexicographic on
 * the `YYYY-MM-DD` strings, which is order-equivalent to calendar order.
 */
export function rangesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom < bTo && bFrom < aTo
}
