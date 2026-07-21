import { bookingLinkable } from "@voyant-travel/bookings/linkables"
import { defineLink } from "@voyant-travel/core"
import { policyAcceptanceLinkable } from "@voyant-travel/legal/linkables"

/**
 * A booking can have many policy acceptances (one per policy kind accepted
 * at checkout); each acceptance attaches to at most one booking.
 */
export default defineLink(
  { linkable: policyAcceptanceLinkable, isList: true },
  bookingLinkable,
)
