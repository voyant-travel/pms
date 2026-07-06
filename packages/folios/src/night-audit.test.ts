import { describe, expect, it } from "vitest"

import {
  type AuditStay,
  enrichUnpriced,
  planNightAuditPostings,
  resolveNightlyAmountCents,
  roomSourceKey,
  spansNight,
  taxSourceKey,
  type UnpricedStayLabels,
} from "./night-audit"

describe("spansNight (in-house selection)", () => {
  it("charges arrival + middle nights, not the departure night (half-open)", () => {
    expect(spansNight("2026-07-05", "2026-07-07", "2026-07-05")).toBe(true) // arrival
    expect(spansNight("2026-07-05", "2026-07-07", "2026-07-06")).toBe(true) // stayover
    expect(spansNight("2026-07-05", "2026-07-07", "2026-07-07")).toBe(false) // departure
    expect(spansNight("2026-07-05", "2026-07-07", "2026-07-04")).toBe(false) // before arrival
  })
})

describe("resolveNightlyAmountCents (daily-rate fallback)", () => {
  it("prefers the explicit daily-rate amount for the night", () => {
    expect(resolveNightlyAmountCents(20000, 90000, 5)).toBe(20000)
  })

  it("prefers an explicit 0 over the fallback (a free night is a real price)", () => {
    expect(resolveNightlyAmountCents(0, 90000, 5)).toBe(0)
  })

  it("falls back to the average nightly rate when there is no row for the night", () => {
    expect(resolveNightlyAmountCents(null, 90000, 5)).toBe(18000)
    expect(resolveNightlyAmountCents(undefined, 10000, 3)).toBe(3333) // rounded
  })

  it("is unpriceable (null) with no daily rate and no total", () => {
    expect(resolveNightlyAmountCents(null, null, 3)).toBeNull()
  })

  it("is unpriceable when nightCount is 0 (avoids divide-by-zero)", () => {
    expect(resolveNightlyAmountCents(null, 90000, 0)).toBeNull()
  })
})

describe("source keys", () => {
  it("are deterministic per booking item + date", () => {
    expect(roomSourceKey("bkit_1", "2026-07-04")).toBe("room:bkit_1:2026-07-04")
    expect(taxSourceKey("bkit_1", "2026-07-04")).toBe("tax:bkit_1:2026-07-04")
  })
})

describe("planNightAuditPostings", () => {
  const base: AuditStay = {
    bookingItemId: "bkit_1",
    folioId: "folo_1",
    checkInDate: "2026-07-04",
    checkOutDate: "2026-07-06",
    currency: "EUR",
    roomAmountCents: 20000,
    taxAmountCents: 1800,
  }

  it("plans a room + tax posting for a priced, taxed in-house stay", () => {
    const plan = planNightAuditPostings("2026-07-04", [base])
    expect(plan.postings).toHaveLength(2)
    const room = plan.postings.find((p) => p.type === "room")
    const tax = plan.postings.find((p) => p.type === "tax")
    expect(room?.amountCents).toBe(20000)
    expect(room?.sourceKey).toBe("room:bkit_1:2026-07-04")
    expect(room?.source).toBe("night_audit")
    expect(tax?.amountCents).toBe(1800)
    expect(tax?.sourceKey).toBe("tax:bkit_1:2026-07-04")
    expect(plan.unpriced).toEqual([])
  })

  it("omits the tax posting when the night carries no tax", () => {
    const plan = planNightAuditPostings("2026-07-04", [{ ...base, taxAmountCents: 0 }])
    expect(plan.postings).toHaveLength(1)
    expect(plan.postings[0].type).toBe("room")
  })

  it("skips (and reports) an unpriced stay rather than guessing", () => {
    const plan = planNightAuditPostings("2026-07-04", [{ ...base, roomAmountCents: null }])
    expect(plan.postings).toHaveLength(0)
    expect(plan.unpriced).toEqual(["bkit_1"])
  })

  it("drops a stay that does not span the audit night", () => {
    const plan = planNightAuditPostings("2026-07-06", [base]) // departure night
    expect(plan.postings).toHaveLength(0)
    expect(plan.unpriced).toEqual([])
  })

  it("plans across several in-house stays", () => {
    const plan = planNightAuditPostings("2026-07-04", [
      base,
      { ...base, bookingItemId: "bkit_2", folioId: "folo_2", taxAmountCents: null },
    ])
    // stay 1: room + tax; stay 2: room only
    expect(plan.postings).toHaveLength(3)
  })
})

describe("enrichUnpriced", () => {
  const labels = new Map<string, UnpricedStayLabels>([
    [
      "bkit_1",
      { bookingNumber: "STAY-0007", guestName: "Maria Ionescu", roomTypeName: "Deluxe King" },
    ],
  ])

  it("maps a raw booking-item id to its human labels", () => {
    expect(enrichUnpriced(["bkit_1"], labels)).toEqual([
      {
        bookingItemId: "bkit_1",
        bookingNumber: "STAY-0007",
        guestName: "Maria Ionescu",
        roomTypeName: "Deluxe King",
      },
    ])
  })

  it("degrades missing labels to null but keeps the id", () => {
    expect(enrichUnpriced(["bkit_missing"], labels)).toEqual([
      {
        bookingItemId: "bkit_missing",
        bookingNumber: null,
        guestName: null,
        roomTypeName: null,
      },
    ])
  })

  it("preserves order and length", () => {
    const out = enrichUnpriced(["bkit_missing", "bkit_1"], labels)
    expect(out.map((u) => u.bookingItemId)).toEqual(["bkit_missing", "bkit_1"])
  })
})
