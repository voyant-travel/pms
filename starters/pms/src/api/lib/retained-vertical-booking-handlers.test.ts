import type { CommitOwnedResult } from "@voyant-travel/catalog/booking-engine"
import { describe, expect, it } from "vitest"
import { adoptBridgeBookingId } from "./retained-vertical-booking-handlers"

describe("adoptBridgeBookingId", () => {
  it("promotes upstreamPayload.bridgeBookingId to the canonical bookingId when missing", () => {
    const result: CommitOwnedResult = {
      status: "held",
      orderRef: "STAY-202607-RJ1V76",
      upstreamPayload: { bridgeBookingId: "book_stay_real" },
    }
    expect(adoptBridgeBookingId(result)).toEqual({
      status: "held",
      orderRef: "STAY-202607-RJ1V76",
      bookingId: "book_stay_real",
      upstreamPayload: { bridgeBookingId: "book_stay_real" },
    })
  })

  it("keeps an already-set top-level bookingId (does not clobber correct handlers)", () => {
    const result: CommitOwnedResult = {
      status: "held",
      orderRef: "ref",
      bookingId: "book_explicit",
      upstreamPayload: { bridgeBookingId: "book_bridge" },
    }
    expect(adoptBridgeBookingId(result)).toBe(result)
  })

  it("leaves failed results untouched", () => {
    const result: CommitOwnedResult = {
      status: "failed",
      orderRef: "",
      upstreamPayload: { bridgeBookingId: "book_bridge" },
    }
    expect(adoptBridgeBookingId(result)).toBe(result)
  })

  it("is a no-op when there is no bridgeBookingId to adopt", () => {
    const result: CommitOwnedResult = {
      status: "held",
      orderRef: "ref",
      upstreamPayload: { note: "no id here" },
    }
    expect(adoptBridgeBookingId(result)).toBe(result)
  })

  it("ignores a non-string bridgeBookingId", () => {
    const result: CommitOwnedResult = {
      status: "held",
      orderRef: "ref",
      upstreamPayload: { bridgeBookingId: 42 as unknown as string },
    }
    expect(adoptBridgeBookingId(result)).toBe(result)
  })
})
