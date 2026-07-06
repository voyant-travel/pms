import {
  type OwnedStayQuoteResult,
  type ResolveOwnedStayQuoteRecords,
  resolveOwnedStayQuote,
} from "@voyant-travel/accommodations/service-owned-stays"
import { describe, expect, it } from "vitest"
import {
  type AvailabilityOffer,
  assembleAvailability,
  fitsPartyOccupancy,
  nightsBetween,
  quoteFailureMessage,
  type RoomTypeMeta,
} from "./service-reservations"

/**
 * Build a real owned-stay quote from synthetic inventory/rate/overlap records so
 * the tests exercise the SAME availability + pricing math the production fan-out
 * reuses (`resolveOwnedStayQuote` is the pure core of `quoteOwnedStay`).
 */
function quote(
  over: {
    roomTypeId?: string
    ratePlanId?: string
    capacity?: number
    nightlyCents?: number[]
    overlaps?: ResolveOwnedStayQuoteRecords["overlappingBookings"]
    roomCount?: number
    maxOccupancy?: number | null
    adults?: number
    children?: number
    closed?: boolean
  } = {},
): OwnedStayQuoteResult {
  const roomTypeId = over.roomTypeId ?? "rt_1"
  const ratePlanId = over.ratePlanId ?? "rp_1"
  const nights = ["2026-07-10", "2026-07-11"]
  const nightlyCents = over.nightlyCents ?? [10000, 12000]
  return resolveOwnedStayQuote(
    {
      roomTypeId,
      ratePlanId,
      checkIn: "2026-07-10",
      checkOut: "2026-07-12",
      roomCount: over.roomCount ?? 1,
      occupancy: { adults: over.adults ?? 2, children: over.children ?? 0 },
    },
    {
      room: {
        id: roomTypeId,
        propertyId: "prop_1",
        active: true,
        maxOccupancy: over.maxOccupancy ?? 2,
      },
      ratePlan: { id: ratePlanId, propertyId: "prop_1", active: true, mealPlanId: null },
      rates: nights.map((date, i) => ({
        date,
        sellCurrency: "EUR",
        sellAmountCents: nightlyCents[i] ?? 0,
        occupancyBasis: "room",
      })),
      inventory: nights.map((date) => ({
        date,
        capacity: over.capacity ?? 5,
        closed: over.closed ?? false,
      })),
      overlappingBookings: over.overlaps ?? [],
    },
  )
}

const baseInput = {
  propertyId: "prop_1",
  checkIn: "2026-07-10",
  checkOut: "2026-07-12",
  rooms: 1,
  party: { adults: 2, children: 0 },
}

const rooms: RoomTypeMeta[] = [{ id: "rt_1", name: "Deluxe King", maxOccupancy: 2 }]

describe("nightsBetween", () => {
  it("counts half-open nights", () => {
    expect(nightsBetween("2026-07-10", "2026-07-12")).toBe(2)
  })
  it("returns 0 for a non-positive range", () => {
    expect(nightsBetween("2026-07-12", "2026-07-10")).toBe(0)
    expect(nightsBetween("2026-07-10", "2026-07-10")).toBe(0)
  })
})

describe("fitsPartyOccupancy", () => {
  it("passes when caps are null or not exceeded", () => {
    expect(fitsPartyOccupancy({}, { adults: 4, children: 3 })).toBe(true)
    expect(fitsPartyOccupancy({ maxOccupancy: 3 }, { adults: 2, children: 1 })).toBe(true)
  })
  it("filters out a room whose max occupancy is smaller than the party", () => {
    expect(fitsPartyOccupancy({ maxOccupancy: 2 }, { adults: 2, children: 1 })).toBe(false)
  })
  it("respects per-axis adult/child caps", () => {
    expect(fitsPartyOccupancy({ maxAdults: 1 }, { adults: 2, children: 0 })).toBe(false)
    expect(fitsPartyOccupancy({ maxChildren: 0 }, { adults: 2, children: 1 })).toBe(false)
  })
})

describe("assembleAvailability", () => {
  it("totals nightly rates and exposes the per-night breakdown", () => {
    const offers: AvailabilityOffer[] = [
      { roomTypeId: "rt_1", ratePlanId: "rp_1", ratePlanName: "Flexible", quote: quote() },
    ]
    const result = assembleAvailability(baseInput, rooms, offers)
    expect(result.nights).toBe(2)
    expect(result.currency).toBe("EUR")
    const plan = result.roomTypes[0]?.ratePlans[0]
    expect(plan?.totalAmountCents).toBe(22000) // 10000 + 12000
    expect(plan?.nightly).toEqual([
      { date: "2026-07-10", amountCents: 10000 },
      { date: "2026-07-11", amountCents: 12000 },
    ])
    expect(plan?.available).toBe(true)
  })

  it("computes remaining as inventory minus overlapping reserved stays (half-open)", () => {
    // capacity 5, two overlapping reserved rooms on the first night only.
    const offers: AvailabilityOffer[] = [
      {
        roomTypeId: "rt_1",
        ratePlanId: "rp_1",
        ratePlanName: "Flexible",
        quote: quote({
          capacity: 5,
          overlaps: [{ checkInDate: "2026-07-10", checkOutDate: "2026-07-11", roomCount: 2 }],
        }),
      },
    ]
    const result = assembleAvailability(baseInput, rooms, offers)
    // min remaining across nights = 5 - 2 = 3 on the first night.
    expect(result.roomTypes[0]?.remaining).toBe(3)
    expect(result.roomTypes[0]?.available).toBe(true)
  })

  it("marks a room unavailable when remaining is below the requested rooms", () => {
    const offers: AvailabilityOffer[] = [
      {
        roomTypeId: "rt_1",
        ratePlanId: "rp_1",
        ratePlanName: "Flexible",
        quote: quote({
          capacity: 2,
          overlaps: [{ checkInDate: "2026-07-10", checkOutDate: "2026-07-12", roomCount: 2 }],
        }),
      },
    ]
    const result = assembleAvailability({ ...baseInput, rooms: 1 }, rooms, offers)
    expect(result.roomTypes[0]?.remaining).toBe(0)
    expect(result.roomTypes[0]?.available).toBe(false)
    expect(result.roomTypes[0]?.ratePlans[0]?.available).toBe(false)
  })

  it("keeps a room type with no priced offer but drops non-ok quotes", () => {
    const offers: AvailabilityOffer[] = [
      {
        roomTypeId: "rt_1",
        ratePlanId: "rp_1",
        ratePlanName: "Flexible",
        // occupancy exceeded → non-ok, contributes no rate plan
        quote: quote({ maxOccupancy: 1, adults: 2 }),
      },
    ]
    const result = assembleAvailability(baseInput, rooms, offers)
    expect(result.roomTypes).toHaveLength(1)
    expect(result.roomTypes[0]?.ratePlans).toEqual([])
    expect(result.roomTypes[0]?.remaining).toBe(0)
  })

  it("shares remaining across a room's rate plans and lists each priced plan", () => {
    const offers: AvailabilityOffer[] = [
      { roomTypeId: "rt_1", ratePlanId: "rp_1", ratePlanName: "Flexible", quote: quote() },
      {
        roomTypeId: "rt_1",
        ratePlanId: "rp_2",
        ratePlanName: "Non-refundable",
        quote: quote({ ratePlanId: "rp_2", nightlyCents: [9000, 9000] }),
      },
    ]
    const result = assembleAvailability(baseInput, rooms, offers)
    expect(result.roomTypes[0]?.ratePlans.map((p) => p.ratePlanName)).toEqual([
      "Flexible",
      "Non-refundable",
    ])
    expect(result.roomTypes[0]?.ratePlans[1]?.totalAmountCents).toBe(18000)
  })
})

describe("quoteFailureMessage", () => {
  it("maps quote statuses to desk-friendly copy", () => {
    expect(quoteFailureMessage({ status: "room_occupancy_exceeded" })).toMatch(
      /party is too large/i,
    )
    expect(quoteFailureMessage({ status: "rates_missing", missingDates: [] })).toMatch(/no rate/i)
    expect(quoteFailureMessage({ status: "invalid_range", reason: "x" })).toMatch(
      /check-out must be after/i,
    )
  })
})
