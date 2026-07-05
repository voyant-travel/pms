import { describe, expect, it } from "vitest"

import {
  buildDailyReport,
  computeAdrCents,
  computeOccupancy,
  computeRevParCents,
  sumRevenueByType,
} from "./reports"

describe("computeOccupancy", () => {
  it("is occupied / sellable", () => {
    expect(computeOccupancy(8, 10)).toBeCloseTo(0.8)
  })

  it("is 0 when there are no sellable units (avoids divide-by-zero)", () => {
    expect(computeOccupancy(0, 0)).toBe(0)
    expect(computeOccupancy(3, 0)).toBe(0)
  })
})

describe("computeAdrCents", () => {
  it("is room revenue / rooms sold", () => {
    expect(computeAdrCents(60000, 3)).toBe(20000)
  })

  it("rounds to the nearest cent", () => {
    expect(computeAdrCents(10000, 3)).toBe(3333)
  })

  it("is 0 when no rooms were sold", () => {
    expect(computeAdrCents(60000, 0)).toBe(0)
  })
})

describe("computeRevParCents", () => {
  it("is room revenue / sellable units", () => {
    expect(computeRevParCents(60000, 10)).toBe(6000)
  })

  it("is 0 when there are no sellable units", () => {
    expect(computeRevParCents(60000, 0)).toBe(0)
  })
})

describe("sumRevenueByType", () => {
  it("sums signed amounts per type", () => {
    expect(
      sumRevenueByType([
        { type: "room", amountCents: 20000 },
        { type: "room", amountCents: 18000 },
        { type: "tax", amountCents: 3420 },
        { type: "payment", amountCents: -41420 },
      ]),
    ).toEqual({ room: 38000, tax: 3420, payment: -41420 })
  })
})

describe("buildDailyReport", () => {
  it("assembles a full report and excludes payments from revenue", () => {
    const report = buildDailyReport({
      propertyId: "prop_1",
      date: "2026-07-04",
      occupiedUnits: 8,
      sellableUnits: 10,
      roomsSold: 8,
      postings: [
        { type: "room", amountCents: 160000 },
        { type: "tax", amountCents: 14400 },
        { type: "extra", amountCents: 2000 },
        { type: "payment", amountCents: -50000 },
      ],
    })
    expect(report.occupancy).toBeCloseTo(0.8)
    expect(report.roomRevenueCents).toBe(160000)
    expect(report.adrCents).toBe(20000) // 160000 / 8
    expect(report.revParCents).toBe(16000) // 160000 / 10
    expect(report.totalRevenueCents).toBe(176400) // room + tax + extra, no payment
    expect(report.revenueByType.payment).toBe(-50000)
  })

  it("handles an empty day (zero rooms sold, zero sellable)", () => {
    const report = buildDailyReport({
      propertyId: "prop_1",
      date: "2026-07-04",
      occupiedUnits: 0,
      sellableUnits: 0,
      roomsSold: 0,
      postings: [],
    })
    expect(report.occupancy).toBe(0)
    expect(report.adrCents).toBe(0)
    expect(report.revParCents).toBe(0)
    expect(report.totalRevenueCents).toBe(0)
    expect(report.revenueByType).toEqual({})
  })
})
