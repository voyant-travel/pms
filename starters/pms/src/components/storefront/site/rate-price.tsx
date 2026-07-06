"use client"

import {
  type BookingDraftV1,
  bookingDraftV1,
} from "@voyant-travel/catalog-contracts/booking-engine/contracts"
import { useBookingQuote } from "@voyant-travel/catalog-react/booking-engine"
import { useMemo } from "react"

import { countNights } from "@/components/storefront/stay-search"

/**
 * Live per-night price for a single (room, rate) row on the property page.
 *
 * Mirrors `PropertyFromPrice`: it fires the very same booking-quote engine
 * the sidebar uses, but scoped to one specific rate plan and a single room,
 * so a guest can compare Bed & Breakfast vs Room Only vs Half Board without
 * having to select each one. Prices re-quote whenever the guest changes the
 * dates or occupancy in the sidebar, honouring the section's promise that
 * "prices shown update live for your selected dates and occupancy".
 *
 * States are explicit so a rate row never blank-flashes or jumps:
 *   - quoting → a muted placeholder holds the row height
 *   - unavailable / unpriceable → a quiet "Not available"
 *   - priced → "€120 / night" (whole-euro, browse convention)
 */
export function RatePrice({
  entityId,
  roomId,
  ratePlanId,
  checkIn,
  checkOut,
  adults,
  childCount,
}: {
  entityId: string
  roomId: string
  ratePlanId: string
  checkIn: string
  checkOut: string
  adults: number
  childCount: number
}): React.ReactElement {
  const draft = useMemo<BookingDraftV1 | null>(() => {
    if (!checkIn || !checkOut) return null
    return bookingDraftV1.parse({
      entity: { module: "accommodations", id: entityId, sourceKind: "" },
      configure: {
        dateRange: { checkIn, checkOut },
        pax: { adult: adults, child: childCount },
      },
      accommodation: {
        // Quote a single room so the row shows a comparable per-room rate,
        // independent of how many rooms the guest is booking in the sidebar.
        rooms: [{ optionUnitId: roomId, quantity: 1, ratePlanId }],
        travelerAssignments: {},
      },
    })
  }, [entityId, roomId, ratePlanId, checkIn, checkOut, adults, childCount])

  const quote = useBookingQuote({ surface: "public", draft })
  const total = quote.data?.pricing?.total
  const currency = quote.data?.pricing?.currency
  const nights = countNights(checkIn, checkOut) ?? 1

  if (quote.isQuoting || !quote.data) {
    return (
      <span
        aria-hidden
        className="inline-block h-3 w-16 animate-pulse rounded bg-[var(--acme-line)]"
      />
    )
  }

  if (!total || !currency || quote.data.available === false || quote.data.invalidReason) {
    return <span className="text-[var(--acme-ink-faint)] text-xs">Not available</span>
  }

  const perNight = total / nights
  return (
    <span className="whitespace-nowrap text-sm">
      <span className="font-medium text-[var(--acme-ink)]">{formatMoney(perNight, currency)}</span>
      <span className="text-[var(--acme-ink-faint)]"> / night</span>
    </span>
  )
}

function formatMoney(minor: number, currency: string): string {
  const major = minor / 100
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
