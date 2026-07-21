import { defineLink } from "@voyant-travel/core"
import { contractLinkable } from "@voyant-travel/legal/linkables"
import { organizationLinkable } from "@voyant-travel/relationships/linkables"

/**
 * An organization can hold many contracts; each contract names at most one
 * organization. Replaces the former hard `contracts.organization_id →
 * organizations.id` cross-package FK (module decoupling: links, not FKs).
 */
export default defineLink(
  { linkable: contractLinkable, isList: true },
  organizationLinkable,
)
