import { describe, expect, it } from "vitest"

import {
  chargesBalanceCents,
  folioBalanceCents,
  netByType,
  paidCents,
  summarizeFolio,
} from "./balance"

const postings = [
  { type: "room", amountCents: 20000 },
  { type: "tax", amountCents: 1800 },
  { type: "extra", amountCents: 500 },
  { type: "payment", amountCents: -10000 },
]

describe("folioBalanceCents", () => {
  it("is the signed sum of every posting", () => {
    expect(folioBalanceCents(postings)).toBe(12300)
  })

  it("is 0 for an empty folio", () => {
    expect(folioBalanceCents([])).toBe(0)
  })

  it("nets to 0 when fully paid", () => {
    expect(folioBalanceCents([...postings, { type: "payment", amountCents: -12300 }])).toBe(0)
  })
})

describe("chargesBalanceCents", () => {
  it("sums the charge side only, ignoring payments", () => {
    expect(chargesBalanceCents(postings)).toBe(22300)
  })

  it("reflects credits (a reversal reduces the charge side)", () => {
    expect(chargesBalanceCents([...postings, { type: "room", amountCents: -20000 }])).toBe(2300)
  })
})

describe("paidCents", () => {
  it("returns payments as a positive figure", () => {
    expect(paidCents(postings)).toBe(10000)
  })

  it("is 0 with no payments", () => {
    expect(paidCents([{ type: "room", amountCents: 100 }])).toBe(0)
  })
})

describe("netByType", () => {
  it("groups signed amounts by type", () => {
    expect(netByType(postings)).toEqual({ room: 20000, tax: 1800, extra: 500, payment: -10000 })
  })
})

describe("summarizeFolio", () => {
  it("assembles balance + charges + paid + byType", () => {
    expect(summarizeFolio(postings)).toEqual({
      balanceCents: 12300,
      chargesCents: 22300,
      paidCents: 10000,
      byType: { room: 20000, tax: 1800, extra: 500, payment: -10000 },
    })
  })
})
