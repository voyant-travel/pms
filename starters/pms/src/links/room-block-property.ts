import { roomBlockLinkable } from "@voyant-travel/accommodations/linkables"
import { defineLink } from "@voyant-travel/core"
import { propertyLinkable } from "@voyant-travel/operations/places/linkables"

/**
 * Each room block is held against one property; a property can back many
 * blocks. Replaces the loose `room_blocks.property_id` column with a link
 * pivot. See RFC voyant#1489.
 */
export default defineLink(propertyLinkable, {
  linkable: roomBlockLinkable,
  isList: true,
})
