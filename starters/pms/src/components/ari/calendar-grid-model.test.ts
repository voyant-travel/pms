import type { CalendarGrid } from "@voyant-travel/pms-ari"
import { describe, expect, it } from "vitest"
import {
  buildDateColumns,
  centsToInput,
  formatMoney,
  indexCalendar,
  inputToCents,
  isoWeekdayOf,
  isWeekend,
  monthLabel,
  monthRange,
  shiftMonth,
} from "./calendar-grid-model"

describe("buildDateColumns", () => {
  it("is inclusive of both endpoints", () => {
    expect(buildDateColumns("2026-07-01", "2026-07-03")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ])
  })

  it("crosses month boundaries", () => {
    expect(buildDateColumns("2026-01-30", "2026-02-02")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ])
  })

  it("returns empty for an inverted range", () => {
    expect(buildDateColumns("2026-07-05", "2026-07-01")).toEqual([])
  })
})

describe("isoWeekdayOf / isWeekend", () => {
  it("maps Sunday to 7 and Monday to 1", () => {
    expect(isoWeekdayOf("2026-07-05")).toBe(7) // Sunday
    expect(isoWeekdayOf("2026-07-06")).toBe(1) // Monday
  })

  it("flags weekends", () => {
    expect(isWeekend("2026-07-04")).toBe(true) // Saturday
    expect(isWeekend("2026-07-05")).toBe(true) // Sunday
    expect(isWeekend("2026-07-06")).toBe(false) // Monday
  })
})

describe("indexCalendar", () => {
  const grid: CalendarGrid = {
    propertyId: "prop_1",
    from: "2026-07-01",
    to: "2026-07-02",
    roomTypes: [
      { id: "rt_1", code: "DLX", name: "Deluxe", inventoryMode: "pooled", ratePlanIds: ["rp_1"] },
    ],
    ratePlans: [{ id: "rp_1", code: "BAR", name: "Best available", currencyCode: "EUR" }],
    inventory: [{ roomTypeId: "rt_1", date: "2026-07-01", capacity: 5, closed: false }],
    rates: [
      {
        ratePlanId: "rp_1",
        roomTypeId: "rt_1",
        date: "2026-07-01",
        sellCurrency: "EUR",
        sellAmountCents: 12000,
        costCurrency: null,
        costAmountCents: null,
        taxAmountCents: null,
        feeAmountCents: null,
        occupancyBasis: "room",
        includedAdults: 2,
        includedChildren: 0,
        includedInfants: 0,
      },
    ],
  }

  it("looks up inventory and rate cells by natural key", () => {
    const index = indexCalendar(grid)
    expect(index.inventory("rt_1", "2026-07-01")?.capacity).toBe(5)
    expect(index.rate("rp_1", "rt_1", "2026-07-01")?.sellAmountCents).toBe(12000)
  })

  it("returns undefined for missing cells", () => {
    const index = indexCalendar(grid)
    expect(index.inventory("rt_1", "2026-07-02")).toBeUndefined()
    expect(index.rate("rp_1", "rt_1", "2026-07-09")).toBeUndefined()
  })
})

describe("money helpers", () => {
  it("round-trips cents through the input string", () => {
    expect(centsToInput(12000)).toBe("120")
    expect(inputToCents("120")).toBe(12000)
    expect(inputToCents("120.50")).toBe(12050)
  })

  it("treats blank and invalid input as null", () => {
    expect(centsToInput(null)).toBe("")
    expect(inputToCents("")).toBeNull()
    expect(inputToCents("abc")).toBeNull()
  })

  it("formats compact money", () => {
    expect(formatMoney(12000, "EUR")).toBe("120 EUR")
    expect(formatMoney(12050, "EUR")).toBe("120.50 EUR")
  })
})

describe("month range navigation", () => {
  it("computes the containing month range", () => {
    expect(monthRange("2026-07-15")).toEqual({ from: "2026-07-01", to: "2026-07-31" })
    expect(monthRange("2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" })
  })

  it("shifts by whole months and wraps years", () => {
    expect(shiftMonth("2026-12-01", 1)).toEqual({ from: "2027-01-01", to: "2027-01-31" })
    expect(shiftMonth("2026-07-01", -1)).toEqual({ from: "2026-06-01", to: "2026-06-30" })
  })

  it("labels the month", () => {
    expect(monthLabel("2026-07-01")).toBe("July 2026")
  })
})
