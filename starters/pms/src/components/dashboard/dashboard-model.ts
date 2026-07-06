/**
 * PURE view-model helpers for the hotel Dashboard (the property-scoped daily
 * overview at `/`). No React, no fetch, no server-only imports — every shaping
 * the KPI strip, the front-desk / housekeeping / revenue panels and the recent
 * reservations list share, unit-tested directly (mirrors the sibling
 * `*-model.ts` files).
 *
 * Money formatting reuses the folios/ARI `formatMoney` helper so amounts render
 * identically across surfaces; revenue-by-type shaping reuses the folios
 * `revenueByTypeRows` aggregator.
 */

import type { BoardEntry, Boards } from "@voyant-travel/pms-front-desk"
import { formatMoney, revenueByTypeRows } from "../folios/folios-model"

export { formatMoney }

// --- KPI strip ---------------------------------------------------------------

/** The daily-report fields the KPI strip reads (structural, matches `DailyReport`). */
export interface DailyReportLike {
  occupancy: number
  occupiedUnits: number
  sellableUnits: number
  roomsSold: number
  adrCents: number
  revParCents: number
  totalRevenueCents: number
  revenueByType: Record<string, number>
}

export interface KpiSummary {
  /** Occupancy as a 0..1 ratio (occupied units / sellable units). */
  occupancy: number
  occupiedUnits: number
  sellableUnits: number
  arrivals: number
  /** Arrivals still without an assigned unit. */
  unassignedArrivals: number
  departures: number
  inHouse: number
  adrCents: number
  revParCents: number
}

/** Arrivals with no unit assigned yet (pooled rooms never carry a unit). */
export function countUnassignedArrivals(arrivals: readonly BoardEntry[]): number {
  return arrivals.reduce((n, entry) => (entry.unitId === null ? n + 1 : n), 0)
}

/** Shape the daily report + boards into the KPI strip's numbers. */
export function buildKpiSummary(
  report: DailyReportLike | undefined,
  boards: Boards | undefined,
): KpiSummary {
  return {
    occupancy: report?.occupancy ?? 0,
    occupiedUnits: report?.occupiedUnits ?? 0,
    sellableUnits: report?.sellableUnits ?? 0,
    arrivals: boards?.arrivals.length ?? 0,
    unassignedArrivals: boards ? countUnassignedArrivals(boards.arrivals) : 0,
    departures: boards?.departures.length ?? 0,
    inHouse: boards?.inHouse.length ?? 0,
    adrCents: report?.adrCents ?? 0,
    revParCents: report?.revParCents ?? 0,
  }
}

/** Occupancy ratio (0..1) as a rounded percentage string, e.g. `72.5%`. */
export function formatPercent(ratio: number): string {
  const pct = Math.round(ratio * 1000) / 10
  return `${pct}%`
}

// --- front-desk panel (arrivals / departures lists) --------------------------

export interface FrontDeskRow {
  bookingItemId: string
  bookingId: string
  guestName: string
  roomTypeName: string
  /** Assigned unit number, or `null` when the arrival still needs a room. */
  unitNumber: string | null
}

/**
 * Shape a board entry into a front-desk list row, resolving the room-type and
 * unit ids to display names via the supplied lookups. Falls back to the raw id
 * (room type) or a placeholder (guest) so a missing lookup never blanks a row.
 */
export function frontDeskRow(
  entry: BoardEntry,
  roomTypeNames: ReadonlyMap<string, string>,
  unitNumbers: ReadonlyMap<string, string>,
): FrontDeskRow {
  return {
    bookingItemId: entry.bookingItemId,
    bookingId: entry.bookingId,
    guestName: entry.guestName?.trim() || "Guest",
    roomTypeName: roomTypeNames.get(entry.roomTypeId) ?? entry.roomTypeId,
    unitNumber: entry.unitId ? (unitNumbers.get(entry.unitId) ?? null) : null,
  }
}

/** First `limit` entries shaped into front-desk rows (top-N for the panel). */
export function topFrontDeskRows(
  entries: readonly BoardEntry[],
  roomTypeNames: ReadonlyMap<string, string>,
  unitNumbers: ReadonlyMap<string, string>,
  limit = 5,
): FrontDeskRow[] {
  return entries.slice(0, limit).map((entry) => frontDeskRow(entry, roomTypeNames, unitNumbers))
}

// --- housekeeping panel ------------------------------------------------------

/** Structural task shape the housekeeping summary needs. */
export interface TaskLike {
  status: string
}
/** Structural room-status shape the housekeeping summary needs. */
export interface RoomStatusLike {
  roomStatus: string | null
}
/** Structural maintenance-block shape the housekeeping summary needs. */
export interface MaintenanceLike {
  status: string
}

export interface HousekeepingSummary {
  openTasks: number
  inProgressTasks: number
  dirty: number
  clean: number
  inspected: number
  /** Units with no housekeeping status set yet. */
  untracked: number
  activeMaintenance: number
}

/** Aggregate the housekeeping task / room-status / maintenance reads for the panel. */
export function housekeepingSummary(input: {
  tasks: readonly TaskLike[]
  roomStatus: readonly RoomStatusLike[]
  maintenance: readonly MaintenanceLike[]
}): HousekeepingSummary {
  const summary: HousekeepingSummary = {
    openTasks: 0,
    inProgressTasks: 0,
    dirty: 0,
    clean: 0,
    inspected: 0,
    untracked: 0,
    activeMaintenance: 0,
  }
  for (const task of input.tasks) {
    if (task.status === "open") summary.openTasks += 1
    else if (task.status === "in_progress") summary.inProgressTasks += 1
  }
  for (const room of input.roomStatus) {
    if (room.roomStatus === "dirty") summary.dirty += 1
    else if (room.roomStatus === "clean") summary.clean += 1
    else if (room.roomStatus === "inspected") summary.inspected += 1
    else summary.untracked += 1
  }
  for (const block of input.maintenance) {
    if (block.status === "active") summary.activeMaintenance += 1
  }
  return summary
}

// --- revenue panel -----------------------------------------------------------

export { revenueByTypeRows }

/** Structural folio shape the open-balances total needs. */
export interface FolioBalanceLike {
  status: string
  balanceCents?: number
}

export interface OpenBalances {
  count: number
  totalCents: number
}

/**
 * Sum the outstanding balance across OPEN folios (the money still owed at the
 * desk). Non-open folios and folios without a resolved balance are skipped.
 */
export function sumOpenBalances(folios: readonly FolioBalanceLike[]): OpenBalances {
  let count = 0
  let totalCents = 0
  for (const folio of folios) {
    if (folio.status !== "open") continue
    count += 1
    totalCents += folio.balanceCents ?? 0
  }
  return { count, totalCents }
}

// --- recent reservations -----------------------------------------------------

/** Semantic tone for a reservation status badge (component maps to a variant). */
export type ReservationTone = "confirmed" | "in-house" | "checked-out" | "pending" | "cancelled"

/** Structural reservation shape the row view needs. */
export interface ReservationLike {
  bookingNumber: string
  status: string
  sourceType: string
  contactFirstName: string | null
  contactLastName: string | null
  startDate: string | null
  endDate: string | null
}

export interface RecentReservationView {
  stayNumber: string
  guestName: string
  dateRange: string
  tone: ReservationTone
  statusKey: string
  sourceKey: string
}

/** PURE: map a booking status to its dashboard badge tone. */
export function reservationStatusTone(status: string): ReservationTone {
  switch (status) {
    case "confirmed":
    case "awaiting_payment":
      return "confirmed"
    case "in_progress":
      return "in-house"
    case "completed":
      return "checked-out"
    case "cancelled":
    case "expired":
      return "cancelled"
    default:
      return "pending"
  }
}

/** Guest name from contact fields; `Guest` when both are blank. */
export function reservationGuestName(first: string | null, last: string | null): string {
  const name = [first, last]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ")
  return name || "Guest"
}

/** Compact `DD Mon → DD Mon` stay window; single side or dash when unknown. */
export function formatStayRange(start: string | null, end: string | null): string {
  const fmt = (iso: string | null): string | null => {
    if (!iso) return null
    const d = new Date(`${iso}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return null
    return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]}`
  }
  const a = fmt(start)
  const b = fmt(end)
  if (a && b) return `${a} → ${b}`
  return a ?? b ?? "—"
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

/** Full per-row view model for the recent reservations list. */
export function recentReservationView(r: ReservationLike): RecentReservationView {
  return {
    stayNumber: r.bookingNumber,
    guestName: reservationGuestName(r.contactFirstName, r.contactLastName),
    dateRange: formatStayRange(r.startDate, r.endDate),
    tone: reservationStatusTone(r.status),
    statusKey: r.status,
    sourceKey: r.sourceType,
  }
}
