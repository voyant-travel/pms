import {
  bookingsUiMessageDefinitions,
  resolveBookingsUiMessages,
} from "@voyant-travel/bookings-react/i18n"
import { financeUiMessageDefinitions } from "@voyant-travel/finance-react/i18n"
import { operatorAdminMessageDefinitions } from "@voyant-travel/i18n"
import { legalUiMessageDefinitions } from "@voyant-travel/legal-react/i18n"
import { crmUiMessageDefinitions } from "@voyant-travel/relationships-react/i18n"
import { describe, expect, it } from "vitest"
import {
  bookingsReservationOverrides,
  financeReservationOverrides,
  legalReservationOverrides,
  mergeAdminMessageOverrides,
  navReservationOverrides,
  relationshipsReservationOverrides,
} from "./reservation-terminology"

type Overrides = {
  shared?: unknown
  locales?: Record<string, unknown> | null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Flatten an override tree into `["a.b.c", value]` leaf pairs. */
function leaves(node: unknown, prefix = ""): Array<[string, unknown]> {
  if (!isPlainObject(node)) return [[prefix, node]]
  return Object.entries(node).flatMap(([key, value]) =>
    leaves(value, prefix ? `${prefix}.${key}` : key),
  )
}

/** Resolve a dotted path against the package's `en` message catalog. */
function resolve(catalog: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!isPlainObject(acc)) return undefined
    return acc[key]
  }, catalog)
}

type Catalog = { en: Record<string, unknown> }

const cases: Array<{
  name: string
  overrides: Overrides
  definitions: Catalog
}> = [
  {
    name: "bookings-react",
    overrides: bookingsReservationOverrides as Overrides,
    definitions: bookingsUiMessageDefinitions as unknown as Catalog,
  },
  {
    name: "finance-react",
    overrides: financeReservationOverrides as Overrides,
    definitions: financeUiMessageDefinitions as unknown as Catalog,
  },
  {
    name: "relationships-react",
    overrides: relationshipsReservationOverrides as Overrides,
    definitions: crmUiMessageDefinitions as unknown as Catalog,
  },
  {
    name: "legal-react",
    overrides: legalReservationOverrides as Overrides,
    definitions: legalUiMessageDefinitions as unknown as Catalog,
  },
  {
    name: "operator-admin-nav",
    overrides: navReservationOverrides as Overrides,
    definitions: operatorAdminMessageDefinitions as unknown as Catalog,
  },
]

describe("reservation terminology overrides", () => {
  for (const { name, overrides, definitions } of cases) {
    describe(name, () => {
      const en = overrides.locales?.en

      it("only remaps the `en` locale (leaves `ro` native)", () => {
        // A `shared` override would stamp English over the native Romanian
        // "rezervare" catalog — the split must stay `en`-only.
        expect(overrides.shared).toBeUndefined()
        expect(Object.keys(overrides.locales ?? {})).toEqual(["en"])
      })

      const overridePairs = isPlainObject(en) ? leaves(en) : []

      it("has overrides", () => {
        expect(overridePairs.length).toBeGreaterThan(0)
      })

      for (const [path, value] of overridePairs) {
        it(`${path} exists in the ${name} catalog`, () => {
          const target = resolve(definitions.en, path)
          // Upstream must still ship a string leaf at this exact path; a rename
          // fails here instead of silently reverting the surface to "booking".
          expect(typeof target, `missing catalog key: ${path}`).toBe("string")
          expect(typeof value).toBe("string")
          // Guard against a stray un-converted value slipping into the catalog.
          expect(String(value).toLowerCase()).not.toContain("booking")
        })
      }
    })
  }

  describe("runtime resolution", () => {
    it("the override wins on the `en` locale", () => {
      const en = resolveBookingsUiMessages({
        locale: "en",
        overrides: bookingsReservationOverrides,
      })
      expect(en.bookingsPage.title).toBe("Reservations")
      expect(en.bookingCreateDialog.title).toBe("New reservation")
      expect(en.bookingList.newBooking).toBe("New reservation")
    })

    it("leaves the native Romanian catalog untouched", () => {
      const ro = resolveBookingsUiMessages({
        locale: "ro",
        overrides: bookingsReservationOverrides,
      })
      // ro already says "rezervare" natively — the en-only override must not
      // stamp English over it.
      expect(ro.bookingsPage.title).toBe("Rezervari")
    })

    it("keeps the guest-voice journey copy as `booking`", () => {
      const en = resolveBookingsUiMessages({
        locale: "en",
        overrides: bookingsReservationOverrides,
      })
      expect(en.bookingJourney.review.confirmBooking).toBe("Confirm booking")
    })
  })

  it("mergeAdminMessageOverrides folds user overrides over the nav base", () => {
    const merged = mergeAdminMessageOverrides(navReservationOverrides, {
      locales: { en: { nav: { people: "Guests" } } },
    } as never) as Overrides
    const en = merged.locales?.en as Record<string, Record<string, string>>
    expect(en.nav.bookings).toBe("Reservations")
    expect(en.nav.people).toBe("Guests")
  })

  it("mergeAdminMessageOverrides is a no-op when there is no user override", () => {
    expect(mergeAdminMessageOverrides(navReservationOverrides, undefined)).toBe(
      navReservationOverrides,
    )
  })
})
