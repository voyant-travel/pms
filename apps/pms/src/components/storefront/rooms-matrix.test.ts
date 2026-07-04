import { describe, expect, it } from "vitest"

import { buildRoomsMatrix, firstSelectablePair, ratePlansForRoom } from "./rooms-matrix"

// Minimal fixtures shaped like the accommodation content aggregate. Only
// the fields the matrix reads are populated.
const content = {
  room_types: [
    { id: "rt_std", name: "Standard" },
    { id: "rt_suite", name: "Suite" },
    { id: "rt_noplan", name: "Orphan" },
  ],
  rate_plans: [
    { id: "rp_all", name: "Flexible", applies_to_room_type_ids: [] },
    { id: "rp_std_bb", name: "Bed & Breakfast", applies_to_room_type_ids: ["rt_std"] },
    { id: "rp_suite_ai", name: "All inclusive", applies_to_room_type_ids: ["rt_suite"] },
  ],
} as unknown as Parameters<typeof buildRoomsMatrix>[0]

describe("ratePlansForRoom", () => {
  it("includes plans that apply to all rooms plus room-specific plans", () => {
    expect(ratePlansForRoom(content, "rt_std").map((r) => r.id)).toEqual(["rp_all", "rp_std_bb"])
  })

  it("excludes plans scoped to other rooms", () => {
    expect(ratePlansForRoom(content, "rt_suite").map((r) => r.id)).toEqual([
      "rp_all",
      "rp_suite_ai",
    ])
  })

  it("returns only universal plans for a room with no specific plan", () => {
    expect(ratePlansForRoom(content, "rt_noplan").map((r) => r.id)).toEqual(["rp_all"])
  })
})

describe("buildRoomsMatrix", () => {
  it("emits one row per room type, in content order", () => {
    const matrix = buildRoomsMatrix(content)
    expect(matrix.map((r) => r.room.id)).toEqual(["rt_std", "rt_suite", "rt_noplan"])
    expect(matrix[1]?.ratePlans.map((r) => r.id)).toEqual(["rp_all", "rp_suite_ai"])
  })
})

describe("firstSelectablePair", () => {
  it("returns the first room's first applicable rate", () => {
    expect(firstSelectablePair(content)).toEqual({ roomTypeId: "rt_std", ratePlanId: "rp_all" })
  })

  it("is null when no rate plan applies anywhere", () => {
    const empty = {
      room_types: [{ id: "rt_x", name: "X" }],
      rate_plans: [],
    } as unknown as Parameters<typeof firstSelectablePair>[0]
    expect(firstSelectablePair(empty)).toBeNull()
  })
})
