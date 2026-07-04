import { describe, expect, it } from "vitest"

import {
  insertAssignmentSchema,
  insertRoomUnitSchema,
  roomUnitListQuerySchema,
  updateRoomUnitSchema,
} from "./validation"

describe("insertRoomUnitSchema", () => {
  it("accepts a minimal unit and defaults status to available", () => {
    const parsed = insertRoomUnitSchema.parse({
      propertyId: "prop_1",
      roomTypeId: "rt_1",
      unitNumber: "101",
    })
    expect(parsed.status).toBe("available")
    expect(parsed.active).toBeUndefined()
  })

  it("rejects an unknown status (occupancy is never a stored status)", () => {
    expect(() =>
      insertRoomUnitSchema.parse({
        propertyId: "prop_1",
        roomTypeId: "rt_1",
        unitNumber: "101",
        status: "occupied",
      }),
    ).toThrow()
  })

  it("requires a non-empty unit number", () => {
    expect(() =>
      insertRoomUnitSchema.parse({ propertyId: "prop_1", roomTypeId: "rt_1", unitNumber: "" }),
    ).toThrow()
  })
})

describe("updateRoomUnitSchema", () => {
  it("omits propertyId (a unit never moves property) but allows roomTypeId change", () => {
    const parsed = updateRoomUnitSchema.parse({ roomTypeId: "rt_2", status: "out_of_order" })
    expect(parsed).toEqual({ roomTypeId: "rt_2", status: "out_of_order" })
    expect("propertyId" in parsed).toBe(false)
  })
})

describe("roomUnitListQuerySchema", () => {
  it("coerces the query-string active boolean", () => {
    const parsed = roomUnitListQuerySchema.parse({ active: "true" })
    expect(parsed.active).toBe(true)
  })
})

describe("insertAssignmentSchema", () => {
  it("requires ISO dates", () => {
    expect(() =>
      insertAssignmentSchema.parse({
        bookingItemId: "bkit_1",
        unitId: "runt_1",
        fromDate: "07/01/2026",
        toDate: "2026-07-03",
      }),
    ).toThrow()
  })

  it("accepts a valid assignment", () => {
    const parsed = insertAssignmentSchema.parse({
      bookingItemId: "bkit_1",
      unitId: "runt_1",
      fromDate: "2026-07-01",
      toDate: "2026-07-03",
    })
    expect(parsed.unitId).toBe("runt_1")
  })
})
