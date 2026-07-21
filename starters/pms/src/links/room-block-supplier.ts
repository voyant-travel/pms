import { roomBlockLinkable } from "@voyant-travel/accommodations/linkables"
import { defineLink } from "@voyant-travel/core"
import { supplierLinkable } from "@voyant-travel/distribution/suppliers/linkables"

/**
 * Each room block is negotiated with one supplier; a supplier can back many
 * blocks. See RFC voyant#1489.
 */
export default defineLink(supplierLinkable, {
  linkable: roomBlockLinkable,
  isList: true,
})
