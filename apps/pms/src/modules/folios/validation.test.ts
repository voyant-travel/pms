import { describe, expect, it } from "vitest"

import {
  createPostingSchema,
  manualPostingTypeSchema,
  openFolioSchema,
  settleFolioSchema,
  transferPostingSchema,
} from "./validation"

describe("openFolioSchema", () => {
  it("requires a bookingItemId for a stay folio", () => {
    const bad = openFolioSchema.safeParse({ propertyId: "prop_1", kind: "stay", currency: "EUR" })
    expect(bad.success).toBe(false)
  })

  it("accepts a stay folio with a bookingItemId", () => {
    const ok = openFolioSchema.safeParse({
      propertyId: "prop_1",
      kind: "stay",
      bookingItemId: "bkit_1",
      bookingId: "book_1",
      currency: "EUR",
    })
    expect(ok.success).toBe(true)
  })

  it("accepts a house folio with no booking", () => {
    const ok = openFolioSchema.safeParse({ propertyId: "prop_1", kind: "house", currency: "EUR" })
    expect(ok.success).toBe(true)
  })

  it("rejects a non-3-letter currency", () => {
    const bad = openFolioSchema.safeParse({ propertyId: "prop_1", kind: "house", currency: "EURO" })
    expect(bad.success).toBe(false)
  })
})

describe("manualPostingTypeSchema", () => {
  it("does not allow transfer (that goes through the transfer route)", () => {
    expect(manualPostingTypeSchema.safeParse("transfer").success).toBe(false)
    expect(manualPostingTypeSchema.safeParse("room").success).toBe(true)
  })
})

describe("createPostingSchema", () => {
  it("defaults quantity to 1 and allows a signed amount", () => {
    const parsed = createPostingSchema.parse({
      businessDate: "2026-07-04",
      type: "payment",
      description: "Card payment",
      amountCents: -10000,
    })
    expect(parsed.quantity).toBe(1)
    expect(parsed.amountCents).toBe(-10000)
  })

  it("rejects a malformed business date", () => {
    const bad = createPostingSchema.safeParse({
      businessDate: "07/04/2026",
      type: "room",
      description: "x",
      amountCents: 1,
    })
    expect(bad.success).toBe(false)
  })
})

describe("transferPostingSchema", () => {
  it("requires a posting and a target folio", () => {
    expect(
      transferPostingSchema.safeParse({ postingId: "fpst_1", targetFolioId: "folo_2" }).success,
    ).toBe(true)
    expect(transferPostingSchema.safeParse({ postingId: "fpst_1" }).success).toBe(false)
  })
})

describe("settleFolioSchema", () => {
  it("accepts an empty body (reconciliation intent optional)", () => {
    expect(settleFolioSchema.safeParse({}).success).toBe(true)
  })

  it("accepts an expected balance", () => {
    expect(settleFolioSchema.safeParse({ expectedBalanceCents: 12300 }).success).toBe(true)
  })
})
