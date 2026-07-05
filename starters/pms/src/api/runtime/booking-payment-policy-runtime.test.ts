import { describe, expect, it } from "vitest"
import {
  bookingPaymentPolicyCascade,
  readPolicySourceFromInternalNotes,
  resolveCategoryPolicy,
  resolveCategoryPolicyForEntity,
  resolveListingPolicy,
  resolveListingPolicyForEntity,
  resolveSupplierPolicy,
  resolveSupplierPolicyForEntity,
  stampPolicySourceOnBooking,
} from "./booking-payment-policy-runtime"

/**
 * The cascade ORCHESTRATION + source-marker protocol now live in
 * `@voyant-travel/finance` (`createPaymentPolicyCascade`) and are unit-tested
 * there. This file is thin deployment wiring: it injects this deployment's
 * vertical schema-walk readers into the finance factory. These tests only
 * assert the wiring surface stays stable — the function names importers depend
 * on are exported, and the composed cascade exposes the full resolver set.
 */
describe("booking-payment-policy-runtime wiring", () => {
  it("re-exports the finance source-marker helpers (importers depend on these names)", () => {
    expect(typeof stampPolicySourceOnBooking).toBe("function")
    expect(readPolicySourceFromInternalNotes("__payment_policy_source__:supplier")).toBe("supplier")
    expect(readPolicySourceFromInternalNotes("customer note")).toBeNull()
  })

  it("exposes the deployment's vertical schema-walk readers", () => {
    for (const reader of [
      resolveSupplierPolicy,
      resolveCategoryPolicy,
      resolveListingPolicy,
      resolveSupplierPolicyForEntity,
      resolveCategoryPolicyForEntity,
      resolveListingPolicyForEntity,
    ]) {
      expect(typeof reader).toBe("function")
    }
  })

  it("builds a finance cascade with the full resolver surface", () => {
    expect(typeof bookingPaymentPolicyCascade.resolveSupplierPolicy).toBe("function")
    expect(typeof bookingPaymentPolicyCascade.resolveListingPolicyForEntity).toBe("function")
    expect(typeof bookingPaymentPolicyCascade.stampPolicySourceOnBooking).toBe("function")
    expect(typeof bookingPaymentPolicyCascade.readPolicySourceFromInternalNotes).toBe("function")
  })
})
