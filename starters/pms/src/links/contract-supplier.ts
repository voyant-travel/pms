import { defineLink } from "@voyant-travel/core"
import { supplierLinkable } from "@voyant-travel/distribution/suppliers/linkables"
import { contractLinkable } from "@voyant-travel/legal/linkables"

/**
 * A supplier can hold many contracts (supplier agreements, addenda); each
 * contract names at most one supplier. Replaces the former hard
 * `contracts.supplier_id → suppliers.id` cross-package FK (module decoupling:
 * links, not FKs).
 */
export default defineLink(
  { linkable: contractLinkable, isList: true },
  supplierLinkable,
)
