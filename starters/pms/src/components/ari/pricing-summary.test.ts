import { describe, expect, it } from "vitest"

import {
  adjustmentSummary,
  formatCents,
  formatCentsRange,
  type RuleView,
  ruleSummaryLine,
  scopeSummary,
  whenSummary,
} from "./pricing-summary"

function view(overrides: Partial<RuleView> = {}): RuleView {
  return {
    kind: "season",
    fromDate: null,
    toDate: null,
    weekdays: null,
    adjustmentType: "percent",
    adjustmentValue: 0,
    roomTypeIds: null,
    ratePlanIds: null,
    ...overrides,
  }
}

describe("formatCents", () => {
  it("shows whole euros without decimals and fractions with two", () => {
    expect(formatCents(18000, "EUR")).toBe("€180")
    expect(formatCents(18050, "EUR")).toBe("€180.50")
    expect(formatCents(9900, "USD")).toBe("$99")
    expect(formatCents(5000, "RON")).toBe("lei 50")
  })
})

describe("formatCentsRange", () => {
  it("collapses equal bounds and renders a dash for null", () => {
    expect(formatCentsRange(12000, 20700, "EUR")).toBe("€120–€207")
    expect(formatCentsRange(18000, 18000, "EUR")).toBe("€180")
    expect(formatCentsRange(null, null, "EUR")).toBe("—")
  })
})

describe("adjustmentSummary", () => {
  it("renders percent with sign", () => {
    expect(adjustmentSummary(view({ adjustmentType: "percent", adjustmentValue: 60 }))).toBe("+60%")
    expect(adjustmentSummary(view({ adjustmentType: "percent", adjustmentValue: -15 }))).toBe(
      "-15%",
    )
  })
  it("renders absolute cents with sign", () => {
    expect(adjustmentSummary(view({ adjustmentType: "absolute", adjustmentValue: 3000 }))).toBe(
      "+€30",
    )
    expect(adjustmentSummary(view({ adjustmentType: "absolute", adjustmentValue: -3000 }))).toBe(
      "-€30",
    )
  })
  it("renders set price", () => {
    expect(adjustmentSummary(view({ adjustmentType: "set", adjustmentValue: 12000 }))).toBe(
      "Set €120",
    )
  })
})

describe("whenSummary", () => {
  it("renders a season date range", () => {
    expect(
      whenSummary(view({ kind: "season", fromDate: "2026-06-01", toDate: "2026-08-31" })),
    ).toBe("Jun 1 – Aug 31, 2026")
  })
  it("renders weekend days joined", () => {
    expect(whenSummary(view({ kind: "weekday", weekdays: [5, 6] }))).toBe("Fri & Sat")
  })
  it("collapses a contiguous run to a range", () => {
    expect(whenSummary(view({ kind: "weekday", weekdays: [1, 2, 3, 4, 5] }))).toBe("Mon–Fri")
  })
  it("labels the full week", () => {
    expect(whenSummary(view({ kind: "weekday", weekdays: [1, 2, 3, 4, 5, 6, 7] }))).toBe(
      "Every day",
    )
  })
})

describe("scopeSummary", () => {
  const roomName = (id: string) => ({ rt_1: "Grand", rt_2: "Deluxe", rt_3: "Suite" })[id] ?? id
  const planName = (id: string) => ({ rp_1: "Bed & Breakfast" })[id] ?? id

  it("says All rooms when unscoped", () => {
    expect(scopeSummary(view(), roomName, planName)).toBe("All rooms")
  })
  it("says '<name> only' for one room type", () => {
    expect(scopeSummary(view({ roomTypeIds: ["rt_1"] }), roomName, planName)).toBe("Grand only")
  })
  it("joins a couple of room types", () => {
    expect(scopeSummary(view({ roomTypeIds: ["rt_2", "rt_3"] }), roomName, planName)).toBe(
      "Deluxe & Suite",
    )
  })
  it("counts many room types", () => {
    expect(scopeSummary(view({ roomTypeIds: ["a", "b", "c", "d"] }), roomName, planName)).toBe(
      "4 room types",
    )
  })
  it("appends a plan clause when plan-scoped", () => {
    expect(
      scopeSummary(view({ roomTypeIds: ["rt_1"], ratePlanIds: ["rp_1"] }), roomName, planName),
    ).toBe("Grand only · Bed & Breakfast")
  })
})

describe("ruleSummaryLine", () => {
  it("assembles the full line", () => {
    expect(
      ruleSummaryLine(
        view({ kind: "season", fromDate: "2026-06-01", toDate: "2026-08-31", adjustmentValue: 60 }),
      ),
    ).toBe("Jun 1 – Aug 31, 2026 · +60% · All rooms")
    expect(ruleSummaryLine(view({ kind: "weekday", weekdays: [5, 6], adjustmentValue: 15 }))).toBe(
      "Fri & Sat · +15% · All rooms",
    )
  })
})
