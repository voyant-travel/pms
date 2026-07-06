/**
 * Night audit (PLAN §4.4). For a property's current business date D:
 *   1. select in-house reserved stays spanning night D (`checkIn <= D < checkOut`);
 *   2. ensure each has a stay folio, resolve its nightly room + tax amount from
 *      upstream `stay_daily_rates` (fallback: average nightly rate; else unpriced);
 *   3. post the room (and tax) charges idempotently (unique `source_key`);
 *   4. compute the day's report;
 *   5. roll the property's business date to D+1 and stamp `lastAuditRunAt`.
 *
 * Idempotency / re-run semantics (documented): every posting carries a
 * deterministic `source_key` (`room:<item>:<D>` / `tax:<item>:<D>`), inserted with
 * ON CONFLICT DO NOTHING, so re-running D — or overlapping with a manual post — is
 * a no-op. The whole run is NOT one DB transaction (Workers/neon-http can't always
 * offer one); instead the steps are idempotent and the date roll is LAST, so a
 * failure mid-run leaves `currentDate` at D and a re-run re-posts (no-ops) then
 * rolls. `lastAuditRunAt` records the most recent successful roll.
 */

import { roomTypes, stayBookingItems, stayDailyRates } from "@voyant-travel/accommodations/schema"
import { bookingItems, bookings } from "@voyant-travel/bookings/schema"
import { addDays, formatIsoDate } from "@voyant-travel/pms-units"
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm"
import type { FoliosDb } from "./db.js"
import {
  type AuditStay,
  enrichUnpriced,
  planNightAuditPostings,
  resolveNightlyAmountCents,
  type UnpricedStay,
} from "./night-audit.js"
import type { DailyReport } from "./reports.js"
import { type BusinessDateRow, businessDates, folioPostings } from "./schema.js"
import { ensureStayFolio } from "./service-folios.js"
import { getDailyReport } from "./service-reports.js"

/**
 * Read-only peek at the property's business-date row (no side effect). Returns
 * `null` when the property has never been audited (unlike `getOrInitBusinessDate`,
 * which lazily creates the row). Used by the night-audit page to display "today"
 * without rolling or initializing anything.
 */
export async function readBusinessDate(
  db: FoliosDb,
  propertyId: string,
): Promise<BusinessDateRow | null> {
  const [row] = await db
    .select()
    .from(businessDates)
    .where(eq(businessDates.propertyId, propertyId))
    .limit(1)
  return row ?? null
}

/** Read the property's current business date, initializing to today on first run. */
export async function getOrInitBusinessDate(db: FoliosDb, propertyId: string): Promise<string> {
  const [row] = await db
    .select({ currentDate: businessDates.currentDate })
    .from(businessDates)
    .where(eq(businessDates.propertyId, propertyId))
    .limit(1)
  if (row) return row.currentDate

  const today = formatIsoDate(new Date())
  await db
    .insert(businessDates)
    .values({ propertyId, currentDate: today })
    .onConflictDoNothing({ target: businessDates.propertyId })
  const [created] = await db
    .select({ currentDate: businessDates.currentDate })
    .from(businessDates)
    .where(eq(businessDates.propertyId, propertyId))
    .limit(1)
  return created?.currentDate ?? today
}

interface InHouseStayRow {
  stayId: string
  bookingItemId: string
  bookingId: string
  checkInDate: string
  checkOutDate: string
  nightCount: number
  currency: string
  bookingNumber: string | null
  contactFirstName: string | null
  contactLastName: string | null
  roomTypeName: string | null
}

/** Select the property's reserved stays that span night D. */
async function loadInHouseStays(
  db: FoliosDb,
  propertyId: string,
  date: string,
): Promise<InHouseStayRow[]> {
  return db
    .select({
      stayId: stayBookingItems.id,
      bookingItemId: stayBookingItems.bookingItemId,
      bookingId: bookingItems.bookingId,
      checkInDate: stayBookingItems.checkInDate,
      checkOutDate: stayBookingItems.checkOutDate,
      nightCount: stayBookingItems.nightCount,
      currency: bookings.sellCurrency,
      bookingNumber: bookings.bookingNumber,
      contactFirstName: bookings.contactFirstName,
      contactLastName: bookings.contactLastName,
      // Room type name is a cheap add: the stay already carries `roomTypeId`.
      roomTypeName: roomTypes.name,
    })
    .from(stayBookingItems)
    .innerJoin(bookingItems, eq(bookingItems.id, stayBookingItems.bookingItemId))
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .leftJoin(roomTypes, eq(roomTypes.id, stayBookingItems.roomTypeId))
    .where(
      and(
        eq(stayBookingItems.propertyId, propertyId),
        eq(stayBookingItems.status, "reserved"),
        lte(stayBookingItems.checkInDate, date),
        gt(stayBookingItems.checkOutDate, date),
      ),
    )
}

export type { UnpricedStay } from "./night-audit.js"

export interface NightAuditResult {
  propertyId: string
  businessDate: string
  inHouse: number
  posted: number
  unpriced: UnpricedStay[]
  rolledTo: string
  report: DailyReport
}

/** Run the night audit for a property's current business date. */
export async function runNightAudit(db: FoliosDb, propertyId: string): Promise<NightAuditResult> {
  const date = await getOrInitBusinessDate(db, propertyId)
  const inHouse = await loadInHouseStays(db, propertyId, date)

  // Resolve per-night amounts from stay_daily_rates: the row for D (sell + tax)
  // and each stay's total (fallback average). Batched to avoid N+1.
  const stayIds = inHouse.map((s) => s.stayId)
  const ratesForDate = stayIds.length
    ? await db
        .select({
          stayBookingItemId: stayDailyRates.stayBookingItemId,
          sellAmountCents: stayDailyRates.sellAmountCents,
          taxAmountCents: stayDailyRates.taxAmountCents,
        })
        .from(stayDailyRates)
        .where(
          and(inArray(stayDailyRates.stayBookingItemId, stayIds), eq(stayDailyRates.date, date)),
        )
    : []
  const totals = stayIds.length
    ? await db
        .select({
          stayBookingItemId: stayDailyRates.stayBookingItemId,
          total: sql<number>`coalesce(sum(${stayDailyRates.sellAmountCents}), 0)`,
        })
        .from(stayDailyRates)
        .where(inArray(stayDailyRates.stayBookingItemId, stayIds))
        .groupBy(stayDailyRates.stayBookingItemId)
    : []

  const rateByStay = new Map(ratesForDate.map((r) => [r.stayBookingItemId, r]))
  const totalByStay = new Map(totals.map((t) => [t.stayBookingItemId, Number(t.total)]))

  const stays: AuditStay[] = []
  for (const s of inHouse) {
    const folio = await ensureStayFolio(db, {
      propertyId,
      bookingId: s.bookingId,
      bookingItemId: s.bookingItemId,
      currency: s.currency,
    })
    const rate = rateByStay.get(s.stayId)
    stays.push({
      bookingItemId: s.bookingItemId,
      folioId: folio.id,
      checkInDate: s.checkInDate,
      checkOutDate: s.checkOutDate,
      currency: s.currency,
      roomAmountCents: resolveNightlyAmountCents(
        rate?.sellAmountCents ?? null,
        totalByStay.get(s.stayId) ?? null,
        s.nightCount,
      ),
      taxAmountCents: rate?.taxAmountCents ?? null,
    })
  }

  const plan = planNightAuditPostings(date, stays)
  let posted = 0
  if (plan.postings.length > 0) {
    const rows = await db
      .insert(folioPostings)
      .values(plan.postings)
      .onConflictDoNothing({ target: folioPostings.sourceKey })
      .returning()
    posted = rows.length
  }

  // Report reflects the just-posted room charges for D.
  const report = await getDailyReport(db, propertyId, date)

  // Roll the business date to D+1 (last step — idempotent re-run before this
  // re-posts as no-ops, then rolls).
  const rolledTo = addDays(date, 1)
  await db
    .update(businessDates)
    .set({ currentDate: rolledTo, lastAuditRunAt: new Date(), updatedAt: new Date() })
    .where(eq(businessDates.propertyId, propertyId))

  // Enrich the planner's raw unpriced booking-item ids with the human labels the
  // in-house join already loaded (booking number, guest, room type).
  const labelsById = new Map(
    inHouse.map((s) => [
      s.bookingItemId,
      {
        bookingNumber: s.bookingNumber,
        guestName: joinName(s.contactFirstName, s.contactLastName),
        roomTypeName: s.roomTypeName,
      },
    ]),
  )
  const unpriced: UnpricedStay[] = enrichUnpriced(plan.unpriced, labelsById)

  return {
    propertyId,
    businessDate: date,
    inHouse: inHouse.length,
    posted,
    unpriced,
    rolledTo,
    report,
  }
}

/** Join a contact's first/last name into a single display name, or null. */
function joinName(first: string | null, last: string | null): string | null {
  const name = [first, last].filter(Boolean).join(" ").trim()
  return name.length > 0 ? name : null
}
