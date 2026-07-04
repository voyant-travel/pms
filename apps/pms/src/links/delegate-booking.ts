import { bookingLinkable } from "@voyant-travel/bookings/linkables"
import { defineLink } from "@voyant-travel/core"
import { delegateLinkable } from "@voyant-travel/mice/linkables"

/**
 * A delegate's confirmation maps to one booking; one booking ↔ one delegate.
 * Backs the loose `mice_program_delegates.booking_id`. RFC voyant#1489.
 */
export const delegateBookingLink = defineLink(bookingLinkable, {
  linkable: delegateLinkable,
})
