import { describe, expect, it } from "vitest"

import { buildBlockedUnitIdsByDate, windowCoversDate } from "./maintenance-window"

const dates = ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"]

describe("windowCoversDate (inclusive both ends)", () => {
  const w = { unitId: "u1", fromDate: "2026-07-02", toDate: "2026-07-03" }
  it("covers both endpoints and nothing outside", () => {
    expect(windowCoversDate(w, "2026-07-02")).toBe(true)
    expect(windowCoversDate(w, "2026-07-03")).toBe(true)
    expect(windowCoversDate(w, "2026-07-01")).toBe(false)
    expect(windowCoversDate(w, "2026-07-04")).toBe(false)
  })
})

describe("buildBlockedUnitIdsByDate", () => {
  it("maps each covered date to the set of blocked units", () => {
    const map = buildBlockedUnitIdsByDate(
      [
        { unitId: "u1", fromDate: "2026-07-02", toDate: "2026-07-03" },
        { unitId: "u2", fromDate: "2026-07-03", toDate: "2026-07-04" },
      ],
      dates,
    )
    expect(map.get("2026-07-01")).toBeUndefined()
    expect([...(map.get("2026-07-02") ?? [])]).toEqual(["u1"])
    expect([...(map.get("2026-07-03") ?? [])].sort()).toEqual(["u1", "u2"])
    expect([...(map.get("2026-07-04") ?? [])]).toEqual(["u2"])
  })

  it("omits dates with no active block", () => {
    const map = buildBlockedUnitIdsByDate([], dates)
    expect(map.size).toBe(0)
  })

  it("feeds the units derivation shape (date → ReadonlySet<string>)", () => {
    const map = buildBlockedUnitIdsByDate(
      [{ unitId: "u1", fromDate: "2026-07-01", toDate: "2026-07-01" }],
      dates,
    )
    // Same shape units' computeDailyCapacities consumes.
    expect(map.get("2026-07-01")?.has("u1")).toBe(true)
  })
})
