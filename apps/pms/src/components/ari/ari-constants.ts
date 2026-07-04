/**
 * Enum option lists for the ARI authoring forms. Kept as local const arrays
 * (rather than importing the zod schema values, which would evaluate the
 * module barrel and its server-only drizzle imports in the browser bundle);
 * each array is typed against the module's inferred input field so a drift in
 * the backend enum surfaces here as a type error.
 */

import type { InsertRatePlanInput, InsertRoomTypeInput } from "../../modules/ari"

interface Option<T extends string> {
  value: T
  label: string
}

type InventoryMode = NonNullable<InsertRoomTypeInput["inventoryMode"]>
type ChargeFrequency = NonNullable<InsertRatePlanInput["chargeFrequency"]>
type GuaranteeMode = NonNullable<InsertRatePlanInput["guaranteeMode"]>

export const INVENTORY_MODE_OPTIONS: Option<InventoryMode>[] = [
  { value: "pooled", label: "Pooled" },
  { value: "serialized", label: "Serialized (per unit)" },
  { value: "virtual", label: "Virtual" },
]

export const CHARGE_FREQUENCY_OPTIONS: Option<ChargeFrequency>[] = [
  { value: "per_night", label: "Per night" },
  { value: "per_stay", label: "Per stay" },
  { value: "per_person_per_night", label: "Per person / night" },
  { value: "per_person_per_stay", label: "Per person / stay" },
]

export const GUARANTEE_MODE_OPTIONS: Option<GuaranteeMode>[] = [
  { value: "none", label: "None" },
  { value: "card_hold", label: "Card hold" },
  { value: "deposit", label: "Deposit" },
  { value: "full_prepay", label: "Full prepay" },
  { value: "on_request", label: "On request" },
]

/** Common ISO-4217 currencies offered in the rate-plan form (free entry too). */
export const CURRENCY_OPTIONS = ["EUR", "USD", "GBP", "RON", "CHF"] as const
