"use client"

import {
  type BookingDraftV1,
  bookingDraftV1,
} from "@voyant-travel/catalog-contracts/booking-engine/contracts"
import { useBookingQuote } from "@voyant-travel/catalog-react/booking-engine"
import { useMemo } from "react"

import { countNights } from "@/components/storefront/stay-search"

/**
 * Live "from / night" price for a property card. Reuses the very same
 * booking-quote engine the property page and operator use — quotes the
 * cheapest (room, rate) pair for the given window, then divides by the
 * night count. Renders nothing until a real price lands, so cards never
 * show a fabricated number.
 */
export function PropertyFromPrice({
  entityId,
  roomId,
  ratePlanId,
  checkIn,
  checkOut,
  adults = 2,
  className = "",
}: {
  entityId: string
  roomId: string | null
  ratePlanId: string | null
  checkIn: string
  checkOut: string
  adults?: number
  className?: string
}): React.ReactElement | null {
  const draft = useMemo<BookingDraftV1 | null>(() => {
    if (!roomId || !ratePlanId || !checkIn || !checkOut) return null
    return bookingDraftV1.parse({
      entity: { module: "accommodations", id: entityId, sourceKind: "" },
      configure: {
        dateRange: { checkIn, checkOut },
        pax: { adult: adults, child: 0 },
      },
      accommodation: {
        rooms: [{ optionUnitId: roomId, quantity: 1, ratePlanId }],
        travelerAssignments: {},
      },
    })
  }, [entityId, roomId, ratePlanId, checkIn, checkOut, adults])

  const quote = useBookingQuote({ surface: "public", draft })
  const total = quote.data?.pricing?.total
  const currency = quote.data?.pricing?.currency
  const nights = countNights(checkIn, checkOut) ?? 1

  if (!total || !currency || quote.data?.available === false) return null
  const perNight = total / nights

  return (
    <span className={className}>
      <span className="text-[var(--acme-ink-faint)]">from </span>
      <span className="font-medium text-[var(--acme-ink)]">{formatMoney(perNight, currency)}</span>
      <span className="text-[var(--acme-ink-faint)]"> / night</span>
    </span>
  )
}

function formatMoney(minorTimesNight: number, currency: string): string {
  const major = minorTimesNight / 100
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(major)
  } catch {
    return `${Math.round(major)} ${currency}`
  }
}
