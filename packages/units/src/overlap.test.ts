import { describe, expect, it } from "vitest"

import { addDays, expandDates, rangesOverlap } from "./dates"
import { filterOverlapping } from "./service-assignments"

describe("rangesOverlap (half-open date intervals)", () => {
  it("treats the departure day as free (same-day turnover does not conflict)", () => {
    // Guest A: 07-01 → 07-03 (nights 01, 02). Guest B: 07-03 → 07-05.
    expect(rangesOverlap("2026-07-01", "2026-07-03", "2026-07-03", "2026-07-05")).toBe(false)
  })

  it("detects a genuine overlap", () => {
    expect(rangesOverlap("2026-07-01", "2026-07-04", "2026-07-03", "2026-07-05")).toBe(true)
  })

  it("detects full containment", () => {
    expect(rangesOverlap("2026-07-01", "2026-07-10", "2026-07-03", "2026-07-04")).toBe(true)
  })

  it("is symmetric", () => {
    const a = rangesOverlap("2026-07-05", "2026-07-08", "2026-07-01", "2026-07-06")
    const b = rangesOverlap("2026-07-01", "2026-07-06", "2026-07-05", "2026-07-08")
    expect(a).toBe(true)
    expect(b).toBe(true)
  })
})

describe("filterOverlapping", () => {
  const existing = [
    { id: "a", fromDate: "2026-07-01", toDate: "2026-07-03" },
    { id: "b", fromDate: "2026-07-05", toDate: "2026-07-09" },
  ]

  it("returns only the intervals that overlap the candidate", () => {
    expect(filterOverlapping(existing, "2026-07-02", "2026-07-06").map((r) => r.id)).toEqual([
      "a",
      "b",
    ])
    expect(filterOverlapping(existing, "2026-07-03", "2026-07-05")).toEqual([])
  })

  it("excludes the assignment being moved (excludeId)", () => {
    expect(filterOverlapping(existing, "2026-07-01", "2026-07-03", "a")).toEqual([])
  })
})

describe("expandDates / addDays", () => {
  it("expands an inclusive range", () => {
    expect(expandDates("2026-07-01", "2026-07-03")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ])
  })

  it("rejects an inverted range", () => {
    expect(() => expandDates("2026-07-03", "2026-07-01")).toThrow()
  })

  it("adds days across a month boundary", () => {
    expect(addDays("2026-07-30", 3)).toBe("2026-08-02")
  })
})
