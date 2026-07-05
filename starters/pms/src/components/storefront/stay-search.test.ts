import { describe, expect, it } from "vitest"

import {
  countNights,
  defaultStayDates,
  isValidStayRange,
  resolveOccupancy,
  staySearchSchema,
  toBookingJourneySearch,
} from "./stay-search"

describe("staySearchSchema", () => {
  it("coerces numeric occupancy from strings (URL params)", () => {
    const parsed = staySearchSchema.parse({ adults: "3", children: "1", rooms: "2" })
    expect(parsed).toMatchObject({ adults: 3, children: 1, rooms: 2 })
  })

  it("rejects zero adults", () => {
    expect(staySearchSchema.safeParse({ adults: 0 }).success).toBe(false)
  })

  it("accepts an empty object (all optional)", () => {
    expect(staySearchSchema.parse({})).toEqual({})
  })
})

describe("resolveOccupancy", () => {
  it("applies defaults", () => {
    expect(resolveOccupancy({})).toEqual({ adults: 2, children: 0, rooms: 1 })
  })

  it("passes through supplied values", () => {
    expect(resolveOccupancy({ adults: 4, children: 2, rooms: 2 })).toEqual({
      adults: 4,
      children: 2,
      rooms: 2,
    })
  })
})

describe("countNights", () => {
  it("counts whole nights", () => {
    expect(countNights("2026-07-01", "2026-07-04")).toBe(3)
  })

  it("crosses months", () => {
    expect(countNights("2026-01-30", "2026-02-02")).toBe(3)
  })

  it("is null for a same-day or inverted range", () => {
    expect(countNights("2026-07-04", "2026-07-04")).toBeNull()
    expect(countNights("2026-07-05", "2026-07-01")).toBeNull()
  })

  it("is null for malformed input", () => {
    expect(countNights("not-a-date", "2026-07-01")).toBeNull()
    expect(countNights(undefined, undefined)).toBeNull()
  })
})

describe("isValidStayRange", () => {
  it("mirrors countNights truthiness", () => {
    expect(isValidStayRange("2026-07-01", "2026-07-02")).toBe(true)
    expect(isValidStayRange("2026-07-02", "2026-07-01")).toBe(false)
  })
})

describe("defaultStayDates", () => {
  it("is check-in today, check-out +2 nights, deterministic via `from`", () => {
    const from = Date.parse("2026-07-04T09:30:00Z")
    expect(defaultStayDates(from)).toEqual({ checkIn: "2026-07-04", checkOut: "2026-07-06" })
    expect(countNights("2026-07-04", "2026-07-06")).toBe(2)
  })
})

describe("toBookingJourneySearch", () => {
  const sel = { roomTypeId: "rt_1", ratePlanId: "rp_1" }

  it("builds a clean search, omitting zero children and single room", () => {
    expect(
      toBookingJourneySearch({ checkIn: "2026-07-01", checkOut: "2026-07-04", adults: 2 }, sel),
    ).toEqual({
      checkIn: "2026-07-01",
      checkOut: "2026-07-04",
      roomTypeId: "rt_1",
      ratePlanId: "rp_1",
      adult: 2,
    })
  })

  it("includes children and rooms when present", () => {
    expect(
      toBookingJourneySearch(
        { checkIn: "2026-07-01", checkOut: "2026-07-04", adults: 3, children: 2, rooms: 2 },
        sel,
      ),
    ).toMatchObject({ adult: 3, child: 2, rooms: 2 })
  })

  it("returns null when the date range is invalid", () => {
    expect(
      toBookingJourneySearch({ checkIn: "2026-07-04", checkOut: "2026-07-01" }, sel),
    ).toBeNull()
    expect(toBookingJourneySearch({ adults: 2 }, sel)).toBeNull()
  })
})
