import { describe, expect, it } from "vitest"

import {
  daysInclusive,
  type MaintenanceRow,
  type MaintenanceTimelineInput,
  maintenanceTimeline,
  sortMaintenanceRows,
  toMaintenanceRow,
} from "./maintenance-model"

const TODAY = "2026-07-05"

describe("daysInclusive", () => {
  it("counts both endpoints", () => {
    expect(daysInclusive("2026-07-05", "2026-07-05")).toBe(1)
    expect(daysInclusive("2026-07-05", "2026-07-07")).toBe(3)
  })

  it("returns 0 for an inverted or invalid range", () => {
    expect(daysInclusive("2026-07-07", "2026-07-05")).toBe(0)
    expect(daysInclusive("nope", "2026-07-05")).toBe(0)
  })
})

describe("maintenanceTimeline", () => {
  const active = (fromDate: string, toDate: string): MaintenanceTimelineInput => ({
    status: "active",
    fromDate,
    toDate,
  })

  it("classifies active blocks against today", () => {
    expect(maintenanceTimeline(active("2026-07-01", "2026-07-10"), TODAY)).toBe("current")
    expect(maintenanceTimeline(active("2026-07-08", "2026-07-10"), TODAY)).toBe("upcoming")
    expect(maintenanceTimeline(active("2026-07-01", "2026-07-04"), TODAY)).toBe("past")
  })

  it("treats today as the inclusive boundary", () => {
    expect(maintenanceTimeline(active("2026-07-05", "2026-07-05"), TODAY)).toBe("current")
  })

  it("classifies non-active blocks as closed regardless of dates", () => {
    expect(maintenanceTimeline({ status: "resolved", fromDate: "2026-07-01", toDate: "2026-07-10" }, TODAY)).toBe(
      "closed",
    )
    expect(maintenanceTimeline({ status: "cancelled", fromDate: "2026-07-08", toDate: "2026-07-10" }, TODAY)).toBe(
      "closed",
    )
  })
})

describe("toMaintenanceRow", () => {
  it("wraps a block with its timeline and day span", () => {
    const block = { status: "active" as const, fromDate: "2026-07-04", toDate: "2026-07-06", id: "mblk_1" }
    const row = toMaintenanceRow(block, TODAY)
    expect(row.timeline).toBe("current")
    expect(row.days).toBe(3)
    expect(row.block.id).toBe("mblk_1")
  })
})

describe("sortMaintenanceRows", () => {
  it("orders current → upcoming → past → closed, then by start date", () => {
    const rows: MaintenanceRow<MaintenanceTimelineInput & { id: string }>[] = [
      { block: { id: "past", status: "active", fromDate: "2026-07-01", toDate: "2026-07-02" }, timeline: "past", days: 2 },
      { block: { id: "closed", status: "cancelled", fromDate: "2026-07-01", toDate: "2026-07-30" }, timeline: "closed", days: 30 },
      { block: { id: "cur-b", status: "active", fromDate: "2026-07-04", toDate: "2026-07-06" }, timeline: "current", days: 3 },
      { block: { id: "cur-a", status: "active", fromDate: "2026-07-03", toDate: "2026-07-06" }, timeline: "current", days: 4 },
      { block: { id: "up", status: "active", fromDate: "2026-07-09", toDate: "2026-07-10" }, timeline: "upcoming", days: 2 },
    ]
    expect(sortMaintenanceRows(rows).map((r) => r.block.id)).toEqual([
      "cur-a",
      "cur-b",
      "up",
      "past",
      "closed",
    ])
  })

  it("does not mutate the input", () => {
    const rows: MaintenanceRow[] = [
      { block: { status: "active", fromDate: "2026-07-09", toDate: "2026-07-10" }, timeline: "upcoming", days: 2 },
      { block: { status: "active", fromDate: "2026-07-01", toDate: "2026-07-10" }, timeline: "current", days: 10 },
    ]
    const before = rows.map((r) => r.timeline)
    sortMaintenanceRows(rows)
    expect(rows.map((r) => r.timeline)).toEqual(before)
  })
})
