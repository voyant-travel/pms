import { defineLink } from "@voyant-travel/core"
import { inventoryProductCompatibilityLinkable as productLinkable } from "@voyant-travel/inventory/linkables"
import { personLinkable } from "@voyant-travel/relationships/linkables"

/**
 * Each product has one owning person (the client); each person can own many products.
 *
 * Replaces the former `products.person_id` column with a link pivot table.
 */
export default defineLink(personLinkable, {
  linkable: productLinkable,
  isList: true,
})
