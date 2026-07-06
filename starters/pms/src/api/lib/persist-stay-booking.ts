/**
 * The single accommodation-booking write path, shared by the catalog booking
 * engine's owned handler (`retained-vertical-booking-handlers.ts`) and the
 * channel-reservation ingest path (`src/modules/channels/service-ingest.ts`).
 *
 * It is intentionally db-only: given a resolved {@link AccommodationCommitBridgeInput}
 * (property/room-type/rate-plan ids, dates, per-night rates, contact + passengers)
 * it inserts `bookings` + travelers + `booking_items` + `stay_booking_items` +
 * `stay_daily_rates` in ONE transaction and returns the booking id. No Hono
 * context, no source-adapter registry, no quote row — the caller supplies the
 * priced input (the engine via its draft, the channel ingest via `quoteOwnedStay`).
 */

import type { AccommodationCommitBridgeInput } from "@voyant-travel/accommodations/booking-engine"
import { stayBookingItems, stayDailyRates } from "@voyant-travel/accommodations/schema"
import { bookingItems, bookingsService } from "@voyant-travel/bookings"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export interface PersistStayBookingResult {
  status: "ok" | "failed"
  bookingId?: string
  bookingNumber?: string
  reason?: string
}

/**
 * Booking origin, recorded on the existing `bookings.source_type` column so
 * reports can distinguish a front-desk-created reservation (`direct`) from an OTA
 * ingest (`ota`) or a walk-in draft (`manual`) without widening any table.
 */
export type StayBookingSource = "direct" | "manual" | "ota" | "internal"

/**
 * Persist a priced accommodation stay as a real PMS booking. Mirrors exactly the
 * previous inline commit-bridge body (behavior-preserving extraction).
 */
export async function persistStayBooking(
  db: PostgresJsDatabase,
  input: AccommodationCommitBridgeInput,
  opts?: {
    userId?: string
    source?: StayBookingSource
    /**
     * Lifecycle entry point. The booking-engine/checkout flow creates `draft`
     * bookings (confirmed later by the finalize saga); staff flows create
     * `on_hold` — the state `bookingsService.confirmBooking` requires.
     */
    initialStatus?: "draft" | "on_hold"
  },
): Promise<PersistStayBookingResult> {
  try {
    const roomCount = input.roomCount ?? 1
    const adults = input.adults ?? 1
    const children = input.children ?? 0
    const infants = input.infants ?? 0
    const currency = input.dailyRates[0]?.sellCurrency ?? "EUR"
    const sellAmountCents = input.dailyRates.reduce(
      (sum, rate) => sum + (rate.sellAmountCents ?? 0) * roomCount,
      0,
    )
    const costAmountCents = input.dailyRates.reduce(
      (sum, rate) => sum + (rate.costAmountCents ?? 0) * roomCount,
      0,
    )
    const nights = Math.max(
      1,
      Math.round(
        (Date.parse(`${input.checkOutDate}T00:00:00.000Z`) -
          Date.parse(`${input.checkInDate}T00:00:00.000Z`)) /
          86_400_000,
      ),
    )

    return await db.transaction(async (tx) => {
      const booking = await bookingsService.createBooking(
        tx,
        {
          bookingNumber: generateStayBookingNumber(),
          sellCurrency: currency,
          status: opts?.initialStatus ?? "draft",
          sourceType: opts?.source ?? "manual",
          personId: input.personId ?? null,
          organizationId: input.organizationId ?? null,
          contactFirstName: input.contact.firstName,
          contactLastName: input.contact.lastName,
          contactEmail: input.contact.email ?? null,
          contactPhone: input.contact.phone ?? null,
          contactCountry: input.contact.country ?? null,
          sellAmountCents,
          costAmountCents,
          pax: adults + children + infants,
          startDate: input.checkInDate,
          endDate: input.checkOutDate,
          internalNotes: input.notes ?? null,
        },
        opts?.userId,
      )
      if (!booking) throw new Error("bookingsService.createBooking returned null")

      for (const [index, passenger] of input.passengers.entries()) {
        await bookingsService.createTraveler(
          tx,
          booking.id,
          {
            firstName: passenger.firstName,
            lastName: passenger.lastName,
            email: passenger.email ?? null,
            phone: passenger.phone ?? null,
            travelerCategory: passenger.travelerCategory ?? null,
            isPrimary: passenger.isPrimary ?? index === 0,
          },
          opts?.userId,
        )
      }

      const [bookingItem] = await tx
        .insert(bookingItems)
        .values({
          bookingId: booking.id,
          title: "Accommodation stay",
          itemType: "unit",
          status: "on_hold",
          serviceDate: input.checkInDate,
          quantity: roomCount,
          sellCurrency: currency,
          unitSellAmountCents: Math.round(sellAmountCents / roomCount),
          totalSellAmountCents: sellAmountCents,
          costCurrency: costAmountCents > 0 ? currency : null,
          unitCostAmountCents: costAmountCents > 0 ? Math.round(costAmountCents / roomCount) : null,
          totalCostAmountCents: costAmountCents > 0 ? costAmountCents : null,
          metadata: {
            propertyId: input.propertyId,
            roomTypeId: input.roomTypeId,
            ratePlanId: input.ratePlanId,
            mealPlanId: input.mealPlanId ?? null,
          },
        })
        .returning()

      if (!bookingItem) throw new Error("booking item insert returned null")

      const [stayItem] = await tx
        .insert(stayBookingItems)
        .values({
          bookingItemId: bookingItem.id,
          propertyId: input.propertyId,
          roomTypeId: input.roomTypeId,
          ratePlanId: input.ratePlanId,
          mealPlanId: input.mealPlanId ?? null,
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
          nightCount: nights,
          roomCount,
          adults,
          children,
          infants,
          status: "reserved",
          notes: input.notes ?? null,
        })
        .returning()

      if (!stayItem) throw new Error("stay booking item insert returned null")

      await tx.insert(stayDailyRates).values(
        input.dailyRates.map((rate, index) => ({
          stayBookingItemId: stayItem.id,
          date: addDays(input.checkInDate, index),
          sellCurrency: rate.sellCurrency,
          sellAmountCents: rate.sellAmountCents ?? null,
          costCurrency: rate.costCurrency ?? null,
          costAmountCents: rate.costAmountCents ?? null,
        })),
      )

      return {
        status: "ok" as const,
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
      }
    })
  } catch (err) {
    return {
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Persist and immediately confirm a stay booking. Used for staff-created
 * (front-desk) reservations, which have no payment step gating confirmation —
 * the checkout/finalize saga confirms storefront bookings instead.
 */
export async function persistConfirmedStayBooking(
  db: PostgresJsDatabase,
  input: AccommodationCommitBridgeInput,
  opts?: { userId?: string; source?: StayBookingSource },
): Promise<PersistStayBookingResult> {
  // `confirmBooking` requires the staff-brokered `on_hold` entry state — it
  // deliberately refuses to confirm straight from `draft`.
  const result = await persistStayBooking(db, input, { ...opts, initialStatus: "on_hold" })
  if (result.status !== "ok" || !result.bookingId) return result
  const confirmed = await bookingsService.confirmBooking(db, result.bookingId, {}, opts?.userId)
  if (confirmed.status !== "ok") {
    return {
      status: "failed",
      reason: `reservation persisted as ${result.bookingNumber} but confirmation failed (${confirmed.status})`,
    }
  }
  return result
}

export function generateStayBookingNumber(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, "0")
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `STAY-${y}${m}-${suffix}`
}

export function addDays(date: string, offset: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + offset)
  return value.toISOString().slice(0, 10)
}
