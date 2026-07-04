import { describe, expect, it } from "vitest"

import { expandDates } from "../units/dates"
import type { AssignmentContext, StayContext } from "./service-reads"
import { assembleTapeChart, type TapeChartUnit } from "./service-tape-chart"

function stay(over: Partial<StayContext> & Pick<StayContext, "bookingItemId">): StayContext {
  return {
    propertyId: "prop_1",
    roomTypeId: "rt_1",
    checkInDate: "2026-07-01",
    checkOutDate: "2026-07-03",
    reservationStatus: "reserved",
    adults: 2,
    children: 0,
    infants: 0,
    roomCount: 1,
    bookingId: "book_1",
    bookingNumber: "B-1",
    bookingStatus: "confirmed",
    guestName: "Ada Lovelace",
    opsStatus: null,
    checkedInAt: null,
    checkedOutAt: null,
    ...over,
  }
}

const units: TapeChartUnit[] = [
  {
    id: "runt_1",
    unitNumber: "101",
    name: null,
    status: "available",
    roomTypeId: "rt_1",
    roomTypeName: "Deluxe",
  },
  {
    id: "runt_2",
    unitNumber: "102",
    name: null,
    status: "available",
    roomTypeId: "rt_1",
    roomTypeName: "Deluxe",
  },
  {
    id: "runt_3",
    unitNumber: "201",
    name: null,
    status: "available",
    roomTypeId: "rt_2",
    roomTypeName: "Suite",
  },
]

const dates = expandDates("2026-07-01", "2026-07-03")

describe("assembleTapeChart", () => {
  it("places a stay's cells on its assigned unit for the occupied nights only (half-open)", () => {
    const assignments: AssignmentContext[] = [
      { bookingItemId: "bkit_1", unitId: "runt_1", fromDate: "2026-07-01", toDate: "2026-07-03" },
    ]
    const chart = assembleTapeChart({
      propertyId: "prop_1",
      from: "2026-07-01",
      to: "2026-07-03",
      dates,
      units,
      stays: [stay({ bookingItemId: "bkit_1" })],
      assignments,
    })
    const row = chart.groups.flatMap((g) => g.units).find((u) => u.unitId === "runt_1")
    // Nights 07-01, 07-02 — NOT the departure day 07-03.
    expect(row?.cells.map((c) => c.date)).toEqual(["2026-07-01", "2026-07-02"])
    expect(row?.cells[0].guestName).toBe("Ada Lovelace")
  })

  it("groups units by room type in input order", () => {
    const chart = assembleTapeChart({
      propertyId: "prop_1",
      from: "2026-07-01",
      to: "2026-07-03",
      dates,
      units,
      stays: [],
      assignments: [],
    })
    expect(chart.groups.map((g) => g.roomTypeId)).toEqual(["rt_1", "rt_2"])
    expect(chart.groups[0].units.map((u) => u.unitId)).toEqual(["runt_1", "runt_2"])
  })

  it("lists in-window arrivals without an assignment as unassigned", () => {
    const chart = assembleTapeChart({
      propertyId: "prop_1",
      from: "2026-07-01",
      to: "2026-07-03",
      dates,
      units,
      stays: [
        stay({ bookingItemId: "bkit_1", checkInDate: "2026-07-02" }),
        stay({ bookingItemId: "bkit_2", checkInDate: "2026-07-02" }),
      ],
      assignments: [
        { bookingItemId: "bkit_1", unitId: "runt_1", fromDate: "2026-07-02", toDate: "2026-07-03" },
      ],
    })
    expect(chart.unassignedArrivals.map((a) => a.bookingItemId)).toEqual(["bkit_2"])
  })

  it("excludes cancelled stays from cells and arrivals", () => {
    const chart = assembleTapeChart({
      propertyId: "prop_1",
      from: "2026-07-01",
      to: "2026-07-03",
      dates,
      units,
      stays: [stay({ bookingItemId: "bkit_1", reservationStatus: "cancelled" })],
      assignments: [
        { bookingItemId: "bkit_1", unitId: "runt_1", fromDate: "2026-07-01", toDate: "2026-07-03" },
      ],
    })
    expect(chart.groups.flatMap((g) => g.units).every((u) => u.cells.length === 0)).toBe(true)
    expect(chart.unassignedArrivals).toEqual([])
  })
})
