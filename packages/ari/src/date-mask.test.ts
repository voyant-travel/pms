import { describe, expect, it } from "vitest"

import { expandDates, formatIsoDate, isoWeekday, MAX_RANGE_DAYS, parseIsoDate } from "./date-mask"

describe("isoWeekday", () => {
  it("maps Sunday to 7 and Monday to 1 (ISO-8601)", () => {
    expect(isoWeekday(parseIsoDate("2026-07-06"))).toBe(1) // Monday
    expect(isoWeekday(parseIsoDate("2026-07-07"))).toBe(2) // Tuesday
    expect(isoWeekday(parseIsoDate("2026-07-11"))).toBe(6) // Saturday
    expect(isoWeekday(parseIsoDate("2026-07-12"))).toBe(7) // Sunday
  })
})

describe("parseIsoDate", () => {
  it("rejects malformed and impossible dates", () => {
    expect(() => parseIsoDate("2026-7-1")).toThrow()
    expect(() => parseIsoDate("2026-02-31")).toThrow()
    expect(() => parseIsoDate("not-a-date")).toThrow()
  })
  it("round-trips through formatIsoDate", () => {
    expect(formatIsoDate(parseIsoDate("2026-07-04"))).toBe("2026-07-04")
  })
})

describe("expandDates", () => {
  it("expands an inclusive range with no mask (every day, both endpoints)", () => {
    expect(expandDates("2026-07-01", "2026-07-03")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ])
  })

  it("returns a single date when from === to", () => {
    expect(expandDates("2026-07-04", "2026-07-04")).toEqual(["2026-07-04"])
  })

  it("keeps only masked weekdays (weekends: Sat=6, Sun=7)", () => {
    // 2026-07-06 (Mon) … 2026-07-19 (Sun) — two full weeks.
    const weekends = expandDates("2026-07-06", "2026-07-19", [6, 7])
    expect(weekends).toEqual(["2026-07-11", "2026-07-12", "2026-07-18", "2026-07-19"])
  })

  it("treats an empty weekday mask as every day", () => {
    expect(expandDates("2026-07-01", "2026-07-02", [])).toEqual(["2026-07-01", "2026-07-02"])
  })

  it("crosses a month boundary correctly", () => {
    expect(expandDates("2026-07-31", "2026-08-02")).toEqual([
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ])
  })

  it("throws on an inverted range", () => {
    expect(() => expandDates("2026-07-05", "2026-07-01")).toThrow(/precedes/)
  })

  it("throws when the range exceeds the safety ceiling", () => {
    expect(() => expandDates("2020-01-01", "2026-01-01")).toThrow(new RegExp(`${MAX_RANGE_DAYS}`))
  })
})
