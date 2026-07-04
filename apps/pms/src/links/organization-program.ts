import { defineLink } from "@voyant-travel/core"
import { programLinkable } from "@voyant-travel/mice/linkables"
import { organizationLinkable } from "@voyant-travel/relationships/linkables"

/**
 * The buyer org behind a MICE program. One organization runs many programs;
 * each program has one buyer org. See RFC voyant#1489.
 */
export const organizationProgramLink = defineLink(organizationLinkable, {
  linkable: programLinkable,
  isList: true,
})
