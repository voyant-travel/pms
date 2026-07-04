import { defineLink } from "@voyant-travel/core"
import { supplierLinkable } from "@voyant-travel/distribution/suppliers/linkables"
import { bidLinkable } from "@voyant-travel/mice/linkables"

/**
 * Each MICE bid comes from one supplier; a supplier submits many bids. Backs
 * the loose `mice_bids.supplier_id`. See RFC voyant#1489 (Phase 4).
 */
export const bidSupplierLink = defineLink(supplierLinkable, {
  linkable: bidLinkable,
  isList: true,
})
