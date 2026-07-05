import { describe, expect, it } from "vitest"

import { checkInBlockedReason, checkOutBlockedReason } from "./service-ops"
import { boardsQuerySchema, checkInSchema, tapeChartQuerySchema } from "./validation"

describe("checkInBlockedReason", () => {
  it("blocks cancelled and no-show stays", () => {
    expect(checkInBlockedReason("cancelled")).toMatch(/cancelled/)
    expect(checkInBlockedReason("no_show")).toMatch(/no-show/)
  })
  it("allows a reserved stay", () => {
    expect(checkInBlockedReason("reserved")).toBeNull()
  })
})

describe("checkOutBlockedReason", () => {
  it("allows only a checked-in stay", () => {
    expect(checkOutBlockedReason("checked_in")).toBeNull()
  })
  it("blocks a not-checked-in or already-checked-out stay", () => {
    expect(checkOutBlockedReason(null)).toMatch(/not checked in/)
    expect(checkOutBlockedReason("expected")).toMatch(/not checked in/)
    expect(checkOutBlockedReason("checked_out")).toMatch(/already/)
  })
})

describe("front-desk query validation", () => {
  it("requires propertyId + from/to on the tape chart", () => {
    expect(() => tapeChartQuerySchema.parse({ propertyId: "p", from: "2026-07-01" })).toThrow()
    expect(
      tapeChartQuerySchema.parse({ propertyId: "p", from: "2026-07-01", to: "2026-07-03" }),
    ).toEqual({
      propertyId: "p",
      from: "2026-07-01",
      to: "2026-07-03",
    })
  })
  it("requires a valid date on boards", () => {
    expect(() => boardsQuerySchema.parse({ propertyId: "p", date: "07-2026" })).toThrow()
  })
  it("requires a booking item id to check in", () => {
    expect(() => checkInSchema.parse({})).toThrow()
    expect(checkInSchema.parse({ bookingItemId: "bkit_1" }).bookingItemId).toBe("bkit_1")
  })
})
