import { describe, expect, it } from "vitest"

import {
  insertMaintenanceBlockSchema,
  insertStaffSchema,
  insertTaskSchema,
  readinessQuerySchema,
  setRoomStatusSchema,
  staffListQuerySchema,
  taskStatusSchema,
  updateStaffSchema,
} from "./validation"

describe("insertTaskSchema", () => {
  it("defaults type to clean and leaves priority optional", () => {
    const parsed = insertTaskSchema.parse({ unitId: "runt_1", propertyId: "prop_1" })
    expect(parsed.type).toBe("clean")
    expect(parsed.priority).toBeUndefined()
  })

  it("rejects an unknown task type", () => {
    expect(() =>
      insertTaskSchema.parse({ unitId: "runt_1", propertyId: "prop_1", type: "laundry" }),
    ).toThrow()
  })
})

describe("taskStatusSchema", () => {
  it("accepts a valid status and rejects others", () => {
    expect(taskStatusSchema.parse({ status: "in_progress" }).status).toBe("in_progress")
    expect(() => taskStatusSchema.parse({ status: "paused" })).toThrow()
  })
})

describe("setRoomStatusSchema", () => {
  it("accepts the three housekeeping states only", () => {
    expect(
      setRoomStatusSchema.parse({ unitId: "runt_1", roomStatus: "inspected" }).roomStatus,
    ).toBe("inspected")
    expect(() => setRoomStatusSchema.parse({ unitId: "runt_1", roomStatus: "occupied" })).toThrow()
  })
})

describe("insertMaintenanceBlockSchema", () => {
  it("requires ISO dates and defaults reason to maintenance", () => {
    const parsed = insertMaintenanceBlockSchema.parse({
      unitId: "runt_1",
      propertyId: "prop_1",
      fromDate: "2026-07-01",
      toDate: "2026-07-03",
    })
    expect(parsed.reason).toBe("maintenance")
  })

  it("rejects a non-ISO date", () => {
    expect(() =>
      insertMaintenanceBlockSchema.parse({
        unitId: "runt_1",
        propertyId: "prop_1",
        fromDate: "07/01/2026",
        toDate: "2026-07-03",
      }),
    ).toThrow()
  })
})

describe("insertStaffSchema", () => {
  it("defaults role to housekeeper and allows a null property scope", () => {
    const parsed = insertStaffSchema.parse({ name: "Maria Ionescu", propertyId: null })
    expect(parsed.role).toBe("housekeeper")
    expect(parsed.propertyId).toBeNull()
  })

  it("requires a non-empty name and rejects an unknown role", () => {
    expect(() => insertStaffSchema.parse({ name: "" })).toThrow()
    expect(() => insertStaffSchema.parse({ name: "X", role: "chef" })).toThrow()
  })
})

describe("updateStaffSchema", () => {
  it("accepts an active toggle and a partial patch", () => {
    expect(updateStaffSchema.parse({ active: false }).active).toBe(false)
    expect(updateStaffSchema.parse({ role: "supervisor" }).role).toBe("supervisor")
  })
})

describe("staffListQuerySchema", () => {
  it("coerces the active string filter into a boolean", () => {
    expect(staffListQuerySchema.parse({ active: "true" }).active).toBe(true)
    expect(staffListQuerySchema.parse({ active: "false" }).active).toBe(false)
    expect(staffListQuerySchema.parse({}).active).toBeUndefined()
  })
})

describe("readinessQuerySchema", () => {
  it("splits a comma-separated unitIds string into a trimmed array", () => {
    const parsed = readinessQuerySchema.parse({ unitIds: "runt_1, runt_2 ,runt_3" })
    expect(parsed.unitIds).toEqual(["runt_1", "runt_2", "runt_3"])
  })

  it("requires a non-empty unitIds", () => {
    expect(() => readinessQuerySchema.parse({ unitIds: "" })).toThrow()
  })
})
