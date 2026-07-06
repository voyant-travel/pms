/**
 * Public, guest-authorized rich stay-booking detail.
 *
 * The generic `/v1/public/bookings/overview` endpoint returns a
 * vertical-agnostic snapshot (status, dates, travelers, line totals) but
 * NOT the owned-stay specifics a hotel confirmation needs: property name +
 * address, room type, rate plan, board/meal, and the per-night rate
 * breakdown. Those live in the accommodations `stay_booking_items` /
 * `stay_daily_rates` tables (joined to labels in operations/accommodations),
 * which no public endpoint exposes. This template route composes them.
 *
 * Authorization mirrors the upstream overview access model EXACTLY so a
 * guessed booking id cannot leak a stay:
 *   - `?email=` present  → the email must match a traveler on the booking
 *     (delegated to `publicBookingsService.getOverviewByLookup`, which
 *     performs the constant-time match and throws on mismatch). Used by the
 *     post-checkout confirmation page, which stashes the payer email.
 *   - no `email`         → a valid `voyant_guest_booking` capability
 *     (cookie or `X-Voyant-Guest-Booking-Access` header, scoped to this
 *     bookingId, action `overview:read`) is required. Minted by the
 *     rate-limited `/v1/public/bookings/guest-lookup` used by find-my-booking.
 *
 * The generic overview is reused for the authorization + traveler/status/
 * total facts; this route only adds the accommodation join on top.
 */

import {
  mealPlans,
  ratePlans,
  roomTypes,
  stayBookingItems,
  stayDailyRates,
} from "@voyant-travel/accommodations/schema"
import { bookingItems, publicBookingsService } from "@voyant-travel/bookings"
import { requireGuestBookingAccess } from "@voyant-travel/bookings/checkout-capability"
import { bookings } from "@voyant-travel/bookings/schema"
import {
  facilities,
  facilityAddressProjections,
  properties,
} from "@voyant-travel/operations/places"
import { eq, inArray } from "drizzle-orm"
import type { Hono } from "hono"

export interface StayBookingNightlyRate {
  date: string
  amountCents: number | null
  currency: string
}

export interface StayBookingRoomLine {
  stayItemId: string
  roomTypeName: string | null
  ratePlanName: string | null
  ratePlanRefundable: boolean | null
  mealPlanName: string | null
  checkInDate: string
  checkOutDate: string
  nightCount: number
  roomCount: number
  adults: number
  children: number
  infants: number
  confirmationCode: string | null
  currency: string
  nightly: StayBookingNightlyRate[]
  subtotalCents: number | null
}

export interface StayBookingProperty {
  name: string | null
  checkInTime: string | null
  checkOutTime: string | null
  address: {
    line1: string | null
    line2: string | null
    city: string | null
    region: string | null
    postalCode: string | null
    country: string | null
    fullText: string | null
  }
}

export interface StayBookingTraveler {
  firstName: string
  lastName: string
  isPrimary: boolean
}

export interface StayBookingDetail {
  bookingId: string
  bookingNumber: string
  status: string
  currency: string
  totalCents: number | null
  startDate: string | null
  endDate: string | null
  pax: number | null
  confirmedAt: string | null
  cancelledAt: string | null
  completedAt: string | null
  property: StayBookingProperty
  rooms: StayBookingRoomLine[]
  travelers: StayBookingTraveler[]
}

// Loosely-typed drizzle handle: the app injects either the neon-http or the
// WebSocket client depending on the surface; both share the query-builder API.
type Db = Parameters<typeof publicBookingsService.getOverviewByLookup>[0]

/**
 * Mount `GET /v1/public/stay-bookings/:bookingId` on the root Hono app.
 * The prefix must also be listed in `publicPaths` (see `api/app.ts`).
 */
export function mountStayBookingDetailRoutes(hono: Hono): void {
  hono.get("/v1/public/stay-bookings/:bookingId", async (c) => {
    const bookingId = c.req.param("bookingId")
    const email = c.req.query("email")
    // The app injects a request-scoped drizzle handle under `db`; the plain
    // `Hono` type here doesn't know that variable, so read it via a cast.
    const db = (c as unknown as { get: (key: string) => unknown }).get("db") as Db

    // Authorize + fetch the generic overview (travelers / status / total).
    // A mismatched email, missing/invalid capability, or unknown booking all
    // collapse to a single opaque 404 — never disclose which booking ids exist.
    // (`getOverview*` returns `null` on email/id mismatch rather than throwing;
    // `requireGuestBookingAccess` throws on a missing/invalid capability.)
    let overview: Awaited<ReturnType<typeof publicBookingsService.getOverviewByLookup>>
    try {
      if (email) {
        overview = await publicBookingsService.getOverviewByLookup(db, { bookingId, email })
      } else {
        await requireGuestBookingAccess(
          c,
          bookingId,
          "overview:read",
          c.env as Record<string, string | undefined>,
        )
        overview = await publicBookingsService.getOverviewByGuestAccess(db, { bookingId })
      }
    } catch {
      return c.json({ error: "not_found" }, 404)
    }
    if (!overview) return c.json({ error: "not_found" }, 404)

    const rooms = await loadStayRooms(db, bookingId)

    const detail: StayBookingDetail = {
      bookingId: overview.bookingId,
      bookingNumber: overview.bookingNumber,
      status: overview.status,
      currency: overview.sellCurrency,
      totalCents: overview.sellAmountCents,
      startDate: overview.startDate,
      endDate: overview.endDate,
      pax: overview.pax,
      confirmedAt: overview.confirmedAt,
      cancelledAt: overview.cancelledAt,
      completedAt: overview.completedAt,
      property: rooms.property,
      rooms: rooms.lines,
      travelers: overview.travelers.map((t) => ({
        firstName: t.firstName,
        lastName: t.lastName,
        isPrimary: t.isPrimary,
      })),
    }

    return c.json({ data: detail })
  })
}

async function loadStayRooms(
  db: Db,
  bookingId: string,
): Promise<{ property: StayBookingProperty; lines: StayBookingRoomLine[] }> {
  const rows = await db
    .select({
      stayItemId: stayBookingItems.id,
      checkInDate: stayBookingItems.checkInDate,
      checkOutDate: stayBookingItems.checkOutDate,
      nightCount: stayBookingItems.nightCount,
      roomCount: stayBookingItems.roomCount,
      adults: stayBookingItems.adults,
      children: stayBookingItems.children,
      infants: stayBookingItems.infants,
      confirmationCode: stayBookingItems.confirmationCode,
      roomTypeName: roomTypes.name,
      ratePlanName: ratePlans.name,
      ratePlanRefundable: ratePlans.refundable,
      ratePlanCurrency: ratePlans.currencyCode,
      mealPlanName: mealPlans.name,
      propertyName: facilities.name,
      checkInTime: properties.checkInTime,
      checkOutTime: properties.checkOutTime,
      addrLine1: facilityAddressProjections.line1,
      addrLine2: facilityAddressProjections.line2,
      addrCity: facilityAddressProjections.city,
      addrRegion: facilityAddressProjections.region,
      addrPostal: facilityAddressProjections.postalCode,
      addrCountry: facilityAddressProjections.country,
      addrFull: facilityAddressProjections.fullText,
    })
    .from(bookings)
    .innerJoin(bookingItems, eq(bookingItems.bookingId, bookings.id))
    .innerJoin(stayBookingItems, eq(stayBookingItems.bookingItemId, bookingItems.id))
    .leftJoin(roomTypes, eq(roomTypes.id, stayBookingItems.roomTypeId))
    .leftJoin(ratePlans, eq(ratePlans.id, stayBookingItems.ratePlanId))
    .leftJoin(mealPlans, eq(mealPlans.id, ratePlans.mealPlanId))
    .leftJoin(properties, eq(properties.id, stayBookingItems.propertyId))
    .leftJoin(facilities, eq(facilities.id, properties.facilityId))
    .leftJoin(
      facilityAddressProjections,
      eq(facilityAddressProjections.facilityId, properties.facilityId),
    )
    .where(eq(bookings.id, bookingId))

  const property: StayBookingProperty = {
    name: rows[0]?.propertyName ?? null,
    checkInTime: rows[0]?.checkInTime ?? null,
    checkOutTime: rows[0]?.checkOutTime ?? null,
    address: {
      line1: rows[0]?.addrLine1 ?? null,
      line2: rows[0]?.addrLine2 ?? null,
      city: rows[0]?.addrCity ?? null,
      region: rows[0]?.addrRegion ?? null,
      postalCode: rows[0]?.addrPostal ?? null,
      country: rows[0]?.addrCountry ?? null,
      fullText: rows[0]?.addrFull ?? null,
    },
  }

  if (rows.length === 0) return { property, lines: [] }

  const stayItemIds = rows.map((r) => r.stayItemId)
  const nightlyRows = await db
    .select({
      stayBookingItemId: stayDailyRates.stayBookingItemId,
      date: stayDailyRates.date,
      amountCents: stayDailyRates.sellAmountCents,
      currency: stayDailyRates.sellCurrency,
    })
    .from(stayDailyRates)
    .where(inArray(stayDailyRates.stayBookingItemId, stayItemIds))
    .orderBy(stayDailyRates.date)

  const nightlyByItem = new Map<string, StayBookingNightlyRate[]>()
  for (const n of nightlyRows) {
    const list = nightlyByItem.get(n.stayBookingItemId) ?? []
    list.push({ date: n.date, amountCents: n.amountCents, currency: n.currency })
    nightlyByItem.set(n.stayBookingItemId, list)
  }

  const lines: StayBookingRoomLine[] = rows.map((r) => {
    const nightly = nightlyByItem.get(r.stayItemId) ?? []
    const subtotalCents = nightly.length
      ? nightly.reduce((sum, night) => sum + (night.amountCents ?? 0), 0)
      : null
    return {
      stayItemId: r.stayItemId,
      roomTypeName: r.roomTypeName,
      ratePlanName: r.ratePlanName,
      ratePlanRefundable: r.ratePlanRefundable,
      mealPlanName: r.mealPlanName,
      checkInDate: r.checkInDate,
      checkOutDate: r.checkOutDate,
      nightCount: r.nightCount,
      roomCount: r.roomCount,
      adults: r.adults,
      children: r.children,
      infants: r.infants,
      confirmationCode: r.confirmationCode,
      currency: r.ratePlanCurrency ?? "EUR",
      nightly,
      subtotalCents,
    }
  })

  return { property, lines }
}
