import { defineLink } from "@voyant-travel/core"
import { programLinkable } from "@voyant-travel/mice/linkables"
import { quoteLinkable } from "@voyant-travel/quotes/linkables"

/**
 * A MICE program proposal is a quote (the deal primitive); accepting it drives
 * the program. One quote ↔ one program. See RFC voyant#1489.
 */
export const quoteProgramLink = defineLink(quoteLinkable, {
  linkable: programLinkable,
})
