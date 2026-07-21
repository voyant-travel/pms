import { defineLink } from "@voyant-travel/core"
import { inventoryProductCompatibilityLinkable as productLinkable } from "@voyant-travel/inventory/linkables"
import { organizationLinkable } from "@voyant-travel/relationships/linkables"

/**
 * Each product has one owning organization (the client); each organization can
 * own many products.
 *
 * Replaces the former `products.organization_id` column with a link pivot table.
 */
export default defineLink(organizationLinkable, {
  linkable: productLinkable,
  isList: true,
})
