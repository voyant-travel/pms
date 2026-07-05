/**
 * PURE task-generation planning (PLAN §4.3). Turns the day's departures and
 * stayovers into the set of housekeeping tasks that SHOULD exist for a business
 * date, keyed by a deterministic idempotency `sourceKey` so re-running the
 * generation converges (the db write is `INSERT … ON CONFLICT (source_key) DO
 * NOTHING`). No db here — the caller loads the departures/stayovers and persists
 * the plan.
 *
 * Semantics:
 *   - departures (a stay whose check-out == date) → a `clean` task per assigned
 *     unit, and the unit is marked room-status `dirty` (guest left).
 *   - stayovers (a stay in-house spanning the date, i.e. check-in < date <
 *     check-out) → a light `turndown` task per assigned unit (chosen over a
 *     second `clean`: an occupied room gets a turndown/refresh, not a full
 *     turnover clean).
 *
 * A unit cannot be both a departure and a stayover on the same date (the stay
 * either leaves that day or stays the night), but the plan de-duplicates by
 * `sourceKey` defensively and lets a departure win over a stayover for a unit.
 */

export type GeneratedTaskKind = "dep" | "stay"

export interface StayUnitRef {
  bookingItemId: string
  unitId: string
}

export interface PlannedTask {
  unitId: string
  propertyId: string
  type: "clean" | "turndown"
  dueDate: string
  source: "auto"
  sourceKey: string
}

export interface GenerationPlan {
  tasks: PlannedTask[]
  /** Units whose guest departed on the date — their room status becomes `dirty`. */
  dirtyUnitIds: string[]
}

/** PURE: the deterministic idempotency key for an auto task. */
export function buildSourceKey(kind: GeneratedTaskKind, unitId: string, date: string): string {
  return `${kind}:${unitId}:${date}`
}

export interface PlanGenerationInput {
  propertyId: string
  date: string
  departures: readonly StayUnitRef[]
  stayovers: readonly StayUnitRef[]
}

/** PURE: build the day's generation plan (tasks + units to mark dirty). */
export function planGeneratedTasks(input: PlanGenerationInput): GenerationPlan {
  const { propertyId, date } = input
  const byKey = new Map<string, PlannedTask>()
  const dirtyUnitIds = new Set<string>()

  // Departures first so a departure `clean` wins the unit's sourceKey slot.
  for (const ref of input.departures) {
    dirtyUnitIds.add(ref.unitId)
    const sourceKey = buildSourceKey("dep", ref.unitId, date)
    if (!byKey.has(sourceKey)) {
      byKey.set(sourceKey, {
        unitId: ref.unitId,
        propertyId,
        type: "clean",
        dueDate: date,
        source: "auto",
        sourceKey,
      })
    }
  }

  for (const ref of input.stayovers) {
    // Skip a stayover turndown for a unit that already has a departure clean.
    if (dirtyUnitIds.has(ref.unitId)) continue
    const sourceKey = buildSourceKey("stay", ref.unitId, date)
    if (!byKey.has(sourceKey)) {
      byKey.set(sourceKey, {
        unitId: ref.unitId,
        propertyId,
        type: "turndown",
        dueDate: date,
        source: "auto",
        sourceKey,
      })
    }
  }

  return { tasks: [...byKey.values()], dirtyUnitIds: [...dirtyUnitIds] }
}
