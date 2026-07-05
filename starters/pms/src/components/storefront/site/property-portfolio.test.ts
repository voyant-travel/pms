import { describe, expect, it } from "vitest"

import { groupHitsByProperty } from "./property-portfolio"

function hit(id: string, propertyId: string, thumbnailUrl?: string) {
  return { id, document: { fields: { propertyId, ...(thumbnailUrl ? { thumbnailUrl } : {}) } } }
}

describe("groupHitsByProperty", () => {
  it("collapses room-type hits into one group per property, in first-seen order", () => {
    const groups = groupHitsByProperty({
      hits: [
        hit("hrmt_1", "prop_a", "https://picsum.photos/seed/acme-grand/800/500"),
        hit("hrmt_2", "prop_a"),
        hit("hrmt_3", "prop_b", "https://picsum.photos/seed/acme-city/800/500"),
      ],
    })
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      propertyId: "prop_a",
      representativeRoomId: "hrmt_1",
      thumbnailUrl: "https://picsum.photos/seed/acme-grand/800/500",
      roomTypeIds: ["hrmt_1", "hrmt_2"],
    })
    expect(groups[1]?.propertyId).toBe("prop_b")
    expect(groups[1]?.roomTypeIds).toEqual(["hrmt_3"])
  })

  it("backfills a missing thumbnail from a later hit in the same group", () => {
    const groups = groupHitsByProperty({
      hits: [
        hit("hrmt_1", "prop_a"),
        hit("hrmt_2", "prop_a", "https://picsum.photos/seed/acme-grand/800/500"),
      ],
    })
    expect(groups[0]?.thumbnailUrl).toBe("https://picsum.photos/seed/acme-grand/800/500")
  })

  it("keys hits without a propertyId by their own id so none are dropped", () => {
    const groups = groupHitsByProperty({ hits: [{ id: "hrmt_x", document: { fields: {} } }] })
    expect(groups).toHaveLength(1)
    expect(groups[0]?.propertyId).toBe("hrmt_x")
    expect(groups[0]?.representativeRoomId).toBe("hrmt_x")
  })

  it("returns an empty array for missing or empty results", () => {
    expect(groupHitsByProperty(undefined)).toEqual([])
    expect(groupHitsByProperty({ hits: [] })).toEqual([])
  })
})
