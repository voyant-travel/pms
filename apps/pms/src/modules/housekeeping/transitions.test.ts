import { describe, expect, it } from "vitest"

import {
  assessUnitReadiness,
  roomStatusForCompletedTask,
  roomStatusTransitionBlockedReason,
  taskStatusTransitionBlockedReason,
} from "./transitions"

describe("taskStatusTransitionBlockedReason", () => {
  it("allows the happy path open → in_progress → done", () => {
    expect(taskStatusTransitionBlockedReason("open", "in_progress")).toBeNull()
    expect(taskStatusTransitionBlockedReason("in_progress", "done")).toBeNull()
  })

  it("allows skipping from open or in_progress", () => {
    expect(taskStatusTransitionBlockedReason("open", "skipped")).toBeNull()
    expect(taskStatusTransitionBlockedReason("in_progress", "skipped")).toBeNull()
  })

  it("treats a same-status set as an idempotent no-op", () => {
    expect(taskStatusTransitionBlockedReason("done", "done")).toBeNull()
  })

  it("blocks transitions out of a terminal status", () => {
    expect(taskStatusTransitionBlockedReason("done", "open")).toMatch(/cannot move/)
    expect(taskStatusTransitionBlockedReason("skipped", "in_progress")).toMatch(/cannot move/)
  })
})

describe("roomStatusForCompletedTask", () => {
  it("maps clean-ish task types to clean and inspect to inspected", () => {
    expect(roomStatusForCompletedTask("clean")).toBe("clean")
    expect(roomStatusForCompletedTask("turndown")).toBe("clean")
    expect(roomStatusForCompletedTask("deep_clean")).toBe("clean")
    expect(roomStatusForCompletedTask("inspect")).toBe("inspected")
  })
})

describe("roomStatusTransitionBlockedReason", () => {
  it("requires clean before inspected", () => {
    expect(roomStatusTransitionBlockedReason("clean", "inspected")).toBeNull()
    expect(roomStatusTransitionBlockedReason("dirty", "inspected")).toMatch(/must be clean/)
    expect(roomStatusTransitionBlockedReason(null, "inspected")).toMatch(/must be clean/)
  })

  it("allows dirty/clean from any state and same-state no-ops", () => {
    expect(roomStatusTransitionBlockedReason("inspected", "dirty")).toBeNull()
    expect(roomStatusTransitionBlockedReason("dirty", "clean")).toBeNull()
    expect(roomStatusTransitionBlockedReason("inspected", "inspected")).toBeNull()
  })
})

describe("assessUnitReadiness", () => {
  it("is ready when clean/inspected with no active block", () => {
    expect(
      assessUnitReadiness({ unitId: "u1", roomStatus: "clean", hasActiveMaintenanceBlock: false })
        .ready,
    ).toBe(true)
    expect(
      assessUnitReadiness({
        unitId: "u1",
        roomStatus: "inspected",
        hasActiveMaintenanceBlock: false,
      }).ready,
    ).toBe(true)
  })

  it("is not ready (with reasons) when dirty or blocked", () => {
    const dirty = assessUnitReadiness({
      unitId: "u1",
      roomStatus: "dirty",
      hasActiveMaintenanceBlock: false,
    })
    expect(dirty.ready).toBe(false)
    expect(dirty.reasons).toEqual(["room is dirty"])

    const blocked = assessUnitReadiness({
      unitId: "u2",
      roomStatus: "clean",
      hasActiveMaintenanceBlock: true,
    })
    expect(blocked.ready).toBe(false)
    expect(blocked.reasons).toEqual(["unit has an active maintenance block"])
  })

  it("reports 'not yet cleaned' when the unit has never been touched", () => {
    const r = assessUnitReadiness({
      unitId: "u1",
      roomStatus: null,
      hasActiveMaintenanceBlock: false,
    })
    expect(r.reasons).toEqual(["room is not yet cleaned"])
  })
})
