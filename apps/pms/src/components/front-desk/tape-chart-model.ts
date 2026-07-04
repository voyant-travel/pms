/**
 * Pure view-model for the tape chart grid. Turns the backend's per-date cell
 * list (one {@link TapeChartCell} per occupied night) into stay BARS that span
 * consecutive date columns, and lays overlapping bars onto separate lanes so a
 * unit that (defensively) carries two stays in the window still renders cleanly.
 *
 * Dependency-free and unit-tested — the grid component is a thin renderer over
 * {@link buildRowLanes}. Only `import type` from the module barrel (no runtime
 * server coupling), matching `ari-constants.ts`.
 */

import type { TapeChartCell } from "../../modules/front-desk"

/** A contiguous occupancy run for one stay, spanning `span` date columns. */
export interface StayBar {
  bookingItemId: string
  guestName: string | null
  reservationStatus: string
  opsStatus: string | null
  checkInDate: string
  checkOutDate: string
  /** Index into the grid's `dates` array of the bar's first column. */
  startIndex: number
  /** Number of consecutive date columns the bar covers. */
  span: number
}

/** One rendered slice of a lane row: a bar, or a `null` gap spanning `span` columns. */
export interface Segment {
  span: number
  bar: StayBar | null
}

/**
 * Group per-date cells into contiguous same-stay bars. Cells for a stay on
 * adjacent date columns merge into one bar; a break in the stay (or a date-index
 * gap) starts a new bar. Input order is not trusted — cells are keyed by date.
 */
export function buildStayBars(
  cells: readonly TapeChartCell[],
  dates: readonly string[],
): StayBar[] {
  const indexOf = new Map(dates.map((d, i) => [d, i]))
  const positioned = cells
    .map((cell) => ({ cell, index: indexOf.get(cell.date) }))
    .filter((p): p is { cell: TapeChartCell; index: number } => p.index !== undefined)
    .sort((a, b) => a.index - b.index)

  const bars: StayBar[] = []
  let current: StayBar | null = null
  let lastIndex = -1

  for (const { cell, index } of positioned) {
    const continues =
      current !== null && current.bookingItemId === cell.bookingItemId && index === lastIndex + 1
    if (continues && current) {
      current.span += 1
    } else {
      current = {
        bookingItemId: cell.bookingItemId,
        guestName: cell.guestName,
        reservationStatus: cell.reservationStatus,
        opsStatus: cell.opsStatus,
        checkInDate: cell.checkInDate,
        checkOutDate: cell.checkOutDate,
        startIndex: index,
        span: 1,
      }
      bars.push(current)
    }
    lastIndex = index
  }
  return bars
}

/**
 * Greedily lay bars onto lanes so no two bars in a lane overlap in date columns.
 * With the backend's overlap guard a unit has at most one lane, but a defensive
 * second lane keeps the grid correct if that ever breaks.
 */
export function assignLanes(bars: readonly StayBar[]): StayBar[][] {
  const lanes: StayBar[][] = []
  for (const bar of [...bars].sort((a, b) => a.startIndex - b.startIndex)) {
    const lane = lanes.find((l) => {
      const last = l[l.length - 1]
      return last.startIndex + last.span <= bar.startIndex
    })
    if (lane) lane.push(bar)
    else lanes.push([bar])
  }
  return lanes
}

/** Fill a lane's bars into an ordered segment list covering all `dateCount` columns. */
export function laneSegments(lane: readonly StayBar[], dateCount: number): Segment[] {
  const segments: Segment[] = []
  let cursor = 0
  for (const bar of [...lane].sort((a, b) => a.startIndex - b.startIndex)) {
    if (bar.startIndex > cursor) segments.push({ span: bar.startIndex - cursor, bar: null })
    segments.push({ span: bar.span, bar })
    cursor = bar.startIndex + bar.span
  }
  if (cursor < dateCount) segments.push({ span: dateCount - cursor, bar: null })
  return segments
}

/** Full render model for a unit row: one segment list per lane (usually one lane). */
export function buildRowLanes(
  cells: readonly TapeChartCell[],
  dates: readonly string[],
): Segment[][] {
  const lanes = assignLanes(buildStayBars(cells, dates))
  if (lanes.length === 0) return [[{ span: dates.length, bar: null }]]
  return lanes.map((lane) => laneSegments(lane, dates.length))
}

/** Tailwind classes tinting a stay bar by its reservation + ops status. */
export function statusBarClass(reservationStatus: string, opsStatus: string | null): string {
  if (reservationStatus === "no_show") {
    return "bg-destructive/15 text-destructive border-destructive/40"
  }
  if (opsStatus === "checked_out") {
    return "bg-muted text-muted-foreground border-border"
  }
  if (opsStatus === "checked_in") {
    return "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-300"
  }
  // Reserved but not yet arrived.
  return "bg-sky-500/15 text-sky-700 border-sky-500/40 dark:text-sky-300"
}

/** Short human label for a stay's current front-desk state. */
export function stayStateLabel(reservationStatus: string, opsStatus: string | null): string {
  if (reservationStatus === "no_show") return "No-show"
  if (opsStatus === "checked_out") return "Checked out"
  if (opsStatus === "checked_in") return "In-house"
  return "Reserved"
}
