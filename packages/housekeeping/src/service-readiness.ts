/**
 * Unit readiness lookup (PLAN §4.3) — the seam the front-desk check-in flow uses
 * to WARN (never block) when a unit isn't guest-ready. A unit is ready iff it is
 * housekeeping clean/inspected AND has no active maintenance block covering the
 * date. Injected into front-desk's check-in service (front-desk → housekeeping);
 * also exposed as `GET /housekeeping/readiness` for ad-hoc checks.
 */

import { and, eq, gte, inArray, lte } from "drizzle-orm"

import type { HousekeepingDb } from "./db.js"
import { maintenanceBlocks } from "./schema.js"
import { getUnitRoomStatuses } from "./service-room-status.js"
import { assessUnitReadiness, type UnitReadiness } from "./transitions.js"

/** Active maintenance-blocked unit ids covering `date` among `unitIds`. */
async function blockedUnitIdsOn(
  db: HousekeepingDb,
  unitIds: readonly string[],
  date: string,
): Promise<Set<string>> {
  if (unitIds.length === 0) return new Set()
  const rows = await db
    .select({ unitId: maintenanceBlocks.unitId })
    .from(maintenanceBlocks)
    .where(
      and(
        inArray(maintenanceBlocks.unitId, [...unitIds]),
        eq(maintenanceBlocks.status, "active"),
        lte(maintenanceBlocks.fromDate, date),
        gte(maintenanceBlocks.toDate, date),
      ),
    )
  return new Set(rows.map((r) => r.unitId))
}

/**
 * Assess readiness for a set of units on a date. Returns one entry per requested
 * unit id (order preserved), combining housekeeping room status with active
 * maintenance blocks.
 */
export async function getUnitReadiness(
  db: HousekeepingDb,
  unitIds: readonly string[],
  date: string,
): Promise<UnitReadiness[]> {
  const [statuses, blocked] = await Promise.all([
    getUnitRoomStatuses(db, unitIds),
    blockedUnitIdsOn(db, unitIds, date),
  ])
  return unitIds.map((unitId) =>
    assessUnitReadiness({
      unitId,
      roomStatus: statuses.get(unitId) ?? null,
      hasActiveMaintenanceBlock: blocked.has(unitId),
    }),
  )
}

/** The injectable lookup signature front-desk depends on structurally. */
export type UnitReadinessLookup = typeof getUnitReadiness
