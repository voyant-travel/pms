import type { BoardEntry, Boards } from "@voyant-travel/pms-front-desk"
import { describe, expect, it } from "vitest"

import {
  buildKpiSummary,
  countUnassignedArrivals,
  formatPercent,
  formatStayRange,
  frontDeskRow,
  housekeepingSummary,
  recentReservationView,
  reservationGuestName,
  reservationStatusTone,
  sumOpenBalances,
  topFrontDeskRows,
} from "./dashboard-model"

function entry(over: Partial<BoardEntry> = {}): BoardEntry {
  return {
    bookingItemId: "bkit_1",
    bookingId: "book_1",
    bookingNumber: "STAY-1",
    guestName: "Emma Schmidt",
    roomTypeId: "rt_1",
    checkInDate: "2026-07-06",
    checkOutDate: "2026-07-08",
    adults: 2,
    children: 0,
    infants: 0,
    opsStatus: null,
    unitId: "unit_1",
    ...over,
  }
}

function boards(over: Partial<Boards> = {}): Boards {
  return {
    propertyId: "prop_1",
    date: "2026-07-06",
    arrivals: [],
    departures: [],
    inHouse: [],
    ...over,
  }
}

describe("countUnassignedArrivals", () => {
  it("counts arrivals with no unit assigned", () => {
    const arrivals = [entry({ unitId: "unit_1" }), entry({ unitId: null }), entry({ unitId: null })]
    expect(countUnassignedArrivals(arrivals)).toBe(2)
  })

  it("is zero for an empty list", () => {
    expect(countUnassignedArrivals([])).toBe(0)
  })
})

describe("buildKpiSummary", () => {
  it("combines the daily report and boards into KPI numbers", () => {
    const report = {
      occupancy: 0.0667,
      occupiedUnits: 4,
      sellableUnits: 60,
      roomsSold: 7,
      adrCents: 30422,
      revParCents: 3549,
      totalRevenueCents: 212951,
      revenueByType: { room: 212951 },
    }
    const b = boards({
      arrivals: [entry({ unitId: "unit_1" }), entry({ unitId: null })],
      departures: [entry()],
      inHouse: [entry(), entry(), entry()],
    })
    const kpi = buildKpiSummary(report, b)
    expect(kpi).toEqual({
      occupancy: 0.0667,
      occupiedUnits: 4,
      sellableUnits: 60,
      arrivals: 2,
      unassignedArrivals: 1,
      departures: 1,
      inHouse: 3,
      adrCents: 30422,
      revParCents: 3549,
    })
  })

  it("degrades to zeros when data is still loading", () => {
    const kpi = buildKpiSummary(undefined, undefined)
    expect(kpi.occupancy).toBe(0)
    expect(kpi.arrivals).toBe(0)
    expect(kpi.adrCents).toBe(0)
  })
})

describe("formatPercent", () => {
  it("renders a ratio as a one-decimal percentage", () => {
    expect(formatPercent(0.0667)).toBe("6.7%")
    expect(formatPercent(0)).toBe("0%")
    expect(formatPercent(1)).toBe("100%")
  })
})

describe("frontDeskRow / topFrontDeskRows", () => {
  const roomTypeNames = new Map([["rt_1", "Deluxe King"]])
  const unitNumbers = new Map([["unit_1", "101"]])

  it("resolves room-type and unit names", () => {
    const row = frontDeskRow(entry(), roomTypeNames, unitNumbers)
    expect(row.roomTypeName).toBe("Deluxe King")
    expect(row.unitNumber).toBe("101")
    expect(row.guestName).toBe("Emma Schmidt")
  })

  it("marks an unassigned arrival with a null unit", () => {
    const row = frontDeskRow(entry({ unitId: null }), roomTypeNames, unitNumbers)
    expect(row.unitNumber).toBeNull()
  })

  it("falls back to the raw room-type id and a guest placeholder", () => {
    const row = frontDeskRow(
      entry({ roomTypeId: "rt_unknown", guestName: null }),
      roomTypeNames,
      unitNumbers,
    )
    expect(row.roomTypeName).toBe("rt_unknown")
    expect(row.guestName).toBe("Guest")
  })

  it("keeps only the first N entries", () => {
    const entries = Array.from({ length: 8 }, (_, i) => entry({ bookingItemId: `bkit_${i}` }))
    const rows = topFrontDeskRows(entries, roomTypeNames, unitNumbers, 5)
    expect(rows).toHaveLength(5)
    expect(rows[0].bookingItemId).toBe("bkit_0")
  })
})

describe("housekeepingSummary", () => {
  it("aggregates tasks, room statuses and maintenance", () => {
    const summary = housekeepingSummary({
      tasks: [
        { status: "open" },
        { status: "open" },
        { status: "in_progress" },
        { status: "done" },
      ],
      roomStatus: [
        { roomStatus: "dirty" },
        { roomStatus: "clean" },
        { roomStatus: "clean" },
        { roomStatus: "inspected" },
        { roomStatus: null },
      ],
      maintenance: [{ status: "active" }, { status: "resolved" }],
    })
    expect(summary).toEqual({
      openTasks: 2,
      inProgressTasks: 1,
      dirty: 1,
      clean: 2,
      inspected: 1,
      untracked: 1,
      activeMaintenance: 1,
    })
  })

  it("is all zeros for empty inputs", () => {
    expect(housekeepingSummary({ tasks: [], roomStatus: [], maintenance: [] })).toEqual({
      openTasks: 0,
      inProgressTasks: 0,
      dirty: 0,
      clean: 0,
      inspected: 0,
      untracked: 0,
      activeMaintenance: 0,
    })
  })
})

describe("sumOpenBalances", () => {
  it("sums balances of open folios only", () => {
    const result = sumOpenBalances([
      { status: "open", balanceCents: 25800 },
      { status: "open", balanceCents: 182750 },
      { status: "settled", balanceCents: 9999 },
      { status: "open" },
    ])
    expect(result).toEqual({ count: 3, totalCents: 208550 })
  })

  it("is zero when no folios are open", () => {
    expect(sumOpenBalances([{ status: "settled", balanceCents: 100 }])).toEqual({
      count: 0,
      totalCents: 0,
    })
  })
})

describe("reservationStatusTone", () => {
  it("maps statuses to badge tones", () => {
    expect(reservationStatusTone("confirmed")).toBe("confirmed")
    expect(reservationStatusTone("awaiting_payment")).toBe("confirmed")
    expect(reservationStatusTone("in_progress")).toBe("in-house")
    expect(reservationStatusTone("completed")).toBe("checked-out")
    expect(reservationStatusTone("cancelled")).toBe("cancelled")
    expect(reservationStatusTone("expired")).toBe("cancelled")
    expect(reservationStatusTone("on_hold")).toBe("pending")
    expect(reservationStatusTone("draft")).toBe("pending")
  })
})

describe("reservationGuestName", () => {
  it("joins contact names and falls back to Guest", () => {
    expect(reservationGuestName("Emma", "Schmidt")).toBe("Emma Schmidt")
    expect(reservationGuestName(null, "Schmidt")).toBe("Schmidt")
    expect(reservationGuestName("  ", null)).toBe("Guest")
  })
})

describe("formatStayRange", () => {
  it("formats a full window", () => {
    expect(formatStayRange("2026-07-06", "2026-07-08")).toBe("06 Jul → 08 Jul")
  })

  it("handles a single-sided or missing range", () => {
    expect(formatStayRange("2026-07-06", null)).toBe("06 Jul")
    expect(formatStayRange(null, null)).toBe("—")
  })
})

describe("recentReservationView", () => {
  it("shapes a reservation into a display row", () => {
    const view = recentReservationView({
      bookingNumber: "STAY-202607-INHU5Q",
      status: "confirmed",
      sourceType: "direct",
      contactFirstName: "Emma",
      contactLastName: "Schmidt",
      startDate: "2026-07-06",
      endDate: "2026-07-08",
    })
    expect(view).toEqual({
      stayNumber: "STAY-202607-INHU5Q",
      guestName: "Emma Schmidt",
      dateRange: "06 Jul → 08 Jul",
      tone: "confirmed",
      statusKey: "confirmed",
      sourceKey: "direct",
    })
  })
})
