/**
 * PURE maintenance-window math (PLAN §4.3). Turns a set of ACTIVE maintenance
 * blocks into the `blockedUnitIdsByDate` map the units module's inventory
 * recompute consumes (`date → set of blocked unit ids`). No db — the caller loads
 * the active blocks for the affected room type and passes them here.
 *
 * Maintenance ranges are INCLUSIVE on both ends (`[from_date, to_date]`): a unit
 * blocked 07-01..07-03 is unavailable on all three dates. This differs from the
 * half-open stay/occupancy interval convention on purpose — a maintenance day is
 * a full calendar day out of service, not a night.
 */

export interface MaintenanceWindow {
  unitId: string
  fromDate: string
  toDate: string
}

/** PURE: does an inclusive `[fromDate, toDate]` window cover a calendar `date`? */
export function windowCoversDate(window: MaintenanceWindow, date: string): boolean {
  return window.fromDate <= date && date <= window.toDate
}

/**
 * PURE: build `date → set of blocked unit ids` from active maintenance windows,
 * restricted to the given `dates`. A unit id appears on a date iff some window
 * covers that date (inclusive). Dates with no blocks are omitted.
 */
export function buildBlockedUnitIdsByDate(
  windows: readonly MaintenanceWindow[],
  dates: readonly string[],
): Map<string, Set<string>> {
  const byDate = new Map<string, Set<string>>()
  for (const date of dates) {
    for (const window of windows) {
      if (!windowCoversDate(window, date)) continue
      const set = byDate.get(date) ?? new Set<string>()
      set.add(window.unitId)
      byDate.set(date, set)
    }
  }
  return byDate
}
