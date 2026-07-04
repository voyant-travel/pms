import { describe, expect, it } from "vitest"

import type { TapeChartCell } from "../../modules/front-desk"
import {
  assignLanes,
  buildRowLanes,
  buildStayBars,
  laneSegments,
  statusBarClass,
  stayStateLabel,
} from "./tape-chart-model"

const dates = ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"]

function cell(
  date: string,
  bookingItemId: string,
  over: Partial<TapeChartCell> = {},
): TapeChartCell {
  return {
    date,
    bookingItemId,
    guestName: "Ada Lovelace",
    reservationStatus: "reserved",
    opsStatus: null,
    checkInDate: "2026-07-01",
    checkOutDate: "2026-07-03",
    ...over,
  }
}

describe("buildStayBars", () => {
  it("merges consecutive same-stay cells into one spanning bar", () => {
    const bars = buildStayBars([cell("2026-07-01", "bi_1"), cell("2026-07-02", "bi_1")], dates)
    expect(bars).toHaveLength(1)
    expect(bars[0]).toMatchObject({ bookingItemId: "bi_1", startIndex: 0, span: 2 })
  })

  it("starts a new bar on a stay change or a date gap", () => {
    const bars = buildStayBars(
      [
        cell("2026-07-01", "bi_1"),
        cell("2026-07-02", "bi_2"), // different stay
        cell("2026-07-04", "bi_2"), // same stay but a one-day gap
      ],
      dates,
    )
    expect(bars.map((b) => [b.bookingItemId, b.startIndex, b.span])).toEqual([
      ["bi_1", 0, 1],
      ["bi_2", 1, 1],
      ["bi_2", 3, 1],
    ])
  })

  it("ignores cells outside the date window", () => {
    const bars = buildStayBars([cell("2026-06-30", "bi_1"), cell("2026-07-01", "bi_1")], dates)
    expect(bars).toEqual([expect.objectContaining({ startIndex: 0, span: 1 })])
  })
})

describe("assignLanes", () => {
  it("keeps non-overlapping bars on one lane", () => {
    const bars = buildStayBars([cell("2026-07-01", "bi_1"), cell("2026-07-03", "bi_2")], dates)
    expect(assignLanes(bars)).toHaveLength(1)
  })

  it("splits overlapping bars onto separate lanes", () => {
    const overlapping = [
      { bookingItemId: "a", startIndex: 0, span: 3 },
      { bookingItemId: "b", startIndex: 1, span: 2 },
    ].map((b) => ({
      ...b,
      guestName: null,
      reservationStatus: "reserved",
      opsStatus: null,
      checkInDate: "2026-07-01",
      checkOutDate: "2026-07-03",
    }))
    expect(assignLanes(overlapping)).toHaveLength(2)
  })
})

describe("laneSegments / buildRowLanes", () => {
  it("pads gaps so segments cover the whole row", () => {
    const bars = buildStayBars([cell("2026-07-02", "bi_1"), cell("2026-07-03", "bi_1")], dates)
    const segments = laneSegments(bars, dates.length)
    expect(segments.reduce((sum, s) => sum + s.span, 0)).toBe(dates.length)
    expect(segments).toEqual([
      { span: 1, bar: null },
      { span: 2, bar: expect.objectContaining({ bookingItemId: "bi_1" }) },
      { span: 2, bar: null },
    ])
  })

  it("returns a single empty lane for a unit with no stays", () => {
    expect(buildRowLanes([], dates)).toEqual([[{ span: 5, bar: null }]])
  })
})

describe("status presentation", () => {
  it("colours by ops then reservation status", () => {
    expect(statusBarClass("no_show", "checked_in")).toContain("destructive")
    expect(statusBarClass("reserved", "checked_in")).toContain("emerald")
    expect(statusBarClass("reserved", "checked_out")).toContain("muted")
    expect(statusBarClass("reserved", null)).toContain("sky")
  })

  it("labels the stay state", () => {
    expect(stayStateLabel("no_show", null)).toBe("No-show")
    expect(stayStateLabel("reserved", "checked_in")).toBe("In-house")
    expect(stayStateLabel("reserved", "checked_out")).toBe("Checked out")
    expect(stayStateLabel("reserved", null)).toBe("Reserved")
  })
})
