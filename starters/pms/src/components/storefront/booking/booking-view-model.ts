/**
 * Pure view-models for the guest post-booking surfaces (rich confirmation +
 * find-my-booking / manage). Kept framework-free and side-effect-free so the
 * status-timeline derivation, rate-breakdown shaping, and lookup-form
 * validation are unit-testable in isolation — mirroring the storefront's
 * other pure helpers (rate-plan-label, property-portfolio, stay-search).
 *
 * The `StayBookingDetail` shape mirrors the response of the template route
 * `GET /v1/public/stay-bookings/:bookingId` (see
 * `src/api/routes/stay-booking-detail.ts`). It is duplicated here rather than
 * imported so the client bundle never reaches into the server module graph.
 */

export interface StayNightlyRate {
  date: string
  amountCents: number | null
  currency: string
}

export interface StayRoomLine {
  stayItemId: string
  roomTypeName: string | null
  ratePlanName: string | null
  ratePlanRefundable: boolean | null
  mealPlanName: string | null
  checkInDate: string
  checkOutDate: string
  nightCount: number
  roomCount: number
  adults: number
  children: number
  infants: number
  confirmationCode: string | null
  currency: string
  nightly: StayNightlyRate[]
  subtotalCents: number | null
}

export interface StayBookingProperty {
  name: string | null
  checkInTime: string | null
  checkOutTime: string | null
  address: {
    line1: string | null
    line2: string | null
    city: string | null
    region: string | null
    postalCode: string | null
    country: string | null
    fullText: string | null
  }
}

export interface StayBookingTraveler {
  firstName: string
  lastName: string
  isPrimary: boolean
}

export interface StayBookingDetail {
  bookingId: string
  bookingNumber: string
  status: string
  currency: string
  totalCents: number | null
  startDate: string | null
  endDate: string | null
  pax: number | null
  confirmedAt: string | null
  cancelledAt: string | null
  completedAt: string | null
  property: StayBookingProperty
  rooms: StayRoomLine[]
  travelers: StayBookingTraveler[]
}

// ───────────────────────── Status timeline ─────────────────────────

/** Canonical guest-facing lifecycle steps, in display order. */
export type TimelineStepKey = "confirmed" | "upcoming" | "in_house" | "completed" | "cancelled"

export type TimelineStepState = "done" | "current" | "upcoming"

export interface TimelineStep {
  key: TimelineStepKey
  state: TimelineStepState
}

const HAPPY_PATH: readonly TimelineStepKey[] = ["confirmed", "upcoming", "in_house", "completed"]

/**
 * Resolve which happy-path phase a stay is in, from the booking status plus
 * today's date relative to the stay window. Dates are ISO `YYYY-MM-DD`, so
 * lexical comparison is chronological.
 */
function resolvePhase(
  status: string,
  checkInDate: string | null,
  checkOutDate: string | null,
  today: string,
): TimelineStepKey {
  if (status === "completed") return "completed"
  if (checkOutDate && today >= checkOutDate) return "completed"
  if (checkInDate && checkOutDate && today >= checkInDate && today < checkOutDate) return "in_house"
  if (checkInDate && today < checkInDate) return "upcoming"
  // Dates unknown, or checked-in with no checkout window — treat as freshly
  // confirmed rather than guessing.
  return "confirmed"
}

/**
 * Derive the ordered status timeline for a stay. Cancelled/expired bookings
 * short-circuit to a two-step "confirmed → cancelled" track; everything else
 * walks confirmed → upcoming → in-house → completed with the current phase
 * marked `current`, earlier phases `done`, later phases `upcoming`.
 */
export function deriveStayTimeline(input: {
  status: string
  checkInDate: string | null
  checkOutDate: string | null
  /** ISO `YYYY-MM-DD` — injected for testability. */
  today: string
}): TimelineStep[] {
  if (input.status === "cancelled" || input.status === "expired") {
    return [
      { key: "confirmed", state: "done" },
      { key: "cancelled", state: "current" },
    ]
  }

  const phase = resolvePhase(input.status, input.checkInDate, input.checkOutDate, input.today)
  const currentIdx = HAPPY_PATH.indexOf(phase)
  return HAPPY_PATH.map((key, index) => ({
    key,
    state: index < currentIdx ? "done" : index === currentIdx ? "current" : "upcoming",
  }))
}

// ───────────────────────── Rate breakdown ─────────────────────────

export interface RateBreakdownNight {
  date: string
  amountCents: number | null
}

export interface RateBreakdownRoom {
  stayItemId: string
  roomTypeName: string | null
  ratePlanName: string | null
  mealPlanName: string | null
  roomCount: number
  nights: RateBreakdownNight[]
  nightCount: number
  subtotalCents: number | null
}

export interface RateBreakdown {
  currency: string
  rooms: RateBreakdownRoom[]
  /** Sum of nightly amounts across all rooms, when nightly data is present. */
  nightlySubtotalCents: number | null
  /** Authoritative booking total (server sell amount), preferred for display. */
  totalCents: number | null
}

/**
 * Shape a `StayBookingDetail` into a display-ready rate breakdown: per-room
 * nightly rows plus subtotals, and the authoritative booking total. Falls
 * back to summing nightly amounts only when the booking total is absent.
 */
export function shapeRateBreakdown(detail: StayBookingDetail): RateBreakdown {
  const rooms: RateBreakdownRoom[] = detail.rooms.map((room) => ({
    stayItemId: room.stayItemId,
    roomTypeName: room.roomTypeName,
    ratePlanName: room.ratePlanName,
    mealPlanName: room.mealPlanName,
    roomCount: room.roomCount,
    nightCount: room.nightCount,
    nights: room.nightly.map((n) => ({ date: n.date, amountCents: n.amountCents })),
    subtotalCents: room.subtotalCents,
  }))

  const nightlyValues = detail.rooms
    .flatMap((room) => room.nightly.map((n) => n.amountCents))
    .filter((cents): cents is number => typeof cents === "number")
  const nightlySubtotalCents =
    nightlyValues.length > 0 ? nightlyValues.reduce((sum, cents) => sum + cents, 0) : null

  return {
    currency: detail.currency,
    rooms,
    nightlySubtotalCents,
    totalCents: detail.totalCents ?? nightlySubtotalCents,
  }
}

/** Total guest count across all room lines (adults + children + infants). */
export function totalGuests(detail: StayBookingDetail): number {
  return detail.rooms.reduce((sum, r) => sum + r.adults + r.children + r.infants, 0)
}

// ───────────────────────── Lookup form validation ─────────────────────────

export interface LookupFormValues {
  bookingReference: string
  email: string
}

export interface LookupFormErrors {
  bookingReference?: string
  email?: string
}

export interface LookupFormResult {
  ok: boolean
  errors: LookupFormErrors
  /** Present only when `ok` — normalized values ready for the guest-lookup call. */
  normalized?: { bookingCode: string; email: string }
}

// Pragmatic email shape check — the server is the real authority; this only
// keeps the guest from submitting an obviously-malformed address.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Validate + normalize the find-my-booking form. Booking reference is
 * required (trimmed, uppercased to match the seeded `STAY-…` scheme); email
 * must look like an address. Returns per-field errors when invalid.
 */
export function validateLookupForm(values: LookupFormValues): LookupFormResult {
  const errors: LookupFormErrors = {}
  const bookingCode = values.bookingReference.trim().toUpperCase()
  const email = values.email.trim()

  if (bookingCode.length === 0) {
    errors.bookingReference = "required"
  }
  if (email.length === 0) {
    errors.email = "required"
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "invalid"
  }

  const ok = Object.keys(errors).length === 0
  return ok ? { ok, errors, normalized: { bookingCode, email } } : { ok, errors }
}

// ───────────────────────── Add-to-calendar (ICS) ─────────────────────────

/** RFC 5545 TEXT escaping: backslash, comma, semicolon, and newlines. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

/** ISO `YYYY-MM-DD` → `YYYYMMDD` for an all-day (VALUE=DATE) property. */
function toIcsDate(iso: string): string {
  return iso.replace(/-/g, "")
}

/** UTC timestamp → `YYYYMMDDTHHMMSSZ` for DTSTAMP. */
function toIcsStamp(date: Date): string {
  return `${date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")}`
}

/**
 * Build an RFC 5545 iCalendar document for a stay as an all-day event
 * spanning check-in → check-out. Pure and dependency-free so it can be
 * generated client-side (Blob download) or unit-tested. Returns `null` when
 * the stay has no usable date window. `now` is injectable for deterministic
 * DTSTAMP output in tests.
 */
export function buildStayIcs(detail: StayBookingDetail, now: Date = new Date()): string | null {
  const firstRoom = detail.rooms[0]
  const checkIn = firstRoom?.checkInDate ?? detail.startDate
  const checkOut = firstRoom?.checkOutDate ?? detail.endDate
  if (!checkIn || !checkOut) return null

  const propertyName = detail.property.name ?? "Your stay"
  const summary = `Stay at ${propertyName}`
  const location = detail.property.address.fullText ?? propertyName
  const descriptionParts = [
    `Booking reference: ${detail.bookingNumber}`,
    firstRoom?.roomTypeName ? `Room: ${firstRoom.roomTypeName}` : null,
    detail.property.checkInTime ? `Check-in from ${detail.property.checkInTime}` : null,
    detail.property.checkOutTime ? `Check-out by ${detail.property.checkOutTime}` : null,
  ].filter((part): part is string => Boolean(part))

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Acme Hotels//Storefront//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${detail.bookingId}@acme-hotels`,
    `DTSTAMP:${toIcsStamp(now)}`,
    `DTSTART;VALUE=DATE:${toIcsDate(checkIn)}`,
    `DTEND;VALUE=DATE:${toIcsDate(checkOut)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(descriptionParts.join("\n"))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]

  // ICS lines are CRLF-terminated per RFC 5545.
  return `${lines.join("\r\n")}\r\n`
}
