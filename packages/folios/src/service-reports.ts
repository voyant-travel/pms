/**
 * Daily-report query layer (PLAN §4.4). Resolves the counts + posting sums the
 * PURE `reports.ts` needs for a property's business date, then assembles the KPI
 * report. Occupancy uses the units + assignment tables pragmatically (occupied =
 * unit assignments covering the night; sellable = active, available units).
 */

import { stayBookingItems } from "@voyant-travel/accommodations/schema"
import { roomUnits, unitAssignments } from "@voyant-travel/pms-units/schema"
import { and, count, eq, gt, lte, sql } from "drizzle-orm"
import type { FoliosDb } from "./db.js"
import { buildDailyReport, type DailyReport } from "./reports.js"
import { folioPostings, folios } from "./schema.js"

/** Count active, available (sellable) units for a property. */
async function countSellableUnits(db: FoliosDb, propertyId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(roomUnits)
    .where(
      and(
        eq(roomUnits.propertyId, propertyId),
        eq(roomUnits.active, true),
        eq(roomUnits.status, "available"),
      ),
    )
  return row?.total ?? 0
}

/** Count units occupied on `date` — assignments covering the night (half-open). */
async function countOccupiedUnits(db: FoliosDb, propertyId: string, date: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(distinct ${unitAssignments.unitId})` })
    .from(unitAssignments)
    .innerJoin(roomUnits, eq(roomUnits.id, unitAssignments.unitId))
    .where(
      and(
        eq(roomUnits.propertyId, propertyId),
        lte(unitAssignments.fromDate, date),
        gt(unitAssignments.toDate, date),
      ),
    )
  return Number(row?.total ?? 0)
}

/** Rooms sold on `date` — sum of roomCount over in-house reserved stays. */
async function countRoomsSold(db: FoliosDb, propertyId: string, date: string): Promise<number> {
  const [row] = await db
    .select({ rooms: sql<number>`coalesce(sum(${stayBookingItems.roomCount}), 0)` })
    .from(stayBookingItems)
    .where(
      and(
        eq(stayBookingItems.propertyId, propertyId),
        eq(stayBookingItems.status, "reserved"),
        lte(stayBookingItems.checkInDate, date),
        gt(stayBookingItems.checkOutDate, date),
      ),
    )
  return Number(row?.rooms ?? 0)
}

/** Load the day's postings (type + amount) across the property's folios. */
async function loadDayPostings(db: FoliosDb, propertyId: string, date: string) {
  return db
    .select({ type: folioPostings.type, amountCents: folioPostings.amountCents })
    .from(folioPostings)
    .innerJoin(folios, eq(folios.id, folioPostings.folioId))
    .where(and(eq(folios.propertyId, propertyId), eq(folioPostings.businessDate, date)))
}

/** Assemble the daily KPI report (occupancy, rooms sold, ADR, RevPAR, revenue). */
export async function getDailyReport(
  db: FoliosDb,
  propertyId: string,
  date: string,
): Promise<DailyReport> {
  const [sellableUnits, occupiedUnits, roomsSold, postings] = await Promise.all([
    countSellableUnits(db, propertyId),
    countOccupiedUnits(db, propertyId, date),
    countRoomsSold(db, propertyId, date),
    loadDayPostings(db, propertyId, date),
  ])
  return buildDailyReport({ propertyId, date, occupiedUnits, sellableUnits, roomsSold, postings })
}
