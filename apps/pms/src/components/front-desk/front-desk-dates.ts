/**
 * Pure date helpers for the front-desk screens. Dependency-free (no React, no
 * fetch) and unit-tested. The front-desk UI must NOT import the deployment-local
 * module barrels at runtime (they pull server-only drizzle into the browser
 * bundle — see `ari-constants.ts`), so the date math the tape chart and boards
 * share lives here rather than reusing the module's `dates.ts` values.
 *
 * All dates are ISO `YYYY-MM-DD` and computed in UTC so a browser timezone never
 * shifts a business date.
 */

/** Number of days shown on the tape chart by default (today + 13 = a fortnight). */
export const DEFAULT_TAPE_CHART_DAYS = 14

/** Today as an ISO `YYYY-MM-DD` (UTC). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Shift an ISO date by `n` whole days (may be negative). */
export function addDaysIso(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Inclusive list of ISO dates from `from` to `to`; empty for an inverted range. */
export function buildDateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return dates
  for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

/** ISO weekday for a `YYYY-MM-DD` date: 1 = Monday … 7 = Sunday. */
export function isoWeekdayOf(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}

/** True for Saturday/Sunday — used to tint weekend columns. */
export function isWeekend(date: string): boolean {
  const wd = isoWeekdayOf(date)
  return wd === 6 || wd === 7
}

/** Whole nights between two ISO dates (`checkOut - checkIn`); 0 for same/inverted. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T00:00:00Z`).getTime()
  const b = new Date(`${checkOut}T00:00:00Z`).getTime()
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0
  return Math.round((b - a) / 86_400_000)
}

/** Default tape-chart window: today through today + (span - 1). */
export function defaultTapeChartRange(span = DEFAULT_TAPE_CHART_DAYS): {
  from: string
  to: string
} {
  const from = todayIso()
  return { from, to: addDaysIso(from, span - 1) }
}

/** Shift a range by `deltaDays`, preserving its span. */
export function shiftRangeByDays(
  from: string,
  to: string,
  deltaDays: number,
): { from: string; to: string } {
  return { from: addDaysIso(from, deltaDays), to: addDaysIso(to, deltaDays) }
}

/** Day-of-month (`"05"`) for a compact column header. */
export function dayOfMonth(date: string): string {
  return date.slice(8)
}
