/**
 * Inbound reservation → real PMS booking ingest (PLAN §4.7).
 *
 * A clean PROGRAMMATIC booking path exists (verified against the catalog booking
 * engine): price + validate the stay with `quoteOwnedStay`, then persist it with
 * the shared `persistStayBooking` write path — the exact same transaction the
 * catalog owned-accommodation handler uses. No HTTP context, no quote row, no
 * source-adapter registry needed.
 *
 * Happy-path scope for this skeleton: a `confirmed` reservation whose `roomTypeRef`
 * AND `ratePlanRef` resolve to real owned inventory for the requested dates. A
 * missing rate plan, an unavailable/unpriced stay, or a `modified`/`cancelled`
 * reservation does NOT book — it is recorded and reported honestly (the caller
 * marks the ledger row `failed`/`ignored`). Modification/cancellation mirroring is
 * a documented follow-up.
 */

import { quoteOwnedStay } from "@voyant-travel/accommodations/service-owned-stays"
import { asPostgresDb } from "../../api/lib/booking-engine-db.js"
import { persistStayBooking } from "../../api/lib/persist-stay-booking.js"
import type { InboundReservation } from "./connector.js"
import type { ChannelsDb } from "./db.js"
import { splitGuestName } from "./normalize.js"

export type IngestOutcome =
  | { ok: true; bookingId: string; bookingNumber?: string }
  | { ok: false; reason: string }

/**
 * Turn a normalized `confirmed` reservation into a booking. Resolves the room type
 * + rate plan by exact id ref against the owned-stay quote (which also validates
 * availability and produces the per-night rates), then persists.
 */
export async function ingestReservation(
  db: ChannelsDb,
  reservation: InboundReservation,
  opts: { userId?: string } = {},
): Promise<IngestOutcome> {
  if (!reservation.ratePlanRef) {
    return { ok: false, reason: "reservation has no ratePlanRef — cannot resolve owned rate" }
  }

  const occupancy = {
    adults: reservation.occupancy.adults,
    children: reservation.occupancy.children ?? 0,
    infants: reservation.occupancy.infants ?? 0,
  }

  const quote = await quoteOwnedStay(db, {
    roomTypeId: reservation.roomTypeRef,
    ratePlanId: reservation.ratePlanRef,
    checkIn: reservation.checkIn,
    checkOut: reservation.checkOut,
    roomCount: 1,
    occupancy,
    currency: reservation.currency,
  })

  if (quote.status !== "ok") {
    return { ok: false, reason: `owned-stay quote failed: ${quote.status}` }
  }
  if (!quote.available) {
    return { ok: false, reason: "owned-stay not available for the requested dates" }
  }

  const { firstName, lastName } = splitGuestName(reservation.guest.name)

  const result = await persistStayBooking(
    asPostgresDb(db),
    {
      propertyId: quote.propertyId,
      roomTypeId: reservation.roomTypeRef,
      ratePlanId: reservation.ratePlanRef,
      mealPlanId: quote.mealPlanId ?? null,
      checkInDate: reservation.checkIn,
      checkOutDate: reservation.checkOut,
      roomCount: quote.roomCount,
      adults: occupancy.adults,
      children: occupancy.children,
      infants: occupancy.infants,
      dailyRates: quote.nightlyRates.map((rate) => ({
        sellCurrency: rate.sellCurrency,
        sellAmountCents: rate.sellAmountCents,
        costCurrency: rate.costCurrency ?? null,
        costAmountCents: rate.costAmountCents ?? null,
      })),
      contact: {
        firstName,
        lastName,
        email: reservation.guest.email ?? null,
        phone: reservation.guest.phone ?? null,
      },
      passengers: [
        {
          firstName,
          lastName,
          email: reservation.guest.email ?? null,
          phone: reservation.guest.phone ?? null,
          isPrimary: true,
        },
      ],
      notes: `Channel reservation ${reservation.channel} #${reservation.channelReservationId}`,
    },
    { userId: opts.userId },
  )

  if (result.status !== "ok" || !result.bookingId) {
    return { ok: false, reason: result.reason ?? "persistStayBooking failed" }
  }
  return { ok: true, bookingId: result.bookingId, bookingNumber: result.bookingNumber }
}
