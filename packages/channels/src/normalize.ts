/**
 * Pure normalization + idempotent-upsert decision logic for inbound channel
 * reservations. No db, no Hono — unit-tested in `normalize.test.ts`.
 *
 * The connector produces an {@link InboundReservation}; these helpers decide (a)
 * whether it is well-formed enough to record, (b) what ledger status it lands in,
 * and (c) whether a re-delivery should re-attempt ingest — the idempotency the
 * `pms_channel_reservations` unique (channel, channelReservationId) index enforces
 * at the storage layer.
 */

import type { InboundReservation } from "./connector.js"

export type ChannelReservationStatus = "received" | "ingested" | "failed" | "ignored"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export type ReservationValidation = { ok: true } | { ok: false; reason: string }

/** Structural checks a normalized reservation must pass before it is recorded. */
export function validateInboundReservation(r: InboundReservation): ReservationValidation {
  if (!r.channelReservationId?.trim()) return { ok: false, reason: "missing channelReservationId" }
  if (!r.roomTypeRef?.trim()) return { ok: false, reason: "missing roomTypeRef" }
  if (!ISO_DATE.test(r.checkIn)) return { ok: false, reason: "checkIn must be YYYY-MM-DD" }
  if (!ISO_DATE.test(r.checkOut)) return { ok: false, reason: "checkOut must be YYYY-MM-DD" }
  if (r.checkOut <= r.checkIn) return { ok: false, reason: "checkOut must be after checkIn" }
  if (r.currency.length !== 3) return { ok: false, reason: "currency must be a 3-letter code" }
  if (!(r.occupancy.adults >= 1)) return { ok: false, reason: "occupancy.adults must be >= 1" }
  if (!r.guest.name?.trim()) return { ok: false, reason: "missing guest name" }
  return { ok: true }
}

/**
 * The ledger status a fresh delivery lands in, given any existing row:
 *   - a `cancelled` inbound reservation is `ignored` (this skeleton does not yet
 *     cancel the mirrored booking — a documented follow-up);
 *   - an already-`ingested` row keeps `ingested` (re-delivery never un-books);
 *   - otherwise `received` (awaiting ingest).
 */
export function initialLedgerStatus(
  existing: { status: ChannelReservationStatus } | null,
  incoming: InboundReservation,
): ChannelReservationStatus {
  if (existing?.status === "ingested") return "ingested"
  if (incoming.status === "cancelled") return "ignored"
  return "received"
}

/**
 * Whether the webhook path should attempt to create a booking now. Only
 * `confirmed` reservations book, and never twice for the same channel reservation
 * (an already-`ingested` row is a no-op). `modified` / `cancelled` are recorded
 * but not booked in this phase (follow-up).
 */
export function shouldAttemptIngest(
  existing: { status: ChannelReservationStatus } | null,
  incoming: InboundReservation,
): boolean {
  if (incoming.status !== "confirmed") return false
  if (existing?.status === "ingested") return false
  return true
}

/**
 * Split a guest's single `name` into first/last for the booking contact. Everything
 * before the last space is the first name; the remainder is the last name. A
 * single token becomes the last name with an empty first name.
 */
export function splitGuestName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim().replace(/\s+/g, " ")
  const lastSpace = trimmed.lastIndexOf(" ")
  if (lastSpace === -1) return { firstName: "", lastName: trimmed }
  return { firstName: trimmed.slice(0, lastSpace), lastName: trimmed.slice(lastSpace + 1) }
}
