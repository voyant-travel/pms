import { describe, expect, it } from "vitest"

import { classifyBoards } from "./service-boards"
import type { StayContext } from "./service-reads"

function stay(over: Partial<StayContext> & Pick<StayContext, "bookingItemId">): StayContext {
  return {
    propertyId: "prop_1",
    roomTypeId: "rt_1",
    checkInDate: "2026-07-01",
    checkOutDate: "2026-07-05",
    reservationStatus: "reserved",
    adults: 2,
    children: 0,
    infants: 0,
    roomCount: 1,
    bookingId: "book_1",
    bookingNumber: "B-1",
    bookingStatus: "confirmed",
    guestName: "Guest",
    opsStatus: null,
    checkedInAt: null,
    checkedOutAt: null,
    ...over,
  }
}

describe("classifyBoards", () => {
  const date = "2026-07-03"

  it("classifies arrivals, departures and in-house by half-open dates", () => {
    const boards = classifyBoards({
      propertyId: "prop_1",
      date,
      stays: [
        stay({ bookingItemId: "arr", checkInDate: date, checkOutDate: "2026-07-06" }),
        stay({ bookingItemId: "dep", checkInDate: "2026-07-01", checkOutDate: date }),
        stay({ bookingItemId: "inh", checkInDate: "2026-07-01", checkOutDate: "2026-07-06" }),
      ],
    })
    expect(boards.arrivals.map((e) => e.bookingItemId)).toEqual(["arr"])
    expect(boards.departures.map((e) => e.bookingItemId)).toEqual(["dep"])
    expect(boards.inHouse.map((e) => e.bookingItemId)).toEqual(["inh"])
  })

  it("counts a checked-in same-day arrival as in-house too", () => {
    const boards = classifyBoards({
      propertyId: "prop_1",
      date,
      stays: [stay({ bookingItemId: "x", checkInDate: date, opsStatus: "checked_in" })],
    })
    expect(boards.arrivals.map((e) => e.bookingItemId)).toEqual(["x"])
    expect(boards.inHouse.map((e) => e.bookingItemId)).toEqual(["x"])
  })

  it("drops checked-out stays from in-house", () => {
    const boards = classifyBoards({
      propertyId: "prop_1",
      date,
      stays: [
        stay({
          bookingItemId: "gone",
          checkInDate: "2026-07-01",
          checkOutDate: "2026-07-06",
          opsStatus: "checked_out",
        }),
      ],
    })
    expect(boards.inHouse).toEqual([])
  })

  it("excludes cancelled and no-show reservations from every board", () => {
    const boards = classifyBoards({
      propertyId: "prop_1",
      date,
      stays: [
        stay({ bookingItemId: "c", checkInDate: date, reservationStatus: "cancelled" }),
        stay({ bookingItemId: "n", checkInDate: date, reservationStatus: "no_show" }),
      ],
    })
    expect(boards.arrivals).toEqual([])
    expect(boards.departures).toEqual([])
    expect(boards.inHouse).toEqual([])
  })

  it("attaches the assigned unit id to board entries", () => {
    const boards = classifyBoards({
      propertyId: "prop_1",
      date,
      stays: [stay({ bookingItemId: "arr", checkInDate: date })],
      assignments: [
        { bookingItemId: "arr", unitId: "runt_9", fromDate: date, toDate: "2026-07-06" },
      ],
    })
    expect(boards.arrivals[0].unitId).toBe("runt_9")
  })
})
