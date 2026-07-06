/**
 * Front-desk "New reservation" backend (hotel-native reservation creation).
 *
 * Reuses the battle-tested owned-stay engine rather than reinventing availability
 * or pricing:
 *   - availability + per-night pricing + occupancy fit come from `quoteOwnedStay`
 *     (@voyant-travel/accommodations), the SAME quote the channels OTA ingest and
 *     the catalog booking engine use. The availability endpoint fans that quote
 *     out over the property's room types × attached rate plans (mirroring
 *     `searchOwnedStays`' room→plan mapping) and reshapes it into a desk-facing
 *     grid with names.
 *   - the write goes through the injected `persistStayBooking` seam (the single
 *     owned-stay transaction), so this package never imports app code — the
 *     deployment passes the write path in via `createFrontDeskModule`, exactly as
 *     it does for `createChannelsModule`.
 *
 * The pure `assembleAvailability` / `fitsPartyOccupancy` helpers are unit-tested
 * without a db; the db functions just load rows and delegate.
 */

import type { AccommodationCommitBridgeInput } from "@voyant-travel/accommodations/booking-engine"
import { ratePlanRoomTypes, ratePlans, roomTypes } from "@voyant-travel/accommodations/schema"
import {
  type OwnedStayQuoteResult,
  quoteOwnedStay,
} from "@voyant-travel/accommodations/service-owned-stays"
import { RequestValidationError } from "@voyant-travel/hono"
import { and, asc, eq, inArray } from "drizzle-orm"
import type { FrontDeskDb } from "./db.js"
import type { AvailabilityRequest, CreateReservationInput } from "./validation.js"

// --- injected write seam -----------------------------------------------------

/** Result shape returned by the injected {@link PersistStayBookingFn}. */
export interface PersistStayBookingResult {
  status: "ok" | "failed"
  bookingId?: string
  bookingNumber?: string
  reason?: string
}

/**
 * The single accommodation-booking write path, injected by the deployment (the
 * transaction that inserts bookings + travelers + booking_items +
 * stay_booking_items + stay_daily_rates). Kept app-side so this package never
 * imports the deployment's persistence wiring — see `createChannelsModule` for
 * the same inversion.
 */
export type PersistStayBookingFn = (
  db: FrontDeskDb,
  input: AccommodationCommitBridgeInput,
  opts?: { userId?: string },
) => Promise<PersistStayBookingResult>

/** Deployment-injected dependencies for the front-desk reservation routes. */
export interface FrontDeskModuleDeps {
  persistStayBooking: PersistStayBookingFn
}

// --- availability response shapes --------------------------------------------

export interface ReservationNightlyRate {
  date: string
  amountCents: number
}

export interface ReservationRatePlanOffer {
  ratePlanId: string
  ratePlanName: string
  /** This room type × rate plan has enough remaining rooms for the request. */
  available: boolean
  currency: string
  totalAmountCents: number
  nightly: ReservationNightlyRate[]
}

export interface ReservationRoomTypeAvailability {
  roomTypeId: string
  roomTypeName: string
  maxOccupancy: number | null
  /** Fewest remaining rooms across the stay's nights (inventory − reserved). */
  remaining: number
  /** `remaining >= rooms` requested. */
  available: boolean
  ratePlans: ReservationRatePlanOffer[]
}

export interface ReservationAvailability {
  propertyId: string
  checkIn: string
  checkOut: string
  nights: number
  occupancy: { adults: number; children: number; rooms: number }
  currency: string | null
  roomTypes: ReservationRoomTypeAvailability[]
}

export interface CreateReservationResult {
  bookingId: string
  bookingNumber: string | null
  propertyId: string
  roomTypeId: string
  ratePlanId: string
  checkIn: string
  checkOut: string
  roomCount: number
  currency: string
  totalAmountCents: number
}

// --- pure helpers (unit-tested) ----------------------------------------------

export interface OccupancyLimits {
  maxAdults?: number | null
  maxChildren?: number | null
  maxOccupancy?: number | null
}

export interface PartyOccupancy {
  adults: number
  children: number
}

/**
 * A room type fits the party when none of its declared caps is exceeded. A null
 * cap means "not constrained on that axis". Mirrors the occupancy fit inside
 * `quoteOwnedStay`, applied up-front so occupancy-too-large room types are
 * dropped from the grid entirely.
 */
export function fitsPartyOccupancy(room: OccupancyLimits, party: PartyOccupancy): boolean {
  const total = party.adults + party.children
  if (room.maxAdults != null && party.adults > room.maxAdults) return false
  if (room.maxChildren != null && party.children > room.maxChildren) return false
  if (room.maxOccupancy != null && total > room.maxOccupancy) return false
  return true
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00.000Z`)
  const end = Date.parse(`${checkOut}T00:00:00.000Z`)
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0
  return Math.round((end - start) / 86_400_000)
}

export interface RoomTypeMeta {
  id: string
  name: string
  maxOccupancy: number | null
}

/** One fanned-out quote for a room type × rate plan pair. */
export interface AvailabilityOffer {
  roomTypeId: string
  ratePlanId: string
  ratePlanName: string
  quote: OwnedStayQuoteResult
}

export interface AssembleAvailabilityInput {
  propertyId: string
  checkIn: string
  checkOut: string
  rooms: number
  party: { adults: number; children: number }
}

/**
 * Reshape the fanned-out quotes into the desk grid: one entry per eligible room
 * type (occupancy already filtered by the caller), each carrying its remaining
 * count and the priced rate-plan offers. Only `ok`-status quotes contribute a
 * rate-plan offer (a missing rate / inventory row means the plan isn't sellable
 * for these dates and is silently dropped); a room type with no priced offer
 * still appears so the desk sees it exists but has no availability.
 */
export function assembleAvailability(
  input: AssembleAvailabilityInput,
  rooms: readonly RoomTypeMeta[],
  offers: readonly AvailabilityOffer[],
): ReservationAvailability {
  const offersByRoom = new Map<string, AvailabilityOffer[]>()
  for (const offer of offers) {
    const list = offersByRoom.get(offer.roomTypeId) ?? []
    list.push(offer)
    offersByRoom.set(offer.roomTypeId, list)
  }

  let currency: string | null = null

  const roomTypeAvailability: ReservationRoomTypeAvailability[] = rooms.map((room) => {
    const roomOffers = offersByRoom.get(room.id) ?? []
    let remaining = 0
    let remainingSeen = false
    const ratePlans: ReservationRatePlanOffer[] = []

    for (const offer of roomOffers) {
      if (offer.quote.status !== "ok") continue
      const quote = offer.quote
      currency ??= quote.currency
      // Inventory is keyed per room type, so remaining is identical across the
      // room's rate plans — take it from the first priced quote.
      if (!remainingSeen) {
        remaining = quote.availability.minimumRemainingRooms
        remainingSeen = true
      }
      ratePlans.push({
        ratePlanId: offer.ratePlanId,
        ratePlanName: offer.ratePlanName,
        available: quote.available,
        currency: quote.currency,
        totalAmountCents: quote.totalAmountCents,
        nightly: quote.nightlyRates.map((rate) => ({
          date: rate.date,
          amountCents: rate.totalAmountCents,
        })),
      })
    }

    return {
      roomTypeId: room.id,
      roomTypeName: room.name,
      maxOccupancy: room.maxOccupancy,
      remaining,
      available: remaining >= input.rooms,
      ratePlans,
    }
  })

  return {
    propertyId: input.propertyId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights: nightsBetween(input.checkIn, input.checkOut),
    occupancy: {
      adults: input.party.adults,
      children: input.party.children,
      rooms: input.rooms,
    },
    currency,
    roomTypes: roomTypeAvailability,
  }
}

// --- db-backed services ------------------------------------------------------

/**
 * Fan `quoteOwnedStay` out over the property's active room types × their attached
 * rate plans and assemble the grid. A rate plan with NO explicit room-type
 * mapping applies to every room in the property (the same convention
 * `searchOwnedStays` uses); an explicit mapping restricts it to the listed rooms.
 */
export async function getReservationAvailability(
  db: FrontDeskDb,
  input: AvailabilityRequest,
): Promise<ReservationAvailability> {
  const party = { adults: input.adults, children: input.children }
  const occupancy = { adults: input.adults, children: input.children, infants: 0 }

  const roomTypeRows = await db
    .select({
      id: roomTypes.id,
      name: roomTypes.name,
      maxAdults: roomTypes.maxAdults,
      maxChildren: roomTypes.maxChildren,
      maxOccupancy: roomTypes.maxOccupancy,
    })
    .from(roomTypes)
    .where(and(eq(roomTypes.propertyId, input.propertyId), eq(roomTypes.active, true)))
    .orderBy(asc(roomTypes.sortOrder), asc(roomTypes.name))

  const eligible = roomTypeRows.filter((room) => fitsPartyOccupancy(room, party))
  const base: AssembleAvailabilityInput = {
    propertyId: input.propertyId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    rooms: input.rooms,
    party,
  }
  if (eligible.length === 0) return assembleAvailability(base, [], [])

  const ratePlanRows = await db
    .select({ id: ratePlans.id, name: ratePlans.name })
    .from(ratePlans)
    .where(and(eq(ratePlans.propertyId, input.propertyId), eq(ratePlans.active, true)))
    .orderBy(asc(ratePlans.sortOrder), asc(ratePlans.name))
  if (ratePlanRows.length === 0) {
    return assembleAvailability(base, eligible.map(roomMeta), [])
  }

  const mappingRows = await db
    .select({ ratePlanId: ratePlanRoomTypes.ratePlanId, roomTypeId: ratePlanRoomTypes.roomTypeId })
    .from(ratePlanRoomTypes)
    .where(
      and(
        eq(ratePlanRoomTypes.active, true),
        inArray(
          ratePlanRoomTypes.ratePlanId,
          ratePlanRows.map((plan) => plan.id),
        ),
      ),
    )
  const mappedRoomsByPlan = new Map<string, Set<string>>()
  for (const row of mappingRows) {
    const set = mappedRoomsByPlan.get(row.ratePlanId) ?? new Set<string>()
    set.add(row.roomTypeId)
    mappedRoomsByPlan.set(row.ratePlanId, set)
  }

  const offers: AvailabilityOffer[] = []
  for (const room of eligible) {
    for (const plan of ratePlanRows) {
      const mapped = mappedRoomsByPlan.get(plan.id)
      if (mapped && !mapped.has(room.id)) continue
      const quote = await quoteOwnedStay(db, {
        roomTypeId: room.id,
        ratePlanId: plan.id,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        roomCount: input.rooms,
        occupancy,
      })
      offers.push({ roomTypeId: room.id, ratePlanId: plan.id, ratePlanName: plan.name, quote })
    }
  }

  return assembleAvailability(base, eligible.map(roomMeta), offers)
}

function roomMeta(room: { id: string; name: string; maxOccupancy: number | null }): RoomTypeMeta {
  return { id: room.id, name: room.name, maxOccupancy: room.maxOccupancy }
}

/**
 * Create an owned-stay reservation. Re-quotes the picked room type × rate plan
 * (authoritative availability + per-night rates), then persists through the
 * injected write path — the same two-step (`quoteOwnedStay` → `persistStayBooking`)
 * the channels ingest performs, so a desk reservation is indistinguishable from
 * an OTA one downstream except for its booking `source`.
 */
export async function createReservation(
  db: FrontDeskDb,
  input: CreateReservationInput,
  deps: FrontDeskModuleDeps,
  userId?: string,
): Promise<CreateReservationResult> {
  if (input.selections.length !== 1) {
    throw new RequestValidationError("A reservation books one room type at a time.")
  }
  const selection = input.selections[0]
  if (!selection) throw new RequestValidationError("A room type and rate plan are required.")

  const quote = await quoteOwnedStay(db, {
    roomTypeId: selection.roomTypeId,
    ratePlanId: selection.ratePlanId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    roomCount: selection.quantity,
    occupancy: input.occupancy,
  })

  if (quote.status !== "ok") {
    throw new RequestValidationError(quoteFailureMessage(quote))
  }
  if (quote.propertyId !== input.propertyId) {
    throw new RequestValidationError("The room type does not belong to this property.")
  }
  if (!quote.available) {
    throw new RequestValidationError(
      "Those dates are no longer available for the selected room. Try different dates.",
    )
  }

  const guest = input.guest
  const result = await deps.persistStayBooking(
    db,
    {
      propertyId: quote.propertyId,
      roomTypeId: selection.roomTypeId,
      ratePlanId: selection.ratePlanId,
      mealPlanId: quote.mealPlanId ?? null,
      checkInDate: input.checkIn,
      checkOutDate: input.checkOut,
      roomCount: quote.roomCount,
      adults: input.occupancy.adults,
      children: input.occupancy.children,
      infants: input.occupancy.infants,
      dailyRates: quote.nightlyRates.map((rate) => ({
        sellCurrency: rate.sellCurrency,
        sellAmountCents: rate.sellAmountCents,
        costCurrency: rate.costCurrency ?? null,
        costAmountCents: rate.costAmountCents ?? null,
      })),
      contact: {
        firstName: guest.firstName,
        lastName: guest.lastName,
        email: guest.email ?? null,
        phone: guest.phone ?? null,
      },
      passengers: [
        {
          firstName: guest.firstName,
          lastName: guest.lastName,
          email: guest.email ?? null,
          phone: guest.phone ?? null,
          isPrimary: true,
        },
      ],
      notes: input.notes ?? null,
    },
    { userId },
  )

  if (result.status !== "ok" || !result.bookingId) {
    throw new RequestValidationError(result.reason ?? "Could not create the reservation.")
  }

  return {
    bookingId: result.bookingId,
    bookingNumber: result.bookingNumber ?? null,
    propertyId: quote.propertyId,
    roomTypeId: selection.roomTypeId,
    ratePlanId: selection.ratePlanId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    roomCount: quote.roomCount,
    currency: quote.currency,
    totalAmountCents: quote.totalAmountCents,
  }
}

/** Map a non-`ok` quote status to a desk-friendly explanation. */
export function quoteFailureMessage(quote: OwnedStayQuoteResult): string {
  switch (quote.status) {
    case "invalid_range":
      return "Check-out must be after check-in."
    case "room_not_found":
      return "That room type is no longer available."
    case "rate_plan_not_found":
      return "That rate plan is no longer available."
    case "room_occupancy_exceeded":
      return "The party is too large for the selected room."
    case "rates_missing":
      return "No rate is loaded for one or more nights in the stay."
    case "inventory_missing":
      return "No availability is loaded for one or more nights in the stay."
    case "currency_mismatch":
      return "The rate currency does not match the request."
    default:
      return "The selected room could not be quoted."
  }
}
