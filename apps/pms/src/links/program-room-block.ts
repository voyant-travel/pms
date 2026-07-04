import { roomBlockLinkable } from "@voyant-travel/accommodations/linkables"
import { defineLink } from "@voyant-travel/core"
import { programLinkable } from "@voyant-travel/mice/linkables"

/**
 * A MICE program holds many room blocks; each block belongs to at most one
 * program (a block can also pre-date any program — `programId` is nullable).
 * See RFC voyant#1489.
 */
export const programRoomBlockLink = defineLink(programLinkable, {
  linkable: roomBlockLinkable,
  isList: true,
})
