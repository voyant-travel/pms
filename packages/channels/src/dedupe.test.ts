import { describe, expect, it } from "vitest"

import type { AriDelta } from "./connector"
import { ariDateRange, buildAriDedupeKey } from "./dedupe"

const delta = (over: Partial<AriDelta> = {}): AriDelta => ({
  propertyId: "prop_1",
  roomTypeId: "rmty_1",
  ratePlanId: "rtpl_1",
  dates: [{ date: "2026-08-02" }, { date: "2026-08-01" }, { date: "2026-08-03" }],
  ...over,
})

describe("ariDateRange", () => {
  it("returns the inclusive [min, max] regardless of input order", () => {
    expect(ariDateRange(delta().dates)).toEqual(["2026-08-01", "2026-08-03"])
  })

  it("is null for an empty date list", () => {
    expect(ariDateRange([])).toBeNull()
  })

  it("collapses a single night to [d, d]", () => {
    expect(ariDateRange([{ date: "2026-08-05" }])).toEqual(["2026-08-05", "2026-08-05"])
  })
})

describe("buildAriDedupeKey", () => {
  it("is stable across date ordering (same window ⇒ same key)", () => {
    const a = buildAriDedupeKey("mock", delta())
    const b = buildAriDedupeKey(
      "mock",
      delta({ dates: [{ date: "2026-08-03" }, { date: "2026-08-01" }, { date: "2026-08-02" }] }),
    )
    expect(a).toBe(b)
  })

  it("keys on channel — different channels never collide", () => {
    expect(buildAriDedupeKey("mock", delta())).not.toBe(buildAriDedupeKey("booking-com", delta()))
  })

  it("keys on rate plan — a rate delta and an availability delta differ", () => {
    const withRate = buildAriDedupeKey("mock", delta({ ratePlanId: "rtpl_1" }))
    const availOnly = buildAriDedupeKey("mock", delta({ ratePlanId: undefined }))
    expect(withRate).not.toBe(availOnly)
    expect(availOnly).toContain("|-|")
  })

  it("keys on the window bound — a different span is a different key", () => {
    const wide = buildAriDedupeKey("mock", delta())
    const narrow = buildAriDedupeKey("mock", delta({ dates: [{ date: "2026-08-01" }] }))
    expect(wide).not.toBe(narrow)
  })

  it("does not throw on an empty date list", () => {
    expect(buildAriDedupeKey("mock", delta({ dates: [] }))).toContain("|-")
  })
})
