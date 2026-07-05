/**
 * Pure view-model for the maintenance-blocks manager (PLAN §4.3). Classifies a
 * block relative to a business date (current / upcoming / past, or `closed` once
 * it is resolved / cancelled) and computes its inclusive day span, then orders a
 * list so the operator sees live blocks first. Dependency-free and unit-tested.
 */

/** Where a block sits relative to today, or `closed` for a non-active block. */
export type MaintenanceTimeline = "current" | "upcoming" | "past" | "closed"

/** Structural subset needed to classify a block. */
export interface MaintenanceTimelineInput {
  status: "active" | "resolved" | "cancelled"
  fromDate: string
  toDate: string
}

/** Inclusive day count of a `[from, to]` block; 0 for an inverted/invalid range. */
export function daysInclusive(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0
  return Math.round((b - a) / 86_400_000) + 1
}

/**
 * Classify a block against `today`. Resolved / cancelled blocks are always
 * `closed`; an active block is `past` once its window has ended, `upcoming`
 * before it starts, otherwise `current`.
 */
export function maintenanceTimeline(
  block: MaintenanceTimelineInput,
  today: string,
): MaintenanceTimeline {
  if (block.status !== "active") return "closed"
  if (block.toDate < today) return "past"
  if (block.fromDate > today) return "upcoming"
  return "current"
}

const TIMELINE_RANK: Record<MaintenanceTimeline, number> = {
  current: 0,
  upcoming: 1,
  past: 2,
  closed: 3,
}

/** A block wrapped with its derived timeline + day span for the table. */
export interface MaintenanceRow<B extends MaintenanceTimelineInput = MaintenanceTimelineInput> {
  block: B
  timeline: MaintenanceTimeline
  days: number
}

/** Wrap a block into its display row. */
export function toMaintenanceRow<B extends MaintenanceTimelineInput>(
  block: B,
  today: string,
): MaintenanceRow<B> {
  return {
    block,
    timeline: maintenanceTimeline(block, today),
    days: daysInclusive(block.fromDate, block.toDate),
  }
}

/**
 * Order rows: current → upcoming → past → closed, and within a bucket by start
 * date ascending. Returns a new array (does not mutate the input).
 */
export function sortMaintenanceRows<B extends MaintenanceTimelineInput>(
  rows: readonly MaintenanceRow<B>[],
): MaintenanceRow<B>[] {
  return [...rows].sort((a, b) => {
    if (a.timeline !== b.timeline) return TIMELINE_RANK[a.timeline] - TIMELINE_RANK[b.timeline]
    return a.block.fromDate.localeCompare(b.block.fromDate)
  })
}
