import { describe, expect, it } from "vitest"

import {
  addDaysIso,
  buildDateRange,
  dayOfMonth,
  defaultTapeChartRange,
  isoWeekdayOf,
  isWeekend,
  nightsBetween,
  shiftRangeByDays,
} from "./front-desk-dates"

describe("addDaysIso", () => {
  it("adds and subtracts whole days across month/year", () => {
    expect(addDaysIso("2026-07-05", 1)).toBe("2026-07-06")
    expect(addDaysIso("2026-07-31", 1)).toBe("2026-08-01")
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31")
  })
})

describe("buildDateRange", () => {
  it("is inclusive of both endpoints and crosses months", () => {
    expect(buildDateRange("2026-01-30", "2026-02-02")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ])
  })

  it("returns empty for an inverted range", () => {
    expect(buildDateRange("2026-07-05", "2026-07-01")).toEqual([])
  })
})

describe("isoWeekdayOf / isWeekend", () => {
  it("maps Sunday to 7 and Monday to 1", () => {
    expect(isoWeekdayOf("2026-07-05")).toBe(7)
    expect(isoWeekdayOf("2026-07-06")).toBe(1)
  })

  it("flags weekends", () => {
    expect(isWeekend("2026-07-04")).toBe(true) // Saturday
    expect(isWeekend("2026-07-06")).toBe(false) // Monday
  })
})

describe("nightsBetween", () => {
  it("counts whole nights", () => {
    expect(nightsBetween("2026-07-01", "2026-07-04")).toBe(3)
  })

  it("is zero for same or inverted dates", () => {
    expect(nightsBetween("2026-07-04", "2026-07-04")).toBe(0)
    expect(nightsBetween("2026-07-05", "2026-07-01")).toBe(0)
  })
})

describe("range helpers", () => {
  it("builds a default fortnight window", () => {
    const { from, to } = defaultTapeChartRange()
    expect(buildDateRange(from, to)).toHaveLength(14)
  })

  it("honours a custom span", () => {
    const { from, to } = defaultTapeChartRange(7)
    expect(buildDateRange(from, to)).toHaveLength(7)
  })

  it("shifts a range preserving its span", () => {
    expect(shiftRangeByDays("2026-07-01", "2026-07-14", 14)).toEqual({
      from: "2026-07-15",
      to: "2026-07-28",
    })
    expect(shiftRangeByDays("2026-07-15", "2026-07-28", -14)).toEqual({
      from: "2026-07-01",
      to: "2026-07-14",
    })
  })

  it("extracts the day of month", () => {
    expect(dayOfMonth("2026-07-05")).toBe("05")
  })
})
