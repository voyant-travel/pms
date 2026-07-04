import { describe, expect, it } from "vitest"

import {
  canAddPosting,
  canCloseFolio,
  canSettleFolio,
  canVoidPosting,
  formatPercent,
  type LedgerPosting,
  revenueByTypeRows,
  toLedgerRows,
} from "./folios-model"

function posting(over: Partial<LedgerPosting> & { id: string; amountCents: number }): LedgerPosting {
  return {
    reversalOfId: null,
    businessDate: "2026-07-05",
    type: "room",
    description: "Room",
    quantity: 1,
    source: "manual",
    ...over,
  }
}

describe("toLedgerRows", () => {
  it("computes a signed running balance across charges and payments", () => {
    const rows = toLedgerRows([
      posting({ id: "a", amountCents: 20000, type: "room" }),
      posting({ id: "b", amountCents: 1800, type: "tax" }),
      posting({ id: "c", amountCents: -21800, type: "payment" }),
    ])
    expect(rows.map((r) => r.runningBalanceCents)).toEqual([20000, 21800, 0])
  })

  it("is empty for no postings", () => {
    expect(toLedgerRows([])).toEqual([])
  })

  it("marks a voided original as reversed and its reversal as a void", () => {
    const rows = toLedgerRows([
      posting({ id: "a", amountCents: 5000, type: "fee" }),
      posting({ id: "v", amountCents: -5000, type: "fee", reversalOfId: "a", source: "manual" }),
    ])
    expect(rows[0].isReversed).toBe(true)
    expect(rows[0].isReversal).toBe(false)
    expect(rows[1].isReversal).toBe(true)
    expect(rows[1].reversalKind).toBe("void")
    // A void nets its type to zero.
    expect(rows[1].runningBalanceCents).toBe(0)
  })

  it("classifies a transfer-out reversal by its source", () => {
    const rows = toLedgerRows([
      posting({ id: "a", amountCents: 3000, type: "extra" }),
      posting({
        id: "t",
        amountCents: -3000,
        type: "transfer",
        reversalOfId: "a",
        source: "transfer",
      }),
    ])
    expect(rows[0].isReversed).toBe(true)
    expect(rows[1].reversalKind).toBe("transfer")
  })

  it("leaves plain postings unreversed with a null kind", () => {
    const [row] = toLedgerRows([posting({ id: "a", amountCents: 1000 })])
    expect(row.isReversed).toBe(false)
    expect(row.isReversal).toBe(false)
    expect(row.reversalKind).toBeNull()
  })
})

describe("lifecycle guards", () => {
  it("only allows postings and settle on an open folio", () => {
    expect(canAddPosting("open")).toBe(true)
    expect(canAddPosting("settled")).toBe(false)
    expect(canSettleFolio("open")).toBe(true)
    expect(canSettleFolio("closed")).toBe(false)
  })

  it("only allows close on a settled folio", () => {
    expect(canCloseFolio("settled")).toBe(true)
    expect(canCloseFolio("open")).toBe(false)
    expect(canCloseFolio("voided")).toBe(false)
  })

  it("only voids a live posting on an open folio", () => {
    const live = { isReversal: false, isReversed: false }
    expect(canVoidPosting("open", live)).toBe(true)
    expect(canVoidPosting("settled", live)).toBe(false)
    expect(canVoidPosting("open", { isReversal: true, isReversed: false })).toBe(false)
    expect(canVoidPosting("open", { isReversal: false, isReversed: true })).toBe(false)
  })
})

describe("report shaping", () => {
  it("formats occupancy as a rounded percentage", () => {
    expect(formatPercent(0)).toBe("0%")
    expect(formatPercent(1)).toBe("100%")
    expect(formatPercent(0.725)).toBe("72.5%")
    expect(formatPercent(0.3333)).toBe("33.3%")
  })

  it("orders revenue rows with payments last and drops zeros", () => {
    const rows = revenueByTypeRows({ tax: 1800, room: 20000, payment: -21800, fee: 0 })
    expect(rows.map((r) => r.type)).toEqual(["room", "tax", "payment"])
    expect(rows.find((r) => r.type === "fee")).toBeUndefined()
  })

  it("returns no revenue rows for an empty map", () => {
    expect(revenueByTypeRows({})).toEqual([])
  })
})
