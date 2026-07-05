/**
 * Pure view-model for the arrivals / departures / in-house boards. Shapes a
 * {@link BoardEntry} into display fields (pax summary, nights, status badge) and
 * exposes the guard predicates the inline actions gate on — mirrored here from
 * the backend's `checkInBlockedReason` / `checkOutBlockedReason` so the UI never
 * imports the server module barrel at runtime.
 *
 * Dependency-free and unit-tested.
 */

import type { BoardEntry, Boards } from "@voyant-travel/pms-front-desk"
import { nightsBetween } from "./front-desk-dates"

export type BoardTab = "arrivals" | "departures" | "inHouse"

export interface BoardEntryView {
  nights: number
  pax: string
  stateLabel: string
  stateTone: "reserved" | "in-house" | "checked-out" | "no-show"
}

/** Compact occupancy summary, e.g. `2A` or `2A · 1C · 1I`. Zero counts drop out. */
export function paxSummary(adults: number, children: number, infants: number): string {
  const parts: string[] = []
  if (adults > 0) parts.push(`${adults}A`)
  if (children > 0) parts.push(`${children}C`)
  if (infants > 0) parts.push(`${infants}I`)
  return parts.length ? parts.join(" · ") : "—"
}

/** Display state for a board row from its ops overlay. */
export function boardEntryState(opsStatus: string | null): BoardEntryView["stateTone"] {
  if (opsStatus === "no_show") return "no-show"
  if (opsStatus === "checked_out") return "checked-out"
  if (opsStatus === "checked_in") return "in-house"
  return "reserved"
}

const STATE_LABEL: Record<BoardEntryView["stateTone"], string> = {
  reserved: "Reserved",
  "in-house": "In-house",
  "checked-out": "Checked out",
  "no-show": "No-show",
}

/** Full per-row view model. */
export function boardEntryView(entry: BoardEntry): BoardEntryView {
  const tone = boardEntryState(entry.opsStatus)
  return {
    nights: nightsBetween(entry.checkInDate, entry.checkOutDate),
    pax: paxSummary(entry.adults, entry.children, entry.infants),
    stateLabel: STATE_LABEL[tone],
    stateTone: tone,
  }
}

/** Rows for the active tab. */
export function entriesForTab(boards: Boards, tab: BoardTab): BoardEntry[] {
  return boards[tab]
}

/**
 * PURE (mirrors backend `checkInBlockedReason`): reason an arrival cannot be
 * checked in yet, or `null` when the action is allowed. Reservation status here
 * is the ops overlay proxy — no-show and already-checked-out rows are blocked.
 */
export function checkInDisabledReason(opsStatus: string | null): string | null {
  if (opsStatus === "no_show") return "Stay is marked no-show"
  if (opsStatus === "checked_in") return "Already checked in"
  if (opsStatus === "checked_out") return "Already checked out"
  return null
}

/** PURE (mirrors backend `checkOutBlockedReason`): reason a checkout is blocked. */
export function checkOutDisabledReason(opsStatus: string | null): string | null {
  if (opsStatus === "checked_in") return null
  if (opsStatus === "checked_out") return "Already checked out"
  return "Not checked in"
}

/** No-show is only offered on a still-expected arrival. */
export function noShowDisabledReason(opsStatus: string | null): string | null {
  if (opsStatus === "checked_in") return "Guest is already in-house"
  if (opsStatus === "checked_out") return "Stay is already checked out"
  if (opsStatus === "no_show") return "Already marked no-show"
  return null
}
