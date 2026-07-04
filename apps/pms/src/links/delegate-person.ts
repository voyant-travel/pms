import { defineLink } from "@voyant-travel/core"
import { delegateLinkable } from "@voyant-travel/mice/linkables"
import { personLinkable } from "@voyant-travel/relationships/linkables"

/**
 * A delegate is a person (CRM); a person can be a delegate across many
 * programs. Backs the loose `mice_program_delegates.person_id`. RFC voyant#1489.
 */
export const delegatePersonLink = defineLink(personLinkable, {
  linkable: delegateLinkable,
  isList: true,
})
