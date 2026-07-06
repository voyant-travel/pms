import { describe, expect, it } from "vitest"

import {
  buildStayIcs,
  deriveStayTimeline,
  type StayBookingDetail,
  shapeRateBreakdown,
  totalGuests,
  validateLookupForm,
} from "./booking-view-model"

function makeDetail(overrides: Partial<StayBookingDetail> = {}): StayBookingDetail {
  return {
    bookingId: "book_1",
    bookingNumber: "STAY-202607-YYOUQ2",
    status: "confirmed",
    currency: "EUR",
    totalCents: 21930,
    startDate: "2026-07-04",
    endDate: "2026-07-06",
    pax: 1,
    confirmedAt: null,
    cancelledAt: null,
    completedAt: null,
    property: {
      name: "Acme Grand Hotel",
      checkInTime: "15:00",
      checkOutTime: "11:00",
      address: {
        line1: "Calea Victoriei 12",
        line2: null,
        city: "Bucharest",
        region: "Bucharest",
        postalCode: "010061",
        country: "RO",
        fullText: "Calea Victoriei 12, Bucharest, RO",
      },
    },
    rooms: [
      {
        stayItemId: "hsbi_1",
        roomTypeName: "Classic Double",
        ratePlanName: "Non-refundable — Room Only",
        ratePlanRefundable: false,
        mealPlanName: "Room Only",
        checkInDate: "2026-07-04",
        checkOutDate: "2026-07-06",
        nightCount: 2,
        roomCount: 1,
        adults: 1,
        children: 0,
        infants: 0,
        confirmationCode: null,
        currency: "EUR",
        nightly: [
          { date: "2026-07-04", amountCents: 11730, currency: "EUR" },
          { date: "2026-07-05", amountCents: 10200, currency: "EUR" },
        ],
        subtotalCents: 21930,
      },
    ],
    travelers: [{ firstName: "Nina", lastName: "Vasile", isPrimary: true }],
    ...overrides,
  }
}

describe("deriveStayTimeline", () => {
  it("marks a future confirmed stay as upcoming (confirmed done, upcoming current)", () => {
    const steps = deriveStayTimeline({
      status: "confirmed",
      checkInDate: "2026-07-20",
      checkOutDate: "2026-07-24",
      today: "2026-07-05",
    })
    expect(steps.map((s) => [s.key, s.state])).toEqual([
      ["confirmed", "done"],
      ["upcoming", "current"],
      ["in_house", "upcoming"],
      ["completed", "upcoming"],
    ])
  })

  it("marks a stay in progress as in-house", () => {
    const steps = deriveStayTimeline({
      status: "confirmed",
      checkInDate: "2026-07-03",
      checkOutDate: "2026-07-08",
      today: "2026-07-05",
    })
    expect(steps.find((s) => s.state === "current")?.key).toBe("in_house")
    expect(steps.find((s) => s.key === "confirmed")?.state).toBe("done")
    expect(steps.find((s) => s.key === "upcoming")?.state).toBe("done")
  })

  it("marks a departed stay as completed once past checkout", () => {
    const steps = deriveStayTimeline({
      status: "confirmed",
      checkInDate: "2026-06-01",
      checkOutDate: "2026-06-04",
      today: "2026-07-05",
    })
    expect(steps.at(-1)).toEqual({ key: "completed", state: "current" })
    expect(
      steps.every((s) => (s.key === "completed" ? s.state === "current" : s.state === "done")),
    ).toBe(true)
  })

  it("honours an explicit completed status regardless of dates", () => {
    const steps = deriveStayTimeline({
      status: "completed",
      checkInDate: "2026-08-01",
      checkOutDate: "2026-08-04",
      today: "2026-07-05",
    })
    expect(steps.find((s) => s.state === "current")?.key).toBe("completed")
  })

  it("short-circuits cancelled bookings to a confirmed → cancelled track", () => {
    const steps = deriveStayTimeline({
      status: "cancelled",
      checkInDate: "2026-08-09",
      checkOutDate: "2026-08-12",
      today: "2026-07-05",
    })
    expect(steps).toEqual([
      { key: "confirmed", state: "done" },
      { key: "cancelled", state: "current" },
    ])
  })

  it("treats expired the same as cancelled", () => {
    const steps = deriveStayTimeline({
      status: "expired",
      checkInDate: null,
      checkOutDate: null,
      today: "2026-07-05",
    })
    expect(steps.at(-1)?.key).toBe("cancelled")
  })

  it("falls back to the confirmed phase when dates are unknown", () => {
    const steps = deriveStayTimeline({
      status: "on_hold",
      checkInDate: null,
      checkOutDate: null,
      today: "2026-07-05",
    })
    expect(steps.find((s) => s.state === "current")?.key).toBe("confirmed")
  })
})

describe("shapeRateBreakdown", () => {
  it("builds per-room nightly rows and prefers the authoritative total", () => {
    const breakdown = shapeRateBreakdown(makeDetail())
    expect(breakdown.currency).toBe("EUR")
    expect(breakdown.rooms).toHaveLength(1)
    expect(breakdown.rooms[0]?.nights).toEqual([
      { date: "2026-07-04", amountCents: 11730 },
      { date: "2026-07-05", amountCents: 10200 },
    ])
    expect(breakdown.nightlySubtotalCents).toBe(21930)
    expect(breakdown.totalCents).toBe(21930)
  })

  it("falls back to the nightly subtotal when the booking total is missing", () => {
    const breakdown = shapeRateBreakdown(makeDetail({ totalCents: null }))
    expect(breakdown.totalCents).toBe(21930)
  })

  it("returns a null subtotal when no nightly amounts are present", () => {
    const detail = makeDetail({
      totalCents: null,
      rooms: [
        {
          ...makeDetail().rooms[0]!,
          nightly: [],
          subtotalCents: null,
        },
      ],
    })
    const breakdown = shapeRateBreakdown(detail)
    expect(breakdown.nightlySubtotalCents).toBeNull()
    expect(breakdown.totalCents).toBeNull()
  })
})

describe("totalGuests", () => {
  it("sums adults, children and infants across rooms", () => {
    const detail = makeDetail({
      rooms: [
        { ...makeDetail().rooms[0]!, adults: 2, children: 1, infants: 1 },
        { ...makeDetail().rooms[0]!, stayItemId: "hsbi_2", adults: 2, children: 0, infants: 0 },
      ],
    })
    expect(totalGuests(detail)).toBe(6)
  })
})

describe("validateLookupForm", () => {
  it("accepts a valid reference + email and normalizes them", () => {
    const result = validateLookupForm({
      bookingReference: "  stay-202607-yyouq2 ",
      email: "  Nina.Vasile@example.com ",
    })
    expect(result.ok).toBe(true)
    expect(result.normalized).toEqual({
      bookingCode: "STAY-202607-YYOUQ2",
      email: "Nina.Vasile@example.com",
    })
  })

  it("flags a missing reference", () => {
    const result = validateLookupForm({ bookingReference: "   ", email: "a@b.co" })
    expect(result.ok).toBe(false)
    expect(result.errors.bookingReference).toBe("required")
  })

  it("flags a missing email", () => {
    const result = validateLookupForm({ bookingReference: "STAY-1", email: "" })
    expect(result.ok).toBe(false)
    expect(result.errors.email).toBe("required")
  })

  it("flags a malformed email", () => {
    const result = validateLookupForm({ bookingReference: "STAY-1", email: "not-an-email" })
    expect(result.ok).toBe(false)
    expect(result.errors.email).toBe("invalid")
  })
})

describe("buildStayIcs", () => {
  const now = new Date("2026-07-01T09:30:00.000Z")

  it("emits an all-day VEVENT spanning check-in to check-out", () => {
    const ics = buildStayIcs(makeDetail(), now)
    expect(ics).not.toBeNull()
    const text = ics as string
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true)
    expect(text).toContain("BEGIN:VEVENT")
    expect(text).toContain("UID:book_1@acme-hotels")
    expect(text).toContain("DTSTAMP:20260701T093000Z")
    expect(text).toContain("DTSTART;VALUE=DATE:20260704")
    expect(text).toContain("DTEND;VALUE=DATE:20260706")
    expect(text).toContain("SUMMARY:Stay at Acme Grand Hotel")
    expect(text).toContain("LOCATION:Calea Victoriei 12\\, Bucharest\\, RO")
    expect(text).toContain("Booking reference: STAY-202607-YYOUQ2")
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true)
  })

  it("falls back to booking-level dates when the room has none", () => {
    const ics = buildStayIcs(makeDetail({ rooms: [] }), now)
    expect(ics).toContain("DTSTART;VALUE=DATE:20260704")
    expect(ics).toContain("DTEND;VALUE=DATE:20260706")
  })

  it("returns null when no date window is resolvable", () => {
    const ics = buildStayIcs(makeDetail({ rooms: [], startDate: null, endDate: null }), now)
    expect(ics).toBeNull()
  })
})
