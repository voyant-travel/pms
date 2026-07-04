import { defineLink } from "@voyant-travel/core"
import { programLinkable } from "@voyant-travel/mice/linkables"
import { spaceBlockLinkable } from "@voyant-travel/operations/places/linkables"

/**
 * A MICE program holds many space blocks (held function-space inventory);
 * each block belongs to at most one program. Backs the loose
 * `space_blocks.program_id` column. See RFC voyant#1489 (Phase 2).
 */
export const programSpaceBlockLink = defineLink(programLinkable, {
  linkable: spaceBlockLinkable,
  isList: true,
})
