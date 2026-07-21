import { defineLink } from "@voyant-travel/core"
import { invoiceLinkable } from "@voyant-travel/finance/linkables"
import { contractLinkable } from "@voyant-travel/legal/linkables"

/**
 * A contract can be referenced by many invoices (e.g. a retainer contract
 * backs several billing invoices over the engagement).
 */
export default defineLink(contractLinkable, {
  linkable: invoiceLinkable,
  isList: true,
})
