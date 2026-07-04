/**
 * Pure date-range expansion with an optional ISO weekday mask.
 *
 * The rates/inventory bulk-upsert endpoints let a property manager write a value
 * over a `from..to` calendar range restricted to certain weekdays (e.g. "set the
 * weekend rate for all of July"). The expansion is deliberately pure and UTC-only
 * so it is trivially unit-testable and free of local-timezone drift — the
 * upstream `date` columns are calendar dates, not instants.
 *
 * Weekday convention: ISO-8601, 1 = Monday … 7 = Sunday (matches the API's
 * `weekdays: number[]` contract). An empty / omitted mask means "every day".
 */

const MS_PER_DAY = 86_400_000

/**
 * Hard ceiling on a single expanded range. Guards a bulk endpoint against an
 * accidental multi-decade range that would materialize millions of rows. ~2
 * years inclusive is far beyond any realistic authoring window.
 */
export const MAX_RANGE_DAYS = 731

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Parse a `YYYY-MM-DD` calendar date into a UTC-midnight `Date`. */
export function parseIsoDate(value: string): Date {
  if (!ISO_DATE_RE.test(value)) {
    throw new RangeError(`invalid ISO date: ${value}`)
  }
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  // Reject impossible dates that JS silently rolls over (e.g. 2026-02-31).
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

/** ISO-8601 weekday for a UTC date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: Date): number {
  const day = date.getUTCDay() // 0 = Sunday … 6 = Saturday
  return day === 0 ? 7 : day
}

/**
 * Expand an inclusive `from..to` range into the list of `YYYY-MM-DD` dates,
 * keeping only dates whose ISO weekday is in `weekdays` (all days when the mask
 * is empty/undefined). Throws on an inverted or oversized range.
 */
export function expandDates(from: string, to: string, weekdays?: readonly number[]): string[] {
  const start = parseIsoDate(from)
  const end = parseIsoDate(to)
  if (end.getTime() < start.getTime()) {
    throw new RangeError(`range end ${to} precedes start ${from}`)
  }
  const totalDays = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1
  if (totalDays > MAX_RANGE_DAYS) {
    throw new RangeError(`range ${from}..${to} spans ${totalDays} days (max ${MAX_RANGE_DAYS})`)
  }
  const mask = weekdays && weekdays.length > 0 ? new Set(weekdays) : null
  const out: string[] = []
  for (let i = 0; i < totalDays; i++) {
    const cursor = new Date(start.getTime() + i * MS_PER_DAY)
    if (!mask || mask.has(isoWeekday(cursor))) {
      out.push(formatIsoDate(cursor))
    }
  }
  return out
}
