/**
 * Enum option lists for the ARI authoring forms. Kept as local const arrays
 * (rather than importing the zod schema values, which would evaluate the
 * module barrel and its server-only drizzle imports in the browser bundle);
 * each array is typed against the module's inferred input field so a drift in
 * the backend enum surfaces here as a type error.
 */

import type { InsertRatePlanInput, InsertRoomTypeInput } from "@voyant-travel/pms-ari"

interface Option<T extends string> {
  value: T
  label: string
}

type InventoryMode = NonNullable<InsertRoomTypeInput["inventoryMode"]>
type ChargeFrequency = NonNullable<InsertRatePlanInput["chargeFrequency"]>
type GuaranteeMode = NonNullable<InsertRatePlanInput["guaranteeMode"]>

/**
 * Enum → hotel-language label maps. Keyed as full `Record`s so a new backend
 * enum member fails typecheck here until it is given a human label (see
 * `ari-constants.test.ts` for the runtime exhaustiveness assertion). The
 * `*_OPTIONS` arrays below are derived for the select components.
 */
export const INVENTORY_MODE_LABELS: Record<InventoryMode, string> = {
  pooled: "Room pool (set capacity by hand)",
  serialized: "Numbered rooms (capacity from units)",
  virtual: "Virtual room (derived)",
}

export const CHARGE_FREQUENCY_LABELS: Record<ChargeFrequency, string> = {
  per_night: "Per night",
  per_stay: "Per stay",
  per_person_per_night: "Per person, per night",
  per_person_per_stay: "Per person, per stay",
}

export const GUARANTEE_MODE_LABELS: Record<GuaranteeMode, string> = {
  none: "None",
  card_hold: "Card hold",
  deposit: "Deposit",
  full_prepay: "Full prepay",
  on_request: "On request",
}

function toOptions<T extends string>(labels: Record<T, string>): Option<T>[] {
  return (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }))
}

export const INVENTORY_MODE_OPTIONS: Option<InventoryMode>[] = toOptions(INVENTORY_MODE_LABELS)
export const CHARGE_FREQUENCY_OPTIONS: Option<ChargeFrequency>[] =
  toOptions(CHARGE_FREQUENCY_LABELS)
export const GUARANTEE_MODE_OPTIONS: Option<GuaranteeMode>[] = toOptions(GUARANTEE_MODE_LABELS)

/** Common ISO-4217 currencies offered in the rate-plan form (free entry too). */
export const CURRENCY_OPTIONS = ["EUR", "USD", "GBP", "RON", "CHF"] as const
