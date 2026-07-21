import { defineLink } from "@voyant-travel/core"
import { contractLinkable } from "@voyant-travel/legal/linkables"
import { personLinkable } from "@voyant-travel/relationships/linkables"

/**
 * A person (customer) can hold many contracts; each contract names at most one
 * person. Replaces the former hard `contracts.person_id → people.id` /
 * `contract_signatures.person_id → people.id` cross-package FKs — module
 * decoupling models cross-module associations as links, not cross-package FKs.
 * The `person_id` columns remain on the legal tables; this link materializes the
 * association for cross-module queries.
 */
export default defineLink(
  { linkable: contractLinkable, isList: true },
  personLinkable,
)
