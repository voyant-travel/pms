import { describe, expect, it } from "vitest"

import { createMockConnector } from "./mock-connector"

const payload = {
  reservationId: "MOCK-1001",
  propertyId: "prop_1",
  roomTypeId: "rmty_1",
  ratePlanId: "rtpl_1",
  checkIn: "2026-08-01",
  checkOut: "2026-08-03",
  occupancy: { adults: 2, children: 1 },
  guest: { name: "Jane Doe", email: "jane@example.com", phone: "+40100" },
  totalAmountCents: 24000,
  currency: "EUR",
  status: "confirmed",
}

describe("mock connector — pushAri", () => {
  it("records each pushed delta and returns a pushed result with a ref", async () => {
    const c = createMockConnector()
    const result = await c.pushAri({
      propertyId: "prop_1",
      roomTypeId: "rmty_1",
      dates: [{ date: "2026-08-01" }],
    })
    expect(result.status).toBe("pushed")
    expect(result.ref).toBe("mock-1")
    expect(c.pushes).toHaveLength(1)
    expect(c.pushes[0]?.roomTypeId).toBe("rmty_1")
  })

  it("can be configured to skip or fail (retry-path fixtures)", async () => {
    expect(
      (
        await createMockConnector({ pushOutcome: "skipped" }).pushAri({
          propertyId: "p",
          roomTypeId: "r",
          dates: [],
        })
      ).status,
    ).toBe("skipped")
    expect(
      (
        await createMockConnector({ pushOutcome: "failed" }).pushAri({
          propertyId: "p",
          roomTypeId: "r",
          dates: [],
        })
      ).status,
    ).toBe("failed")
  })

  it("reset clears recorded pushes", async () => {
    const c = createMockConnector()
    await c.pushAri({ propertyId: "p", roomTypeId: "r", dates: [] })
    c.reset()
    expect(c.pushes).toHaveLength(0)
  })
})

describe("mock connector — parseReservation round-trip", () => {
  it("normalizes the documented JSON shape into an InboundReservation", () => {
    const r = createMockConnector().parseReservation(payload)
    expect(r).not.toBeNull()
    expect(r).toMatchObject({
      channel: "mock",
      channelReservationId: "MOCK-1001",
      roomTypeRef: "rmty_1",
      ratePlanRef: "rtpl_1",
      checkIn: "2026-08-01",
      checkOut: "2026-08-03",
      occupancy: { adults: 2, children: 1, infants: 0 },
      guest: { name: "Jane Doe", email: "jane@example.com", phone: "+40100" },
      totalAmountCents: 24000,
      currency: "EUR",
      status: "confirmed",
    })
    expect(r?.raw).toBe(payload)
  })

  it("carries the connector's own name onto the reservation", () => {
    const r = createMockConnector({ name: "booking-com" }).parseReservation(payload)
    expect(r?.channel).toBe("booking-com")
  })

  it("defaults occupancy + currency + status when absent", () => {
    const r = createMockConnector().parseReservation({
      reservationId: "M-2",
      roomTypeId: "rmty_9",
      checkIn: "2026-09-01",
      checkOut: "2026-09-02",
      guest: { name: "Solo Traveler" },
    })
    expect(r).toMatchObject({
      occupancy: { adults: 1, children: 0, infants: 0 },
      currency: "EUR",
      status: "confirmed",
      ratePlanRef: undefined,
    })
  })

  it("returns null for a non-object payload", () => {
    expect(createMockConnector().parseReservation("nope")).toBeNull()
    expect(createMockConnector().parseReservation(null)).toBeNull()
  })

  it("returns null when required fields are missing (→ ignored)", () => {
    expect(createMockConnector().parseReservation({ reservationId: "M-3" })).toBeNull()
    expect(createMockConnector().parseReservation({ ...payload, guest: {} })).toBeNull()
  })

  it("falls back to confirmed for an unknown status", () => {
    const r = createMockConnector().parseReservation({ ...payload, status: "weird" })
    expect(r?.status).toBe("confirmed")
  })

  it("preserves modified / cancelled statuses", () => {
    expect(
      createMockConnector().parseReservation({ ...payload, status: "cancelled" })?.status,
    ).toBe("cancelled")
    expect(createMockConnector().parseReservation({ ...payload, status: "modified" })?.status).toBe(
      "modified",
    )
  })

  it("verifyWebhook is present and returns true (no provider signature)", () => {
    expect(createMockConnector().verifyWebhook?.({ headers: {}, body: payload })).toBe(true)
  })
})
