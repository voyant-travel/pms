/**
 * Idempotent auto-generation of housekeeping tasks for a business date (PLAN
 * §4.3). Loads the day's reserved, unit-assigned stays for a property, classifies
 * them into departures (check-out == date) and stayovers (in-house spanning the
 * date), plans the tasks via the PURE `planGeneratedTasks`, then writes them with
 * `INSERT … ON CONFLICT (source_key) DO NOTHING` so re-running the same date is a
 * no-op. Departed units are marked room-status `dirty`.
 *
 * The stay read lives here (not imported from front-desk) so housekeeping never
 * depends on front-desk — the reverse edge (front-desk → housekeeping readiness)
 * is the wired one, and a bidirectional import would cycle.
 */

import { stayBookingItems } from "@voyant-travel/accommodations/schema"
import { and, eq, gte, lte } from "drizzle-orm"

import { unitAssignments } from "../units/schema.js"
import type { HousekeepingDb } from "./db.js"
import { type PlanGenerationInput, planGeneratedTasks, type StayUnitRef } from "./generation.js"
import { housekeepingTasks } from "./schema.js"
import { markUnitsDirty } from "./service-room-status.js"

export interface GenerationResult {
  propertyId: string
  date: string
  departures: number
  stayovers: number
  planned: number
  inserted: number
  markedDirty: number
}

/**
 * Load the day's reserved, unit-assigned stays and split them into departures and
 * stayovers for `date`. Arrivals (check-in == date) get no cleaning task.
 */
export async function loadGenerationInput(
  db: HousekeepingDb,
  propertyId: string,
  date: string,
): Promise<Pick<PlanGenerationInput, "departures" | "stayovers">> {
  const rows = await db
    .select({
      bookingItemId: stayBookingItems.bookingItemId,
      unitId: unitAssignments.unitId,
      checkInDate: stayBookingItems.checkInDate,
      checkOutDate: stayBookingItems.checkOutDate,
    })
    .from(stayBookingItems)
    .innerJoin(unitAssignments, eq(unitAssignments.bookingItemId, stayBookingItems.bookingItemId))
    .where(
      and(
        eq(stayBookingItems.propertyId, propertyId),
        eq(stayBookingItems.status, "reserved"),
        lte(stayBookingItems.checkInDate, date),
        gte(stayBookingItems.checkOutDate, date),
      ),
    )

  const departures: StayUnitRef[] = []
  const stayovers: StayUnitRef[] = []
  for (const r of rows) {
    const ref: StayUnitRef = { bookingItemId: r.bookingItemId, unitId: r.unitId }
    if (r.checkOutDate === date) departures.push(ref)
    else if (r.checkInDate < date && r.checkOutDate > date) stayovers.push(ref)
  }
  return { departures, stayovers }
}

/** Generate (idempotently) the housekeeping tasks for `propertyId` on `date`. */
export async function generateTasksForDate(
  db: HousekeepingDb,
  propertyId: string,
  date: string,
): Promise<GenerationResult> {
  const { departures, stayovers } = await loadGenerationInput(db, propertyId, date)
  const plan = planGeneratedTasks({ propertyId, date, departures, stayovers })

  let inserted = 0
  if (plan.tasks.length > 0) {
    const rows = await db
      .insert(housekeepingTasks)
      .values(plan.tasks.map((t) => ({ ...t, status: "open" as const })))
      // Fresh PK ids, so the only possible conflict is the unique `source_key`
      // (idempotency): DO NOTHING on any conflict re-runs a date as a no-op.
      .onConflictDoNothing()
      .returning()
    inserted = rows.length
  }

  const markedDirty = await markUnitsDirty(db, plan.dirtyUnitIds)

  return {
    propertyId,
    date,
    departures: departures.length,
    stayovers: stayovers.length,
    planned: plan.tasks.length,
    inserted,
    markedDirty,
  }
}
