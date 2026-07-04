import { describe, expect, it } from "vitest"

import type { BoardEntry } from "../../modules/front-desk"
import {
  boardEntryState,
  boardEntryView,
  checkInDisabledReason,
  checkOutDisabledReason,
  noShowDisabledReason,
  paxSummary,
} from "./boards-model"

function entry(over: Partial<BoardEntry> = {}): BoardEntry {
  return {
    bookingItemId: "bi_1",
    bookingId: "bk_1",
    bookingNumber: "BK-1001",
    guestName: "Ada Lovelace",
    roomTypeId: "rt_1",
    checkInDate: "2026-07-01",
    checkOutDate: "2026-07-04",
    adults: 2,
    children: 1,
    infants: 0,
    opsStatus: null,
    unitId: null,
    ...over,
  }
}

describe("paxSummary", () => {
  it("joins non-zero pax counts", () => {
    expect(paxSummary(2, 1, 1)).toBe("2A · 1C · 1I")
    expect(paxSummary(2, 0, 0)).toBe("2A")
    expect(paxSummary(0, 0, 0)).toBe("—")
  })
})

describe("boardEntryView", () => {
  it("computes nights, pax and state", () => {
    expect(boardEntryView(entry())).toEqual({
      nights: 3,
      pax: "2A · 1C",
      stateLabel: "Reserved",
      stateTone: "reserved",
    })
  })

  it("reflects the ops overlay", () => {
    expect(boardEntryView(entry({ opsStatus: "checked_in" })).stateTone).toBe("in-house")
    expect(boardEntryState("no_show")).toBe("no-show")
    expect(boardEntryState("checked_out")).toBe("checked-out")
  })
})

describe("action guards", () => {
  it("gates check-in", () => {
    expect(checkInDisabledReason(null)).toBeNull()
    expect(checkInDisabledReason("checked_in")).toMatch(/already/i)
    expect(checkInDisabledReason("no_show")).toMatch(/no-show/i)
  })

  it("gates check-out", () => {
    expect(checkOutDisabledReason("checked_in")).toBeNull()
    expect(checkOutDisabledReason(null)).toMatch(/not checked in/i)
    expect(checkOutDisabledReason("checked_out")).toMatch(/already/i)
  })

  it("gates no-show to still-expected arrivals", () => {
    expect(noShowDisabledReason(null)).toBeNull()
    expect(noShowDisabledReason("checked_in")).toMatch(/in-house/i)
    expect(noShowDisabledReason("no_show")).toMatch(/already/i)
  })
})
