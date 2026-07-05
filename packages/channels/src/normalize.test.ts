import { describe, expect, it } from "vitest"

import type { InboundReservation } from "./connector"
import {
  initialLedgerStatus,
  shouldAttemptIngest,
  splitGuestName,
  validateInboundReservation,
} from "./normalize"

const reservation = (over: Partial<InboundReservation> = {}): InboundReservation => ({
  channel: "mock",
  channelReservationId: "MOCK-1",
  roomTypeRef: "rmty_1",
  ratePlanRef: "rtpl_1",
  checkIn: "2026-08-01",
  checkOut: "2026-08-03",
  occupancy: { adults: 2 },
  guest: { name: "Jane Doe" },
  currency: "EUR",
  status: "confirmed",
  raw: {},
  ...over,
})

describe("validateInboundReservation", () => {
  it("accepts a well-formed reservation", () => {
    expect(validateInboundReservation(reservation())).toEqual({ ok: true })
  })

  it("rejects an out-of-order date range", () => {
    const r = validateInboundReservation(
      reservation({ checkIn: "2026-08-03", checkOut: "2026-08-01" }),
    )
    expect(r).toEqual({ ok: false, reason: "checkOut must be after checkIn" })
  })

  it("rejects same-day check-in/out", () => {
    expect(validateInboundReservation(reservation({ checkOut: "2026-08-01" })).ok).toBe(false)
  })

  it("rejects a non-ISO date", () => {
    expect(validateInboundReservation(reservation({ checkIn: "08/01/2026" })).ok).toBe(false)
  })

  it("rejects a bad currency code", () => {
    expect(validateInboundReservation(reservation({ currency: "EURO" })).ok).toBe(false)
  })

  it("rejects zero adults", () => {
    expect(validateInboundReservation(reservation({ occupancy: { adults: 0 } })).ok).toBe(false)
  })

  it("rejects a missing guest name", () => {
    expect(validateInboundReservation(reservation({ guest: { name: "  " } })).ok).toBe(false)
  })
})

describe("initialLedgerStatus", () => {
  it("a fresh confirmed reservation lands received", () => {
    expect(initialLedgerStatus(null, reservation())).toBe("received")
  })

  it("a cancelled reservation lands ignored", () => {
    expect(initialLedgerStatus(null, reservation({ status: "cancelled" }))).toBe("ignored")
  })

  it("keeps ingested when the reservation was already booked", () => {
    expect(initialLedgerStatus({ status: "ingested" }, reservation())).toBe("ingested")
  })
})

describe("shouldAttemptIngest", () => {
  it("ingests a fresh confirmed reservation", () => {
    expect(shouldAttemptIngest(null, reservation())).toBe(true)
  })

  it("re-ingests a previously failed reservation", () => {
    expect(shouldAttemptIngest({ status: "failed" }, reservation())).toBe(true)
  })

  it("never re-ingests an already-ingested reservation (idempotent)", () => {
    expect(shouldAttemptIngest({ status: "ingested" }, reservation())).toBe(false)
  })

  it("does not book a modified or cancelled reservation in this phase", () => {
    expect(shouldAttemptIngest(null, reservation({ status: "modified" }))).toBe(false)
    expect(shouldAttemptIngest(null, reservation({ status: "cancelled" }))).toBe(false)
  })
})

describe("splitGuestName", () => {
  it("splits first + last on the last space", () => {
    expect(splitGuestName("Jane Doe")).toEqual({ firstName: "Jane", lastName: "Doe" })
  })

  it("keeps middle names on the first-name side", () => {
    expect(splitGuestName("Jane Q Public")).toEqual({ firstName: "Jane Q", lastName: "Public" })
  })

  it("treats a single token as the last name", () => {
    expect(splitGuestName("Cher")).toEqual({ firstName: "", lastName: "Cher" })
  })

  it("collapses extra whitespace", () => {
    expect(splitGuestName("  Jane   Doe  ")).toEqual({ firstName: "Jane", lastName: "Doe" })
  })
})
