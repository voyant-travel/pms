import { describe, expect, it } from "vitest"

import {
  buildTransferPostings,
  buildVoidPosting,
  type SourcePosting,
  transferSourceKey,
  voidSourceKey,
} from "./transfer"

const original: SourcePosting = {
  id: "fpst_room1",
  folioId: "folo_a",
  businessDate: "2026-07-04",
  type: "room",
  description: "Room charge — night of 2026-07-04",
  amountCents: 20000,
  currency: "EUR",
  quantity: 1,
  unitAmountCents: 20000,
}

describe("buildVoidPosting", () => {
  it("negates the amount, keeps the type, and links the original", () => {
    const v = buildVoidPosting(original, "user_1")
    expect(v.amountCents).toBe(-20000)
    expect(v.unitAmountCents).toBe(-20000)
    expect(v.type).toBe("room")
    expect(v.reversalOfId).toBe("fpst_room1")
    expect(v.sourceKey).toBe(voidSourceKey("fpst_room1"))
    expect(v.source).toBe("manual")
    expect(v.createdBy).toBe("user_1")
  })

  it("nets the original to zero (void + original = 0)", () => {
    const v = buildVoidPosting(original, null)
    expect(original.amountCents + v.amountCents).toBe(0)
  })

  it("carries a null unit amount through", () => {
    const v = buildVoidPosting({ ...original, unitAmountCents: null }, null)
    expect(v.unitAmountCents).toBeNull()
  })
})

describe("buildTransferPostings", () => {
  it("reverses on the source and copies to the target, both typed transfer", () => {
    const { reversal, copy } = buildTransferPostings(original, "folo_b", "user_1")

    expect(reversal.folioId).toBe("folo_a")
    expect(reversal.amountCents).toBe(-20000)
    expect(reversal.type).toBe("transfer")
    expect(reversal.reversalOfId).toBe("fpst_room1")

    expect(copy.folioId).toBe("folo_b")
    expect(copy.amountCents).toBe(20000)
    expect(copy.type).toBe("transfer")
    expect(copy.reversalOfId).toBe("fpst_room1")
  })

  it("shares a deterministic transfer key across both legs", () => {
    const { reversal, copy } = buildTransferPostings(original, "folo_b", null)
    const key = transferSourceKey("fpst_room1", "folo_b")
    expect(reversal.sourceKey).toBe(`${key}:out`)
    expect(copy.sourceKey).toBe(`${key}:in`)
  })

  it("conserves value across the move (source loses what the target gains)", () => {
    const { reversal, copy } = buildTransferPostings(original, "folo_b", null)
    expect(reversal.amountCents + copy.amountCents).toBe(0)
  })
})
