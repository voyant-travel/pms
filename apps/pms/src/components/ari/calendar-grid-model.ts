/**
 * Pure view-model helpers for the rates & availability calendar grid. Kept
 * dependency-free (no React, no fetch) and unit-tested: the grid component is a
 * thin renderer over these, and cell lookups by `(roomTypeId | ratePlanId,
 * date)` are the part most likely to regress.
 */

import type { CalendarGrid, CalendarInventoryCell, CalendarRateCell } from "@voyant-travel/pms-ari"

/** Inclusive list of ISO `YYYY-MM-DD` dates from `from` to `to`. */
export function buildDateColumns(from: string, to: string): string[] {
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
  const day = new Date(`${date}T00:00:00Z`).getUTCDay() // 0=Sun..6=Sat
  return day === 0 ? 7 : day
}

/** True for Saturday/Sunday — used to tint weekend columns. */
export function isWeekend(date: string): boolean {
  const wd = isoWeekdayOf(date)
  return wd === 6 || wd === 7
}

const invKey = (roomTypeId: string, date: string) => `${roomTypeId}|${date}`
const rateKey = (ratePlanId: string, roomTypeId: string, date: string) =>
  `${ratePlanId}|${roomTypeId}|${date}`

export interface CalendarIndex {
  inventory: (roomTypeId: string, date: string) => CalendarInventoryCell | undefined
  rate: (ratePlanId: string, roomTypeId: string, date: string) => CalendarRateCell | undefined
}

/** Build O(1) cell lookups over a loaded calendar grid. */
export function indexCalendar(grid: CalendarGrid): CalendarIndex {
  const inv = new Map<string, CalendarInventoryCell>()
  for (const cell of grid.inventory) inv.set(invKey(cell.roomTypeId, cell.date), cell)
  const rates = new Map<string, CalendarRateCell>()
  for (const cell of grid.rates)
    rates.set(rateKey(cell.ratePlanId, cell.roomTypeId, cell.date), cell)
  return {
    inventory: (roomTypeId, date) => inv.get(invKey(roomTypeId, date)),
    rate: (ratePlanId, roomTypeId, date) => rates.get(rateKey(ratePlanId, roomTypeId, date)),
  }
}

/** Integer cents -> a plain major-unit string for a number input (e.g. 12000 -> "120"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return ""
  return (cents / 100).toString()
}

/** Parse a major-unit input string to integer cents; `null` when blank/invalid. */
export function inputToCents(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === "") return null
  const num = Number(trimmed)
  if (!Number.isFinite(num)) return null
  return Math.round(num * 100)
}

/** Compact money for a grid cell, e.g. `120` or `120.5` in the cell's currency. */
export function formatMoney(cents: number, currency: string): string {
  const major = cents / 100
  const formatted = Number.isInteger(major) ? major.toString() : major.toFixed(2)
  return `${formatted} ${currency}`
}

/** First and last day of the month containing `date` (a `YYYY-MM-DD`), as ISO strings. */
export function monthRange(date: string): { from: string; to: string } {
  const d = new Date(`${date}T00:00:00Z`)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth()
  const first = new Date(Date.UTC(year, month, 1))
  const last = new Date(Date.UTC(year, month + 1, 0))
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
}

/** Shift a month range by `delta` months, anchored on the range's first day. */
export function shiftMonth(from: string, delta: number): { from: string; to: string } {
  const d = new Date(`${from}T00:00:00Z`)
  const shifted = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1))
  return monthRange(shifted.toISOString().slice(0, 10))
}

/** e.g. "July 2026" for a range's `from` day. */
export function monthLabel(from: string): string {
  return new Date(`${from}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}
