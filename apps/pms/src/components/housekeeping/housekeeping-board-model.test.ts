import { describe, expect, it } from "vitest"

import {
  blockedUnitIdsOnDate,
  canCloseTask,
  canStartTask,
  compareTaskViews,
  groupTasks,
  type MaintenanceOverlaySource,
  mergeRoomStatus,
  type RoomStatusInput,
  roomStatusDisabledReason,
  type TaskLike,
  type TaskView,
  taskBucket,
  toTaskView,
} from "./housekeeping-board-model"

function task(over: Partial<TaskView> = {}): TaskView {
  return {
    id: "hkt_1",
    unitId: "runt_1",
    unitNumber: "101",
    type: "clean",
    status: "open",
    priority: 0,
    assigneeUserId: null,
    source: "auto",
    dueDate: "2026-07-05",
    notes: null,
    ...over,
  }
}

describe("taskBucket", () => {
  it("collapses done + skipped into the closed column", () => {
    expect(taskBucket("open")).toBe("open")
    expect(taskBucket("in_progress")).toBe("in_progress")
    expect(taskBucket("done")).toBe("closed")
    expect(taskBucket("skipped")).toBe("closed")
  })
})

describe("toTaskView", () => {
  it("resolves the unit number and falls back to the id", () => {
    const raw: TaskLike = {
      id: "hkt_9",
      unitId: "runt_9",
      type: "inspect",
      status: "open",
      priority: 3,
      assigneeUserId: null,
      source: "manual",
      dueDate: null,
      notes: null,
    }
    expect(toTaskView(raw, () => "204").unitNumber).toBe("204")
    expect(toTaskView(raw, () => "").unitNumber).toBe("runt_9")
  })
})

describe("compareTaskViews", () => {
  it("orders by priority desc then unit number numerically", () => {
    expect(compareTaskViews(task({ priority: 5 }), task({ priority: 1 }))).toBeLessThan(0)
    // "9" must precede "10" under natural-numeric sort.
    expect(
      compareTaskViews(task({ unitNumber: "9" }), task({ unitNumber: "10" })),
    ).toBeLessThan(0)
  })
})

describe("groupTasks", () => {
  it("buckets and sorts each column", () => {
    const groups = groupTasks([
      task({ id: "a", status: "open", priority: 1, unitNumber: "102" }),
      task({ id: "b", status: "open", priority: 5, unitNumber: "110" }),
      task({ id: "c", status: "in_progress", unitNumber: "9" }),
      task({ id: "d", status: "done", unitNumber: "3" }),
      task({ id: "e", status: "skipped", unitNumber: "1" }),
    ])
    expect(groups.open.map((t) => t.id)).toEqual(["b", "a"]) // priority 5 before 1
    expect(groups.in_progress.map((t) => t.id)).toEqual(["c"])
    expect(groups.closed.map((t) => t.id)).toEqual(["e", "d"]) // unit 1 before 3
  })
})

describe("task action guards", () => {
  it("mirrors the server transition allow-set", () => {
    expect(canStartTask("open")).toBe(true)
    expect(canStartTask("in_progress")).toBe(false)
    expect(canCloseTask("open")).toBe(true)
    expect(canCloseTask("in_progress")).toBe(true)
    expect(canCloseTask("done")).toBe(false)
  })
})

describe("blockedUnitIdsOnDate", () => {
  const blocks: MaintenanceOverlaySource[] = [
    { unitId: "u1", status: "active", fromDate: "2026-07-01", toDate: "2026-07-10" },
    { unitId: "u2", status: "active", fromDate: "2026-07-06", toDate: "2026-07-08" },
    { unitId: "u3", status: "resolved", fromDate: "2026-07-01", toDate: "2026-07-31" },
  ]

  it("includes only active blocks covering the date (inclusive)", () => {
    const set = blockedUnitIdsOnDate(blocks, "2026-07-05")
    expect(set.has("u1")).toBe(true) // in range
    expect(set.has("u2")).toBe(false) // starts later
    expect(set.has("u3")).toBe(false) // not active
  })

  it("treats the range bounds as inclusive", () => {
    expect(blockedUnitIdsOnDate(blocks, "2026-07-10").has("u1")).toBe(true)
    expect(blockedUnitIdsOnDate(blocks, "2026-07-11").has("u1")).toBe(false)
  })
})

describe("mergeRoomStatus", () => {
  const units: RoomStatusInput[] = [
    { unitId: "u1", unitNumber: "101", roomTypeId: "rt1", floor: "1", roomStatus: "clean" },
    { unitId: "u2", unitNumber: "102", roomTypeId: "rt1", floor: "1", roomStatus: "dirty" },
  ]
  const blocks: MaintenanceOverlaySource[] = [
    { unitId: "u2", status: "active", fromDate: "2026-07-01", toDate: "2026-07-31" },
  ]

  it("overlays maintenance and gates inspect on clean", () => {
    const cells = mergeRoomStatus(units, blocks, "2026-07-05")
    expect(cells[0]).toMatchObject({ unitId: "u1", underMaintenance: false, canInspect: true })
    expect(cells[1]).toMatchObject({ unitId: "u2", underMaintenance: true, canInspect: false })
  })
})

describe("roomStatusDisabledReason", () => {
  it("mirrors the server inspected-requires-clean rule", () => {
    expect(roomStatusDisabledReason("clean", "inspected")).toBeNull()
    expect(roomStatusDisabledReason("dirty", "inspected")).toMatch(/clean/i)
    expect(roomStatusDisabledReason(null, "inspected")).toMatch(/clean/i)
    expect(roomStatusDisabledReason("dirty", "dirty")).toBeNull() // no-op
    expect(roomStatusDisabledReason("inspected", "dirty")).toBeNull()
  })
})
