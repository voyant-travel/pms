/**
 * The reference `mock` channel connector (PLAN §4.7). It is the seam's test
 * vehicle: outbound pushes are RECORDED IN MEMORY (per isolate) instead of hitting
 * a real OTA, and inbound reservations are parsed from a documented JSON shape.
 * Ship this — not a live Booking.com integration — for the skeleton phase.
 *
 * Documented inbound payload (`parseReservation` input):
 *
 *   {
 *     "reservationId": "MOCK-1001",        // required — the channel's own id
 *     "propertyId":    "prop_...",         // optional
 *     "roomTypeId":    "rmty_...",         // required — PMS room type id
 *     "ratePlanId":    "rtpl_...",         // optional (required for ingest to book)
 *     "checkIn":       "2026-08-01",       // YYYY-MM-DD
 *     "checkOut":      "2026-08-03",       // YYYY-MM-DD
 *     "occupancy":     { "adults": 2, "children": 0, "infants": 0 },
 *     "guest":         { "name": "Jane Doe", "email": "j@x.com", "phone": "+40..." },
 *     "totalAmountCents": 24000,           // optional
 *     "currency":      "EUR",
 *     "status":        "confirmed"         // confirmed | modified | cancelled
 *   }
 *
 * A payload that is not an object, or is missing `reservationId` / `roomTypeId` /
 * `guest.name`, parses to `null` → the reservation is recorded `ignored`.
 */

import type { AriDelta, ChannelConnector, InboundReservation, PushResult } from "./connector.js"

/** A mock connector plus in-memory push inspection for tests. */
export interface MockChannelConnector extends ChannelConnector {
  /** Every delta handed to `pushAri`, in order. */
  readonly pushes: readonly AriDelta[]
  /** Clear the recorded pushes. */
  reset(): void
}

export interface MockConnectorOptions {
  name?: string
  /** Force a non-`pushed` outcome (to exercise retry/skip paths). Defaults to pushed. */
  pushOutcome?: PushResult["status"]
}

export function createMockConnector(options: MockConnectorOptions = {}): MockChannelConnector {
  const name = options.name ?? "mock"
  const outcome = options.pushOutcome ?? "pushed"
  const pushes: AriDelta[] = []

  return {
    name,
    pushes,
    reset() {
      pushes.length = 0
    },
    async pushAri(delta: AriDelta): Promise<PushResult> {
      pushes.push(delta)
      if (outcome === "pushed") return { status: "pushed", ref: `mock-${pushes.length}` }
      if (outcome === "skipped") return { status: "skipped", error: "mock skip" }
      return { status: "failed", error: "mock failure" }
    },
    // The mock does no provider-signature check; the route's shared-secret header
    // is the real gate. Present so the seam's optional hook is exercised.
    verifyWebhook() {
      return true
    },
    parseReservation(payload: unknown): InboundReservation | null {
      return parseMockReservation(name, payload)
    },
  }
}

const RESERVATION_STATUSES = new Set(["confirmed", "modified", "cancelled"])

function parseMockReservation(channel: string, payload: unknown): InboundReservation | null {
  if (typeof payload !== "object" || payload === null) return null
  const p = payload as Record<string, unknown>

  const channelReservationId = asString(p.reservationId)
  const roomTypeRef = asString(p.roomTypeId)
  const checkIn = asString(p.checkIn)
  const checkOut = asString(p.checkOut)
  const currency = asString(p.currency) ?? "EUR"
  const guest = (p.guest ?? {}) as Record<string, unknown>
  const guestName = asString(guest.name)
  if (!channelReservationId || !roomTypeRef || !checkIn || !checkOut || !guestName) return null

  const occupancy = (p.occupancy ?? {}) as Record<string, unknown>
  const rawStatus = asString(p.status) ?? "confirmed"
  const status = RESERVATION_STATUSES.has(rawStatus)
    ? (rawStatus as InboundReservation["status"])
    : "confirmed"

  return {
    channel,
    channelReservationId,
    propertyId: asString(p.propertyId),
    roomTypeRef,
    ratePlanRef: asString(p.ratePlanId),
    checkIn,
    checkOut,
    occupancy: {
      adults: asNumber(occupancy.adults) ?? 1,
      children: asNumber(occupancy.children) ?? 0,
      infants: asNumber(occupancy.infants) ?? 0,
    },
    guest: {
      name: guestName,
      email: asString(guest.email),
      phone: asString(guest.phone),
    },
    totalAmountCents: asNumber(p.totalAmountCents),
    currency,
    status,
    raw: payload,
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
