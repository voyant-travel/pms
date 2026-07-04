import { roomBlockLinkable } from "@voyant-travel/accommodations/linkables"
import { defineLink } from "@voyant-travel/core"
import { roomingAssignmentLinkable } from "@voyant-travel/mice/linkables"

/**
 * A rooming assignment draws from a room block; a block backs many assignments.
 * Backs the loose `mice_rooming_assignments.room_block_id`. RFC voyant#1489.
 */
export const roomingRoomBlockLink = defineLink(roomBlockLinkable, {
  linkable: roomingAssignmentLinkable,
  isList: true,
})
