import { bookingItems } from "@voyant-travel/bookings/schema"
import { bookingItemTaxLines } from "@voyant-travel/finance"
import { asc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export async function persistBookingCreateTaxLines(
  db: PostgresJsDatabase,
  bookingId: string,
  taxLines:
    | Array<{
        code?: string | null
        name: string
        jurisdiction?: string | null
        scope?: "included" | "excluded" | "withheld"
        currency: string
        amountCents: number
        rateBasisPoints?: number | null
        includedInPrice?: boolean
        remittanceParty?: string | null
        sortOrder?: number
      }>
    | undefined,
) {
  if (!taxLines?.length) return
  const items = await db
    .select({
      id: bookingItems.id,
      totalSellAmountCents: bookingItems.totalSellAmountCents,
    })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, bookingId))
    .orderBy(asc(bookingItems.createdAt))
  if (!items.length) return

  const total = items.reduce((sum, item) => sum + (item.totalSellAmountCents ?? 0), 0)
  const rows = taxLines.flatMap((taxLine) =>
    distributeTaxLine(taxLine.amountCents, items, total).map(({ itemId, amountCents }) => ({
      bookingItemId: itemId,
      code: taxLine.code ?? null,
      name: taxLine.name,
      jurisdiction: taxLine.jurisdiction ?? null,
      scope: taxLine.scope ?? (taxLine.includedInPrice ? "included" : "excluded"),
      currency: taxLine.currency,
      amountCents,
      rateBasisPoints: taxLine.rateBasisPoints ?? null,
      includedInPrice: taxLine.includedInPrice ?? taxLine.scope === "included",
      remittanceParty: taxLine.remittanceParty ?? null,
      sortOrder: taxLine.sortOrder ?? 0,
    })),
  )
  if (rows.length) await db.insert(bookingItemTaxLines).values(rows)
}

function distributeTaxLine(
  amountCents: number,
  items: Array<{ id: string; totalSellAmountCents: number | null }>,
  totalCents: number,
) {
  if (items.length === 1 || totalCents <= 0) {
    return [{ itemId: items[0]!.id, amountCents }]
  }
  let remaining = amountCents
  return items.map((item, index) => {
    const isLast = index === items.length - 1
    const allocated = isLast
      ? remaining
      : Math.round(amountCents * ((item.totalSellAmountCents ?? 0) / totalCents))
    remaining -= allocated
    return { itemId: item.id, amountCents: allocated }
  })
}

/**
 * Map an `optionUnits` row to one of the booking-engine's pax-band
 * codes. Operators don't tag units with explicit categories; the
 * mapping is derived from age windows. Heuristic:
 *
 *   - non-person units → null (rooms / vehicles / services don't
 *     participate in per-pax pricing)
 *   - `maxAge ≤ 1` → `infant`
 *   - `maxAge ≤ 17` → `child` (covers operators who tag teens as
 *     "Child 6-12" or similar — the booking engine still treats them
 *     as the child band)
 *   - otherwise → `adult`
 *
 * `senior` requires an explicit pax band, which the default
 * `DEFAULT_PAX_BANDS` does not include — operators that need it
 * extend the bands per product.
 */
export function deriveTravelerCategory(unit: {
  unitType: string
  minAge: number | null
  maxAge: number | null
}): "adult" | "child" | "infant" | "senior" | null {
  if (unit.unitType !== "person") return null
  if (unit.maxAge !== null && unit.maxAge <= 1) return "infant"
  if (unit.maxAge !== null && unit.maxAge <= 17) return "child"
  return "adult"
}

export function humanizeFieldKey(key: string): string {
  switch (key) {
    case "first_name":
      return "First name"
    case "last_name":
      return "Last name"
    case "date_of_birth":
      return "Date of birth"
    case "passport_number":
      return "Passport number"
    case "passport_expiry":
      return "Passport expiry"
    case "dietary_requirements":
      return "Dietary requirements"
    case "accessibility_needs":
      return "Accessibility needs"
    case "special_requests":
      return "Special requests"
    default:
      return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  }
}

export function typeForFieldKey(key: string): string {
  switch (key) {
    case "date_of_birth":
    case "passport_expiry":
      return "date"
    case "email":
      return "email"
    case "phone":
      return "phone"
    case "address":
      return "text"
    default:
      return "text"
  }
}
