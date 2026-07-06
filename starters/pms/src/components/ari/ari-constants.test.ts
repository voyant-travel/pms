import { describe, expect, it } from "vitest"
import {
  CHARGE_FREQUENCY_LABELS,
  GUARANTEE_MODE_LABELS,
  INVENTORY_MODE_LABELS,
} from "./ari-constants"

/**
 * Runtime guard rails for the enum → label maps. The `Record<Enum, string>`
 * typing already forces a compile error when the backend adds an enum member
 * without a label; these tests additionally pin the expected members (so a
 * silently-dropped key fails) and assert every label is human copy, not the raw
 * enum token that a non-technical hotel manager should never see.
 */
const RAW_TOKEN = /_|^[a-z]+$/ // snake_case or a bare lowercase enum word

describe("ARI enum label maps", () => {
  it("covers exactly the known inventory modes", () => {
    expect(Object.keys(INVENTORY_MODE_LABELS).sort()).toEqual(
      ["pooled", "serialized", "virtual"].sort(),
    )
  })

  it("covers exactly the known charge frequencies", () => {
    expect(Object.keys(CHARGE_FREQUENCY_LABELS).sort()).toEqual(
      ["per_night", "per_person_per_night", "per_person_per_stay", "per_stay"].sort(),
    )
  })

  it("covers exactly the known guarantee modes", () => {
    expect(Object.keys(GUARANTEE_MODE_LABELS).sort()).toEqual(
      ["card_hold", "deposit", "full_prepay", "none", "on_request"].sort(),
    )
  })

  it("gives every enum a human label that is not the raw token", () => {
    for (const labels of [INVENTORY_MODE_LABELS, CHARGE_FREQUENCY_LABELS, GUARANTEE_MODE_LABELS]) {
      for (const [value, label] of Object.entries(labels)) {
        expect(label.length).toBeGreaterThan(0)
        // The label must not be the bare enum token (e.g. "per_night" / "pooled").
        expect(label === value).toBe(false)
        expect(RAW_TOKEN.test(label)).toBe(false)
      }
    }
  })
})
