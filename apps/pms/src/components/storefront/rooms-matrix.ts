import type {
  AccommodationContent,
  AccommodationRatePlan,
  AccommodationRoomType,
} from "@voyant-travel/accommodations/content-shape"

/**
 * Rooms × rate-plans view-model for the property detail page.
 *
 * The accommodation content aggregate carries `room_types[]` and
 * `rate_plans[]` separately; a rate plan applies to a room type when
 * its `applies_to_room_type_ids` is empty (applies to all) or contains
 * the room id. This module centralizes that fan-out so both the room
 * picker and the booking.com-style rooms table read the same matrix,
 * and so the (otherwise inline, untested) filter has coverage.
 *
 * Live per-night pricing is intentionally absent here — it flows
 * through the booking quote (`useBookingQuote`) keyed on the selected
 * (room, rate) pair. The matrix is the static shape; price is layered
 * on at render time from the quote.
 */

export interface RoomMatrixRow {
  room: AccommodationRoomType
  ratePlans: ReadonlyArray<AccommodationRatePlan>
}

/** Rate plans applicable to a single room type, in content order. */
export function ratePlansForRoom(
  content: Pick<AccommodationContent, "rate_plans">,
  roomTypeId: string,
): ReadonlyArray<AccommodationRatePlan> {
  return content.rate_plans.filter(
    (rp) =>
      !rp.applies_to_room_type_ids ||
      rp.applies_to_room_type_ids.length === 0 ||
      rp.applies_to_room_type_ids.includes(roomTypeId),
  )
}

/** One row per room type, each with its applicable rate plans. */
export function buildRoomsMatrix(
  content: Pick<AccommodationContent, "room_types" | "rate_plans">,
): RoomMatrixRow[] {
  return content.room_types.map((room) => ({
    room,
    ratePlans: ratePlansForRoom(content, room.id),
  }))
}

/**
 * First selectable (room, rate) pair — used to seed the detail page so
 * the sidebar quote fires immediately. Returns `null` when no room has
 * any applicable rate plan.
 */
export function firstSelectablePair(
  content: Pick<AccommodationContent, "room_types" | "rate_plans">,
): { roomTypeId: string; ratePlanId: string } | null {
  for (const row of buildRoomsMatrix(content)) {
    const rate = row.ratePlans[0]
    if (rate) return { roomTypeId: row.room.id, ratePlanId: rate.id }
  }
  return null
}
