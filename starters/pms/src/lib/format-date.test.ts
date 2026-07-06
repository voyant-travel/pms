import { describe, expect, it } from "vitest"
import { formatDay, formatDayRange } from "./format-date"

describe("formatDay", () => {
  it("formats an ISO day as human copy", () => {
    expect(formatDay("2026-07-06")).toBe("Mon, 6 Jul 2026")
    expect(formatDay("2026-12-25")).toBe("Fri, 25 Dec 2026")
  })

  it("does not roll the date across a timezone boundary", () => {
    // Parsed at UTC noon, so the day-of-month is stable regardless of the host TZ.
    expect(formatDay("2026-01-01")).toBe("Thu, 1 Jan 2026")
  })

  it("returns the input unchanged when it is not an ISO day", () => {
    expect(formatDay("not-a-date")).toBe("not-a-date")
    expect(formatDay("")).toBe("")
  })
})

describe("formatDayRange", () => {
  it("joins two formatted days with an en dash", () => {
    expect(formatDayRange("2026-07-06", "2026-07-08")).toBe("Mon, 6 Jul 2026 – Wed, 8 Jul 2026")
  })
})
