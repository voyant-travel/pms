// @ts-nocheck -- legacy seed fixture typing cleanup is tracked separately from demo data edits.
// agent-quality: file-size exception -- end-to-end operator fixture data stays together for reproducible demo resets.
/**
 * Operator seed script — a realistic tour-operator scenario.
 *
 * Seeds: 1 auth org, 5 staff users, a populated CRM (2 orgs, 30 people,
 * 1 sales pipeline with quotes/quote versions), 4 shared places, 6 suppliers,
 * 6 products with availability, 6 bookings across lifecycle states with
 * matching finance docs, a cancellation policy, and a customer contract.
 *
 * Run:   pnpm seed -- --confirm
 * Target: the DATABASE_URL in starters/operator/.dev.vars
 */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  bookingActivityLog,
  bookingDocuments,
  bookingItems,
  bookingItemTravelers,
  bookingNotes,
  bookingSupplierStatuses,
  bookings,
  bookingTravelers,
} from "@voyant-travel/bookings/schema"
import {
  marketCurrencies,
  marketLocales,
  markets,
  optionPriceRules,
  optionUnitPriceRules,
  priceCatalogs,
} from "@voyant-travel/commerce"
import { newId } from "@voyant-travel/db/lib/typeid"
import { authAccount, authUser, userProfilesTable } from "@voyant-travel/db/schema/iam"
import {
  bookingDistributionDetails,
  supplierNotes,
  supplierRates,
  supplierServices,
  suppliers,
} from "@voyant-travel/distribution"
import {
  bookingGuarantees,
  bookingPaymentSchedules,
  creditNoteLineItems,
  creditNotes,
  invoiceLineItems,
  invoiceNumberSeries,
  invoices,
  invoiceTemplates,
  payments,
  taxClasses,
  taxPolicyProfiles,
  taxPolicyRules,
  taxRegimes,
} from "@voyant-travel/finance/schema"
import {
  identityAddresses,
  identityContactPoints,
  identityNamedContacts,
} from "@voyant-travel/identity/schema"
import {
  bookingItemProductDetails,
  bookingProductDetails,
} from "@voyant-travel/inventory/booking-extension"
import {
  optionUnits,
  productDayServices,
  productDays,
  productItineraries,
  productMedia,
  productOptions,
  products,
  productVersions,
} from "@voyant-travel/inventory/schema"
import {
  contracts,
  contractTemplates,
  contractTemplateVersions,
  policies,
  policyAcceptances,
  policyRules,
  policyVersions,
} from "@voyant-travel/legal/schema"
import {
  availabilityPickupPoints,
  availabilitySlots,
  availabilityStartTimes,
  facilities,
  facilityFeatures,
  facilityOperationSchedules,
} from "@voyant-travel/operations"
import { bookingQuoteDetails } from "@voyant-travel/quotes/booking-extension"
import {
  pipelines,
  quoteParticipants,
  quotes,
  quoteVersionLines,
  quoteVersions,
  stages,
} from "@voyant-travel/quotes/schema"
import {
  activities,
  activityLinks,
  activityParticipants,
  communicationLog,
  customFieldDefinitions,
  organizationNotes,
  organizations,
  people,
  personNotes,
  personPaymentMethods,
  segmentMembers,
  segments,
} from "@voyant-travel/relationships/schema"
import { hashPassword } from "better-auth/crypto"
import { asc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import {
  seedAccommodationRooms,
  seedCharters,
  seedCruises,
  seedExtras,
} from "./seed-catalog-verticals"
import { seedAircraft, seedAirlines, seedAirports } from "./seed-flights-reference"

// ---------- Env & args ----------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = resolve(SCRIPT_DIR, "..")

function parseDotEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    const body = readFileSync(path, "utf8")
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue
      const eq = line.indexOf("=")
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      const value = line
        .slice(eq + 1)
        .trim()
        .replace(/^"(.*)"$/, "$1")
      out[key] = value
    }
  } catch {
    // file missing — fine
  }
  return out
}

/**
 * Match drizzle.config.ts load order with `.dev.vars` as the final local
 * override. This keeps seed, migrate, and local worker runtime aligned.
 */
function loadEnv(): Record<string, string> {
  const merged: Record<string, string> = {}
  const files = [
    resolve(TEMPLATE_DIR, ".env"),
    resolve(TEMPLATE_DIR, "../../.env"),
    resolve(TEMPLATE_DIR, "../../.env.local"),
    resolve(TEMPLATE_DIR, ".dev.vars"),
  ]
  for (const file of files) {
    const parsed = parseDotEnv(file)
    for (const [k, v] of Object.entries(parsed)) {
      merged[k] = v
    }
  }
  return merged
}

const args = process.argv.slice(2)
const confirmed = args.includes("--confirm") || args.includes("-y")
const env = { ...loadEnv(), ...process.env }
const DATABASE_URL = env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set (checked .dev.vars and process.env)")
  process.exit(1)
}
if (!confirmed) {
  console.error("Refusing to seed without --confirm (this truncates every seed table).")
  console.error("Target:", DATABASE_URL)
  process.exit(1)
}

// ---------- DB client ----------

const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} })
const db = drizzle(sql)

// ---------- Helpers ----------

function daysFromNow(days: number): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d
}
function yyyyMmDd(date: Date): string {
  return date.toISOString().slice(0, 10)
}
function pick<T>(arr: readonly T[], i: number): T {
  const v = arr[i % arr.length]
  if (v === undefined) throw new Error("pick: empty array")
  return v
}

// ---------- Reset ----------

/** Truncate every table the seed touches. CASCADE handles FK children. */
async function reset() {
  console.log("→ truncating seed tables…")
  const tables = [
    // Finance & invoice lifecycle
    "credit_note_line_items",
    "credit_notes",
    "invoice_line_items",
    "invoice_renditions",
    "invoices",
    "invoice_external_refs",
    "invoice_number_series",
    "invoice_templates",
    "payments",
    "booking_guarantees",
    "booking_payment_schedules",
    "tax_policy_rules",
    "tax_policy_profiles",
    "tax_classes",
    "tax_regimes",
    // Booking extensions + bookings
    "booking_item_product_details",
    "booking_product_details",
    "booking_crm_details",
    "booking_distribution_details",
    "booking_traveler_travel_details",
    "booking_supplier_statuses",
    "booking_activity_log",
    "booking_notes",
    "booking_documents",
    "booking_item_travelers",
    "booking_items",
    "booking_travelers",
    "bookings",
    // Availability
    "availability_slot_pickups",
    "availability_slots",
    "availability_closeouts",
    "availability_pickup_points",
    "availability_start_times",
    "availability_rules",
    // Products
    // Pricing (must clear before options/units they reference)
    "option_unit_price_rules",
    "option_price_rules",
    "price_schedules",
    "price_catalogs",
    "product_day_services",
    "product_media",
    "product_days",
    "product_itineraries",
    "product_versions",
    "option_units",
    "product_options",
    "products",
    // Catalog verticals (seeded by seed-catalog-verticals.ts)
    "product_extras",
    "charter_products",
    "cruises",
    "room_types",
    "properties",
    // Suppliers
    "supplier_notes",
    "supplier_rates",
    "supplier_services",
    "supplier_availability",
    "supplier_contracts",
    "supplier_directory_projections",
    "suppliers",
    // Shared place compatibility tables
    "facility_features",
    "facility_operation_schedules",
    "facility_address_projections",
    "facilities",
    // Legal
    "policy_acceptances",
    "policy_rules",
    "policy_versions",
    "policies",
    "contract_signatures",
    "contract_attachments",
    "contracts",
    "contract_template_versions",
    "contract_templates",
    // Markets
    "market_channel_rules",
    "market_product_rules",
    "market_price_catalogs",
    "exchange_rates",
    "fx_rate_sets",
    "market_currencies",
    "market_locales",
    "markets",
    // CRM
    "segment_members",
    "segments",
    "communication_log",
    "organization_notes",
    "person_notes",
    "activity_participants",
    "activity_links",
    "activities",
    "quote_version_lines",
    "quote_versions",
    "quote_products",
    "quote_participants",
    "quotes",
    "stages",
    "pipelines",
    "custom_field_definitions",
    "people",
    "organizations",
    // Identity
    "identity_named_contacts",
    "identity_addresses",
    "identity_contact_points",
    // Auth
    "apikey",
    "invitation",
    "member",
    "verification",
    "session",
    "account",
    "user_profiles",
    '"user"',
    "organization",
  ]
  await sql.unsafe(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`)
}

// ---------- 1. Auth: organization + users ----------

const USERS = [
  {
    id: "user_owner",
    email: "owner@voyant.dev",
    name: "Alex Owner",
    password: "password123",
    isSuperAdmin: true,
  },
  {
    id: "user_admin",
    email: "admin@voyant.dev",
    name: "Sam Admin",
    password: "password123",
    isSuperAdmin: false,
  },
  {
    id: "user_sales",
    email: "sales@voyant.dev",
    name: "Riley Sales",
    password: "password123",
    isSuperAdmin: false,
  },
  {
    id: "user_ops",
    email: "ops@voyant.dev",
    name: "Jordan Ops",
    password: "password123",
    isSuperAdmin: false,
  },
  {
    id: "user_finance",
    email: "finance@voyant.dev",
    name: "Casey Finance",
    password: "password123",
    isSuperAdmin: false,
  },
] as const

async function seedAuth() {
  console.log("→ seeding auth (5 staff users)…")

  const now = new Date()
  for (const u of USERS) {
    const hashed = await hashPassword(u.password)
    const [firstName, ...rest] = u.name.split(" ")
    await db.insert(authUser).values({
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(authAccount).values({
      id: `acc_${u.id}`,
      userId: u.id,
      accountId: u.email,
      providerId: "credential",
      password: hashed,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(userProfilesTable).values({
      id: u.id,
      firstName: firstName ?? null,
      lastName: rest.join(" ") || null,
      avatarUrl: null,
      locale: "en",
      isSuperAdmin: u.isSuperAdmin,
      isSupportUser: false,
      marketingConsent: false,
      createdAt: now,
      updatedAt: now,
    })
  }
}

// ---------- 2. Markets + tax regimes + invoice templates ----------

const MARKETS = { uk: newId("markets"), fr: newId("markets") } as const
const TAX_NORM_REGIME = newId("tax_regimes")
const TAX_REDUSA_REGIME = newId("tax_regimes")
const TAX_VECHE_REGIME = newId("tax_regimes")
const TAX_REVERSE_REGIME = newId("tax_regimes")
const TAX_SFDD_REGIME = newId("tax_regimes")
const TAX_SDD_REGIME = newId("tax_regimes")
const TAX_INCLUDED_REGIME = newId("tax_regimes")
const TAX_NORM_CLASS = newId("tax_classes")
const TAX_REDUSA_CLASS = newId("tax_classes")
const TAX_VECHE_CLASS = newId("tax_classes")
const TAX_REVERSE_CLASS = newId("tax_classes")
const TAX_SFDD_CLASS = newId("tax_classes")
const TAX_SDD_CLASS = newId("tax_classes")
const TAX_INCLUDED_CLASS = newId("tax_classes")
const TAX_POLICY_RO_TRAVEL = newId("tax_policy_profiles")
const TAX_RULE_RO_ACCOMMODATION = newId("tax_policy_rules")
const TAX_RULE_RO_FALLBACK = newId("tax_policy_rules")
const INV_SERIES = newId("invoice_number_series")
const PROFORMA_SERIES = newId("invoice_number_series")
const INV_TMPL = newId("invoice_templates")

async function seedMarketsAndFinanceSetup() {
  console.log("→ seeding markets, tax regimes, invoice templates…")

  await db.insert(markets).values([
    {
      id: MARKETS.uk,
      code: "UK",
      name: "United Kingdom",
      regionCode: "GB",
      countryCode: "GB",
      defaultLanguageTag: "en-GB",
      defaultCurrency: "GBP",
      timezone: "Europe/London",
      status: "active",
    },
    {
      id: MARKETS.fr,
      code: "FR",
      name: "France",
      regionCode: "FR",
      countryCode: "FR",
      defaultLanguageTag: "fr-FR",
      defaultCurrency: "EUR",
      timezone: "Europe/Paris",
      status: "active",
    },
  ])

  await db.insert(marketLocales).values([
    {
      id: newId("market_locales"),
      marketId: MARKETS.uk,
      languageTag: "en-GB",
      isDefault: true,
      sortOrder: 0,
      active: true,
    },
    {
      id: newId("market_locales"),
      marketId: MARKETS.fr,
      languageTag: "fr-FR",
      isDefault: true,
      sortOrder: 0,
      active: true,
    },
    {
      id: newId("market_locales"),
      marketId: MARKETS.fr,
      languageTag: "en-GB",
      isDefault: false,
      sortOrder: 1,
      active: true,
    },
  ])
  await db.insert(marketCurrencies).values([
    {
      id: newId("market_currencies"),
      marketId: MARKETS.uk,
      currencyCode: "GBP",
      isDefault: true,
      isSettlement: true,
      isReporting: true,
      sortOrder: 0,
      active: true,
    },
    {
      id: newId("market_currencies"),
      marketId: MARKETS.fr,
      currencyCode: "EUR",
      isDefault: true,
      isSettlement: true,
      isReporting: true,
      sortOrder: 0,
      active: true,
    },
  ])

  await db.insert(taxRegimes).values([
    {
      id: TAX_NORM_REGIME,
      code: "standard",
      name: "Normala",
      jurisdiction: "RO",
      ratePercent: 21,
    },
    {
      id: TAX_REDUSA_REGIME,
      code: "reduced",
      name: "Redusa",
      jurisdiction: "RO",
      ratePercent: 11,
    },
    {
      id: TAX_VECHE_REGIME,
      code: "standard",
      name: "Veche",
      jurisdiction: "RO",
      ratePercent: 19,
    },
    {
      id: TAX_REVERSE_REGIME,
      code: "reverse_charge",
      name: "Taxare inversa",
      jurisdiction: "RO",
      ratePercent: 0,
    },
    {
      id: TAX_SFDD_REGIME,
      code: "zero_rated",
      name: "SFDD",
      jurisdiction: "RO",
      ratePercent: 0,
    },
    {
      id: TAX_SDD_REGIME,
      code: "zero_rated",
      name: "SDD",
      jurisdiction: "RO",
      ratePercent: 0,
    },
    {
      id: TAX_INCLUDED_REGIME,
      code: "other",
      name: "TVA Inclus",
      jurisdiction: "RO",
      ratePercent: 0,
    },
  ])

  await db.insert(taxClasses).values([
    {
      id: TAX_NORM_CLASS,
      code: "normala",
      label: "Normala",
      description: "Normala (21%)",
      defaultRegimeId: TAX_NORM_REGIME,
      active: true,
    },
    {
      id: TAX_REDUSA_CLASS,
      code: "redusa",
      label: "Redusa",
      description: "Redusa (11%)",
      defaultRegimeId: TAX_REDUSA_REGIME,
      active: true,
    },
    {
      id: TAX_VECHE_CLASS,
      code: "veche",
      label: "Veche",
      description: "Veche (19%)",
      defaultRegimeId: TAX_VECHE_REGIME,
      active: true,
    },
    {
      id: TAX_REVERSE_CLASS,
      code: "taxare-inversa",
      label: "Taxare inversa",
      description: "Taxare inversa (0%)",
      defaultRegimeId: TAX_REVERSE_REGIME,
      active: true,
    },
    {
      id: TAX_SFDD_CLASS,
      code: "sfdd",
      label: "SFDD",
      description: "SFDD (0%)",
      defaultRegimeId: TAX_SFDD_REGIME,
      active: true,
    },
    {
      id: TAX_SDD_CLASS,
      code: "sdd",
      label: "SDD",
      description: "SDD (0%)",
      defaultRegimeId: TAX_SDD_REGIME,
      active: true,
    },
    {
      id: TAX_INCLUDED_CLASS,
      code: "tva-inclus",
      label: "TVA Inclus",
      description: "TVA Inclus (0%)",
      defaultRegimeId: TAX_INCLUDED_REGIME,
      active: true,
    },
  ])

  await db.insert(taxPolicyProfiles).values({
    id: TAX_POLICY_RO_TRAVEL,
    code: "ro-travel-operator",
    name: "Romanian travel operator",
    jurisdiction: "RO",
    description:
      "Sell-side Romanian travel operator VAT policy: Romanian accommodation uses reduced VAT, all other catalog items use standard VAT.",
    active: true,
  })

  await db.insert(taxPolicyRules).values([
    {
      id: TAX_RULE_RO_ACCOMMODATION,
      profileId: TAX_POLICY_RO_TRAVEL,
      side: "sell",
      priority: 10,
      name: "Accommodation in Romania",
      appliesTo: "all",
      condition: {
        all: [
          { fact: "hasAccommodation", eq: true },
          { fact: "accommodationCountries", contains: "RO" },
        ],
      },
      taxRegimeId: TAX_REDUSA_REGIME,
      active: true,
    },
    {
      id: TAX_RULE_RO_FALLBACK,
      profileId: TAX_POLICY_RO_TRAVEL,
      side: "sell",
      priority: 100,
      name: "Standard sell-side VAT",
      appliesTo: "all",
      condition: { always: true },
      taxRegimeId: TAX_NORM_REGIME,
      active: true,
    },
  ])

  await db.insert(invoiceNumberSeries).values([
    {
      id: INV_SERIES,
      code: "INV-2026",
      name: "Invoices 2026",
      prefix: "INV-2026-",
      separator: "",
      padLength: 5,
      currentSequence: 0,
      resetStrategy: "never",
      scope: "invoice",
      isDefault: true,
    },
    {
      id: PROFORMA_SERIES,
      code: "PRO-2026",
      name: "Proformas 2026",
      prefix: "PRO-2026-",
      separator: "",
      padLength: 5,
      currentSequence: 0,
      resetStrategy: "never",
      scope: "proforma",
      isDefault: true,
    },
  ])

  await db.insert(invoiceTemplates).values({
    id: INV_TMPL,
    name: "Default Invoice Template",
    slug: "default",
    scope: "sales",
    bodyFormat: "markdown",
    body: `# Invoice {{invoice.number}}\n\n**Bill to:** {{customer.name}}\n\n| Line | Qty | Total |\n| --- | --- | --- |\n{{#each lines}}| {{description}} | {{quantity}} | {{totalAmount}} |\n{{/each}}\n\n**Total: {{invoice.total}}**`,
    description: "Markdown default",
    active: true,
  })
}

// ---------- 3. Shared places ----------

const FACILITIES = {
  hotelThames: newId("facilities"),
  hotelMontmartre: newId("facilities"),
  transferHubLhr: newId("facilities"),
  venueEiffel: newId("facilities"),
} as const

async function seedFacilities() {
  console.log("→ seeding shared places…")
  await db.insert(facilities).values([
    {
      id: FACILITIES.hotelThames,
      kind: "hotel",
      name: "The Thameside Hotel",
      code: "UK-LON-THAMES",
      description: "Riverside boutique hotel in central London.",
      timezone: "Europe/London",
      status: "active",
      tags: ["london", "central", "boutique"],
      ownerType: "supplier",
    },
    {
      id: FACILITIES.hotelMontmartre,
      kind: "hotel",
      name: "Hôtel Montmartre Vue",
      code: "FR-PAR-MONTMARTRE",
      description: "Family hotel with a view of Sacré-Cœur.",
      timezone: "Europe/Paris",
      status: "active",
      tags: ["paris", "montmartre"],
      ownerType: "supplier",
    },
    {
      id: FACILITIES.transferHubLhr,
      kind: "transfer_hub",
      name: "Heathrow Transfer Hub",
      code: "UK-LHR",
      description: "Meeting point for airport transfers at LHR T5.",
      timezone: "Europe/London",
      status: "active",
      tags: ["airport", "transfer"],
      ownerType: "internal",
    },
    {
      id: FACILITIES.venueEiffel,
      kind: "meeting_point",
      name: "Eiffel Tower — Pilier Sud",
      code: "FR-EIFFEL-S",
      timezone: "Europe/Paris",
      status: "active",
      tags: ["paris", "landmark"],
      ownerType: "internal",
    },
  ])

  await db.insert(facilityFeatures).values([
    {
      id: newId("facility_features"),
      facilityId: FACILITIES.hotelThames,
      category: "amenity",
      name: "Free Wi-Fi",
      highlighted: true,
    },
    {
      id: newId("facility_features"),
      facilityId: FACILITIES.hotelThames,
      category: "amenity",
      name: "Breakfast included",
      highlighted: true,
    },
    {
      id: newId("facility_features"),
      facilityId: FACILITIES.hotelThames,
      category: "accessibility",
      name: "Step-free access",
    },
    {
      id: newId("facility_features"),
      facilityId: FACILITIES.hotelMontmartre,
      category: "amenity",
      name: "Rooftop terrace",
      highlighted: true,
    },
    {
      id: newId("facility_features"),
      facilityId: FACILITIES.hotelMontmartre,
      category: "policy",
      name: "Pets allowed",
    },
  ])

  await db.insert(facilityOperationSchedules).values([
    {
      id: newId("facility_operation_schedules"),
      facilityId: FACILITIES.transferHubLhr,
      dayOfWeek: null,
      opensAt: "04:30",
      closesAt: "23:30",
      timezone: "Europe/London",
    },
    {
      id: newId("facility_operation_schedules"),
      facilityId: FACILITIES.venueEiffel,
      dayOfWeek: null,
      opensAt: "09:00",
      closesAt: "22:45",
      timezone: "Europe/Paris",
    },
  ])
}

// ---------- 4. Suppliers ----------

type SupplierRow = {
  id: string
  name: string
  type: "hotel" | "transfer" | "guide" | "experience" | "airline" | "restaurant" | "other"
  currency: string
  facilityId?: string
}
const SUPPLIERS: SupplierRow[] = [
  {
    id: newId("suppliers"),
    name: "Thames Accommodation Ltd",
    type: "hotel",
    currency: "GBP",
    facilityId: FACILITIES.hotelThames,
  },
  {
    id: newId("suppliers"),
    name: "Montmartre Accueil SARL",
    type: "hotel",
    currency: "EUR",
    facilityId: FACILITIES.hotelMontmartre,
  },
  {
    id: newId("suppliers"),
    name: "London Private Transfers",
    type: "transfer",
    currency: "GBP",
    facilityId: FACILITIES.transferHubLhr,
  },
  { id: newId("suppliers"), name: "Parisien City Guides", type: "guide", currency: "EUR" },
  { id: newId("suppliers"), name: "Seine River Cruises", type: "experience", currency: "EUR" },
  { id: newId("suppliers"), name: "Chez Margaux Bistro", type: "restaurant", currency: "EUR" },
]

// service → supplier index for use later
const SERVICES: Array<{
  id: string
  supplierIdx: number
  name: string
  type: "accommodation" | "transfer" | "experience" | "guide" | "meal" | "other"
  currency: string
  amountCents: number
  unit: "per_person" | "per_group" | "per_night" | "per_vehicle" | "flat"
}> = [
  {
    id: newId("supplier_services"),
    supplierIdx: 0,
    name: "Standard Room — BB",
    type: "accommodation",
    currency: "GBP",
    amountCents: 14500,
    unit: "per_night",
  },
  {
    id: newId("supplier_services"),
    supplierIdx: 0,
    name: "Deluxe Riverview — BB",
    type: "accommodation",
    currency: "GBP",
    amountCents: 22500,
    unit: "per_night",
  },
  {
    id: newId("supplier_services"),
    supplierIdx: 1,
    name: "Classique Double",
    type: "accommodation",
    currency: "EUR",
    amountCents: 18000,
    unit: "per_night",
  },
  {
    id: newId("supplier_services"),
    supplierIdx: 2,
    name: "LHR ↔ Central London Sedan",
    type: "transfer",
    currency: "GBP",
    amountCents: 9500,
    unit: "per_vehicle",
  },
  {
    id: newId("supplier_services"),
    supplierIdx: 3,
    name: "Half-Day Montmartre Walk",
    type: "guide",
    currency: "EUR",
    amountCents: 4500,
    unit: "per_person",
  },
  {
    id: newId("supplier_services"),
    supplierIdx: 4,
    name: "Sunset Seine Cruise",
    type: "experience",
    currency: "EUR",
    amountCents: 3200,
    unit: "per_person",
  },
  {
    id: newId("supplier_services"),
    supplierIdx: 5,
    name: "Three-Course Tasting Menu",
    type: "meal",
    currency: "EUR",
    amountCents: 6500,
    unit: "per_person",
  },
]

async function seedSuppliers() {
  console.log("→ seeding suppliers + services + rates…")
  await db.insert(suppliers).values(
    SUPPLIERS.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      status: "active" as const,
      defaultCurrency: s.currency,
      paymentTermsDays: 30,
      primaryFacilityId: s.facilityId ?? null,
      tags: [],
    })),
  )
  await db.insert(supplierServices).values(
    SERVICES.map((svc) => ({
      id: svc.id,
      supplierId: SUPPLIERS[svc.supplierIdx]!.id,
      serviceType: svc.type,
      facilityId: SUPPLIERS[svc.supplierIdx]!.facilityId ?? null,
      name: svc.name,
      active: true,
      tags: [],
    })),
  )
  await db.insert(supplierRates).values(
    SERVICES.map((svc) => ({
      id: newId("supplier_rates"),
      serviceId: svc.id,
      name: `Published rate — ${svc.name}`,
      currency: svc.currency,
      amountCents: svc.amountCents,
      unit: svc.unit,
      validFrom: yyyyMmDd(daysFromNow(-30)),
      validTo: yyyyMmDd(daysFromNow(365)),
      minPax: 1,
      maxPax: svc.unit === "per_vehicle" ? 4 : 30,
    })),
  )
  await db.insert(supplierNotes).values([
    {
      id: newId("supplier_notes"),
      supplierId: SUPPLIERS[0]!.id,
      authorId: USERS[3]!.id,
      content: "Prefers phone over email for urgent issues.",
    },
    {
      id: newId("supplier_notes"),
      supplierId: SUPPLIERS[2]!.id,
      authorId: USERS[3]!.id,
      content: "Has a 2-hour cancellation window for all transfers.",
    },
  ])
}

// ---------- 5. CRM: orgs, people, pipeline, quotes, quote versions ----------

const CRM_ORGS = [
  {
    id: newId("organizations"),
    name: "Northwind Travel Co.",
    industry: "travel",
    website: "https://northwind.example.com",
    relation: "partner" as const,
  },
  {
    id: newId("organizations"),
    name: "Globex DMC",
    industry: "travel",
    website: "https://globex-dmc.example.com",
    relation: "partner" as const,
  },
]

const FIRST_NAMES = [
  "Ava",
  "Liam",
  "Mia",
  "Noah",
  "Emma",
  "Oliver",
  "Isla",
  "Lucas",
  "Sofia",
  "Arthur",
  "Zara",
  "Felix",
  "Hana",
  "Rafael",
  "Chloe",
  "Theo",
  "Nora",
  "Ezra",
  "Lila",
  "Owen",
  "Maya",
  "Kai",
  "Eliza",
  "Marcus",
  "Yuki",
  "Leo",
  "Iris",
  "Samir",
  "Anya",
  "Diego",
]
const LAST_NAMES = [
  "Parker",
  "Walsh",
  "Nguyen",
  "Silva",
  "Dubois",
  "Rossi",
  "Kowalski",
  "Tanaka",
  "Ahmed",
  "Schmidt",
  "Okafor",
  "Sato",
  "Patel",
  "Jensen",
  "Petrov",
  "Ivanov",
  "Costa",
  "Laurent",
  "Chen",
  "Romano",
  "Fischer",
  "Park",
  "Adeyemi",
  "Müller",
  "Khan",
  "Jansen",
  "Moretti",
  "Yilmaz",
  "Björn",
  "Rahman",
]

const people_ids: string[] = []

async function seedCrm() {
  console.log("→ seeding CRM…")

  // Organizations
  await db.insert(organizations).values(
    CRM_ORGS.map((o) => ({
      id: o.id,
      name: o.name,
      industry: o.industry,
      website: o.website,
      relation: o.relation,
      status: "active" as const,
      defaultCurrency: "EUR",
      ownerId: USERS[2]!.id,
    })),
  )

  // People (30)
  for (let i = 0; i < 30; i++) {
    const id = newId("people")
    people_ids.push(id)
    const first = pick(FIRST_NAMES, i)
    const last = pick(LAST_NAMES, i * 7)
    const org = i < 8 ? CRM_ORGS[i % 2]!.id : null
    await db.insert(people).values({
      id,
      firstName: first,
      lastName: last,
      organizationId: org,
      jobTitle: org
        ? pick(["Travel Manager", "Group Booker", "Office Manager", "Founder"], i)
        : null,
      relation: org ? "partner" : "client",
      status: "active",
      ownerId: pick([USERS[2]!.id, USERS[3]!.id], i),
    })
  }

  // Identity contact points for first 10 people
  for (let i = 0; i < 10; i++) {
    const personId = people_ids[i]!
    await db.insert(identityContactPoints).values({
      id: newId("identity_contact_points"),
      entityType: "person",
      entityId: personId,
      kind: "email",
      value: `${pick(FIRST_NAMES, i).toLowerCase()}.${pick(LAST_NAMES, i * 7).toLowerCase()}@example.com`,
      isPrimary: true,
    })
    await db.insert(identityContactPoints).values({
      id: newId("identity_contact_points"),
      entityType: "person",
      entityId: personId,
      kind: "phone",
      value: `+44 20 7${(1000 + i * 37).toString().padStart(4, "0")} ${(5000 + i * 11).toString().padStart(4, "0")}`,
      isPrimary: false,
    })
    await db.insert(identityAddresses).values({
      id: newId("identity_addresses"),
      entityType: "person",
      entityId: personId,
      line1: `${10 + i} Example Street`,
      city: pick(["London", "Paris", "Amsterdam", "Berlin"], i),
      countryCode: pick(["GB", "FR", "NL", "DE"], i),
      postalCode: pick(["W1D 3QF", "75001", "1011 AB", "10115"], i),
      isPrimary: true,
    })
  }
  // Named contact for one org
  await db.insert(identityNamedContacts).values({
    id: newId("identity_named_contacts"),
    entityType: "organization",
    entityId: CRM_ORGS[0]!.id,
    role: "accounting",
    personId: people_ids[0]!,
    name: "Accounts Payable",
  })

  // Saved payment methods on file for the first 8 people. Mix of brands +
  // bank transfer; one is marked default per person. Tokens are placeholders —
  // a production setup would carry processor-issued opaque ids.
  const PM_BRANDS = ["visa", "mastercard", "amex", "revolut", "bank_transfer"] as const
  for (let i = 0; i < 8; i++) {
    const personId = people_ids[i]!
    const count = (i % 3) + 1 // 1..3 methods per person
    for (let j = 0; j < count; j++) {
      const brand = PM_BRANDS[(i + j) % PM_BRANDS.length]!
      const isCard = brand !== "bank_transfer"
      await db.insert(personPaymentMethods).values({
        id: newId("person_payment_methods"),
        personId,
        brand,
        last4: isCard ? String(1000 + ((i * 13 + j * 7) % 9000)).padStart(4, "0") : null,
        holderName: `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i * 7)}`,
        expMonth: isCard ? ((i + j) % 12) + 1 : null,
        expYear: isCard ? 2027 + ((i + j) % 4) : null,
        processorToken: `tok_seed_${personId}_${j}`,
        isDefault: j === 0,
      })
    }
  }

  // Pipeline + stages
  const pipelineId = newId("pipelines")
  type StageSeed = {
    key: string
    name: string
    order: number
    probability: number
    isClosed?: boolean
    isWon?: boolean
    isLost?: boolean
  }
  const STAGES: StageSeed[] = [
    { key: "lead", name: "Lead", order: 0, probability: 10 },
    { key: "qualified", name: "Qualified", order: 1, probability: 30 },
    { key: "proposal", name: "Proposal", order: 2, probability: 60 },
    { key: "won", name: "Won", order: 3, probability: 100, isClosed: true, isWon: true },
    { key: "lost", name: "Lost", order: 4, probability: 0, isClosed: true, isLost: true },
  ]
  const stageIds: Record<string, string> = {}
  await db.insert(pipelines).values({
    id: pipelineId,
    entityType: "quote",
    name: "Group & Leisure Sales",
    isDefault: true,
    sortOrder: 0,
  })
  for (const s of STAGES) {
    const stgId = newId("stages")
    stageIds[s.key] = stgId
    await db.insert(stages).values({
      id: stgId,
      pipelineId,
      name: s.name,
      sortOrder: s.order,
      probability: s.probability.toString(),
      isClosed: s.isClosed ?? false,
      isWon: s.isWon ?? false,
      isLost: s.isLost ?? false,
    })
  }

  // 6 quotes across stages
  const QUOTE_SEEDS = [
    {
      title: "Northwind Q2 board retreat, Paris",
      stage: "qualified",
      value: 1850000,
      currency: "EUR",
      personIdx: 0,
      orgId: CRM_ORGS[0]!.id,
    },
    {
      title: "Globex incentive — Rome long-weekend",
      stage: "proposal",
      value: 2650000,
      currency: "EUR",
      personIdx: 1,
      orgId: CRM_ORGS[1]!.id,
    },
    {
      title: "Honeymoon — Thames + Montmartre",
      stage: "won",
      value: 420000,
      currency: "GBP",
      personIdx: 10,
      orgId: null,
    },
    {
      title: "Family summer in Brittany",
      stage: "lead",
      value: 0,
      currency: "EUR",
      personIdx: 11,
      orgId: null,
    },
    {
      title: "Silver anniversary — Seine cruise package",
      stage: "won",
      value: 320000,
      currency: "EUR",
      personIdx: 12,
      orgId: null,
    },
    {
      title: "Executive retreat — LHR VIP transfers",
      stage: "lost",
      value: 580000,
      currency: "GBP",
      personIdx: 2,
      orgId: CRM_ORGS[0]!.id,
    },
  ] as const

  const quoteIds: string[] = []
  for (const o of QUOTE_SEEDS) {
    const quoteId = newId("quotes")
    quoteIds.push(quoteId)
    await db.insert(quotes).values({
      id: quoteId,
      title: o.title,
      pipelineId,
      stageId: stageIds[o.stage]!,
      personId: people_ids[o.personIdx] ?? null,
      organizationId: o.orgId,
      ownerId: USERS[2]!.id,
      status: o.stage === "lost" ? "lost" : o.stage === "won" ? "won" : "open",
      valueAmountCents: o.value,
      valueCurrency: o.currency,
      expectedCloseDate: yyyyMmDd(daysFromNow(14 + Math.floor(Math.random() * 60))),
    })
    await db.insert(quoteParticipants).values({
      id: newId("quote_participants"),
      quoteId,
      personId: people_ids[o.personIdx]!,
      role: "decision_maker",
      isPrimary: true,
    })

    if (o.value > 0) {
      const quoteVersionId = newId("quote_versions")
      await db.insert(quoteVersions).values({
        id: quoteVersionId,
        quoteId,
        currency: o.currency,
        status: o.stage === "won" ? "accepted" : o.stage === "lost" ? "declined" : "sent",
        subtotalAmountCents: Math.round(o.value / 1.2),
        taxAmountCents: o.value - Math.round(o.value / 1.2),
        totalAmountCents: o.value,
      })
      await db.insert(quoteVersionLines).values({
        id: newId("quote_version_lines"),
        quoteVersionId,
        description: o.title,
        currency: o.currency,
        quantity: 1,
        unitPriceAmountCents: o.value,
        totalAmountCents: o.value,
      })
    }
  }

  // Custom fields
  const cfVipId = newId("custom_field_definitions")
  const cfPrefId = newId("custom_field_definitions")
  await db.insert(customFieldDefinitions).values([
    {
      id: cfVipId,
      entityType: "person",
      key: "vip_tier",
      label: "VIP Tier",
      fieldType: "enum",
      isSearchable: true,
    },
    {
      id: cfPrefId,
      entityType: "person",
      key: "travel_preferences",
      label: "Travel preferences",
      fieldType: "text",
    },
  ])

  // Notes + communications
  await db.insert(personNotes).values([
    {
      id: newId("person_notes"),
      personId: people_ids[0]!,
      authorId: USERS[2]!.id,
      content: "Met at ITB Berlin — mentioned Q2 board retreat requirement.",
    },
    {
      id: newId("person_notes"),
      personId: people_ids[10]!,
      authorId: USERS[2]!.id,
      content: "Honeymoon couple — confirmed dietary: one vegetarian.",
    },
  ])
  await db.insert(organizationNotes).values([
    {
      id: newId("organization_notes"),
      organizationId: CRM_ORGS[0]!.id,
      authorId: USERS[1]!.id,
      content: "Net-30 invoicing, PO required on each booking.",
    },
  ])
  await db.insert(communicationLog).values([
    {
      id: newId("communication_log"),
      personId: people_ids[0]!,
      channel: "email",
      direction: "outbound",
      subject: "Paris proposal v2",
      content: "Revised pricing attached.",
    },
    {
      id: newId("communication_log"),
      personId: people_ids[1]!,
      channel: "phone",
      direction: "inbound",
      subject: "Rome call 15m",
      content: "Wants 3★+ hotels only; dietary flag for group.",
    },
    {
      id: newId("communication_log"),
      personId: people_ids[10]!,
      channel: "whatsapp",
      direction: "outbound",
      subject: "Itinerary shared",
      content: "PDF sent; awaiting confirmation.",
    },
  ])

  // Activities
  const actIds = [newId("activities"), newId("activities"), newId("activities")]
  await db.insert(activities).values([
    {
      id: actIds[0]!,
      subject: "Call — Northwind board retreat scoping",
      type: "call",
      ownerId: USERS[2]!.id,
      status: "done",
      dueAt: daysFromNow(-3),
      completedAt: daysFromNow(-3),
    },
    {
      id: actIds[1]!,
      subject: "Follow up on Rome proposal",
      type: "follow_up",
      ownerId: USERS[2]!.id,
      status: "planned",
      dueAt: daysFromNow(2),
    },
    {
      id: actIds[2]!,
      subject: "Site inspection — Hôtel Montmartre",
      type: "meeting",
      ownerId: USERS[3]!.id,
      status: "planned",
      dueAt: daysFromNow(14),
      location: "Paris",
    },
  ])
  await db.insert(activityLinks).values([
    {
      id: newId("activity_links"),
      activityId: actIds[0]!,
      entityType: "quote",
      entityId: quoteIds[0]!,
      role: "primary",
    },
    {
      id: newId("activity_links"),
      activityId: actIds[1]!,
      entityType: "quote",
      entityId: quoteIds[1]!,
      role: "primary",
    },
  ])
  await db.insert(activityParticipants).values([
    {
      id: newId("activity_participants"),
      activityId: actIds[0]!,
      personId: people_ids[0]!,
      isPrimary: true,
    },
    {
      id: newId("activity_participants"),
      activityId: actIds[1]!,
      personId: people_ids[1]!,
      isPrimary: true,
    },
  ])

  // Segments
  const segVip = newId("segments")
  const segFr = newId("segments")
  await db.insert(segments).values([
    { id: segVip, name: "VIP customers", description: "Gold + platinum tier." },
    {
      id: segFr,
      name: "France leads",
      description: "Prospects interested in Paris/France products.",
    },
  ])
  await db.insert(segmentMembers).values([
    { id: newId("segment_members"), segmentId: segVip, personId: people_ids[0]! },
    { id: newId("segment_members"), segmentId: segVip, personId: people_ids[10]! },
    { id: newId("segment_members"), segmentId: segFr, personId: people_ids[11]! },
    { id: newId("segment_members"), segmentId: segFr, personId: people_ids[12]! },
  ])
}

// ---------- 6. Products + availability ----------

type ProductRow = {
  id: string
  name: string
  days: number
  sellCurrency: string
  sellAmountCents: number
  costAmountCents: number
  facilityId?: string
  /** Index into SUPPLIERS to attach as the operating brand for this product. */
  supplierIdx?: number
  status: "draft" | "active" | "inactive" | "archived"
  visibility: "private" | "public"
  /** Marketing description — surfaces in the catalog detail sheet body. */
  description?: string
  /** Faceted tags — surfaces in the catalog "Tags & themes" section. */
  tags?: string[]
  /**
   * Day-by-day itinerary copy. Length should equal `days`; when shorter,
   * remaining days fall back to a generic stub. Surfaces in the catalog
   * detail sheet's Itinerary section.
   */
  itinerary?: Array<{ title: string; description: string; location?: string }>
  /**
   * Bookable options for the product. Defaults to a single "Standard"
   * option when omitted. The first entry is treated as the default.
   */
  options?: Array<{ code: string; name: string; description: string }>
}
const PRODUCTS: ProductRow[] = [
  {
    id: newId("products"),
    name: "London 3-Day Essentials",
    days: 3,
    sellCurrency: "GBP",
    sellAmountCents: 79000,
    costAmountCents: 48000,
    facilityId: FACILITIES.hotelThames,
    supplierIdx: 0,
    status: "active",
    visibility: "public",
    description:
      "Three days hitting London's headline beats — Westminster, Tower Bridge, Borough Market — with a riverside boutique hotel, central transfers, and a private guide who picks the queue-skip windows.",
    tags: ["london", "city-break", "guided", "boutique"],
    itinerary: [
      {
        title: "Arrival + Westminster on foot",
        description:
          "Meet-and-greet at Heathrow, sedan transfer to the South Bank hotel, late-afternoon walking tour from Westminster Abbey to Big Ben and Whitehall. Welcome dinner reservation included.",
        location: "London — South Bank",
      },
      {
        title: "Tower of London + Borough Market",
        description:
          "Crown Jewels access before public opening, Tower Bridge glass walk, lunch at Borough Market with a private food guide, free evening with hotel concierge picks.",
        location: "London — City",
      },
      {
        title: "Royal parks + departure transfer",
        description:
          "Morning stroll through St James's and Green Park, optional Buckingham Palace state-room visit (seasonal), late checkout, private transfer back to Heathrow.",
        location: "London — West End",
      },
    ],
    options: [
      {
        code: "STD",
        name: "Standard double",
        description: "Boutique river-view double room, daily breakfast included.",
      },
      {
        code: "STE",
        name: "Junior suite upgrade",
        description: "Top-floor junior suite with terrace, evening turndown, sparkling on arrival.",
      },
    ],
  },
  {
    id: newId("products"),
    name: "Paris Sunset & Seine",
    days: 2,
    sellCurrency: "EUR",
    sellAmountCents: 48000,
    costAmountCents: 32000,
    facilityId: FACILITIES.hotelMontmartre,
    supplierIdx: 1,
    status: "active",
    visibility: "public",
    description:
      "Two evenings in Paris built around a sunset cruise on the Seine, a Montmartre dinner reservation, and a private morning at the Musée d'Orsay before the crowds.",
    tags: ["paris", "romantic", "cruise", "evening"],
    itinerary: [
      {
        title: "Sunset cruise on the Seine",
        description:
          "Hotel check-in at a small Montmartre maison, late-afternoon glass of champagne at the rooftop bar, private boarding for a sunset cruise from Pont de l'Alma, Montmartre dinner reservation to follow.",
        location: "Paris — 7e / Montmartre",
      },
      {
        title: "Musée d'Orsay + free afternoon",
        description:
          "Skip-the-line access to the Musée d'Orsay before public opening with a private art historian, leisurely lunch on the Left Bank, free afternoon to wander Saint-Germain before a late departure.",
        location: "Paris — Left Bank",
      },
    ],
    options: [
      {
        code: "STD",
        name: "Classic evening",
        description: "Shared sunset cruise, Montmartre bistro dinner.",
      },
      {
        code: "PRIV",
        name: "Private boat",
        description: "Private boat charter on the Seine, chef-curated tasting menu on board.",
      },
    ],
  },
  {
    id: newId("products"),
    name: "Montmartre Walking Tour",
    days: 1,
    sellCurrency: "EUR",
    sellAmountCents: 7500,
    costAmountCents: 4500,
    supplierIdx: 2,
    status: "active",
    visibility: "public",
    description:
      "Half-day walking tour through Montmartre's painters' streets with a local art-history guide. Stops at Sacré-Cœur, Place du Tertre, and a tucked-away wine cellar for a tasting break.",
    tags: ["paris", "walking", "guided", "half-day", "art"],
    itinerary: [
      {
        title: "Painters, basilica, and a cellar tasting",
        description:
          "Meet at Abbesses metro, climb through the painters' quarter with a Montmartre native, stop at Place du Tertre and Sacré-Cœur for terrace views, finish with a tasting at a tucked-away 18th-century wine cellar.",
        location: "Paris — Montmartre",
      },
    ],
    options: [
      {
        code: "STD",
        name: "Shared small group",
        description: "Up to 8 guests, English-speaking art historian guide.",
      },
      {
        code: "PRIV",
        name: "Private guide",
        description: "Private guide for your group only, choice of English/French/Spanish.",
      },
    ],
  },
  {
    id: newId("products"),
    name: "LHR ↔ London Transfer (Sedan)",
    days: 1,
    sellCurrency: "GBP",
    sellAmountCents: 12000,
    costAmountCents: 9500,
    facilityId: FACILITIES.transferHubLhr,
    supplierIdx: 3,
    status: "active",
    visibility: "public",
    description:
      "Private sedan transfer between Heathrow Terminal 5 and central London. Meet-and-greet inside arrivals, complimentary wait time, fixed all-in price.",
    tags: ["transfer", "london", "airport", "private"],
    itinerary: [
      {
        title: "Heathrow ↔ central London transfer",
        description:
          "Driver waits inside arrivals with a name board, 60 min complimentary wait time, child seats on request, mineral water on board. Drop-off at any central London address.",
        location: "London — LHR / central London",
      },
    ],
    options: [
      {
        code: "STD",
        name: "Executive sedan",
        description: "Up to 3 passengers and 3 suitcases. Mercedes E-Class or equivalent.",
      },
      {
        code: "SUV",
        name: "Premium SUV",
        description: "Up to 5 passengers and 5 suitcases. Range Rover or equivalent.",
      },
    ],
  },
  {
    id: newId("products"),
    name: "Eiffel Summit Private Access",
    days: 1,
    sellCurrency: "EUR",
    sellAmountCents: 16500,
    costAmountCents: 10500,
    facilityId: FACILITIES.venueEiffel,
    supplierIdx: 4,
    status: "active",
    visibility: "public",
    description:
      "Skip-the-line summit access at the Eiffel Tower with a private host. Champagne option at the second floor brasserie; flexible 90-minute window.",
    tags: ["paris", "landmark", "private", "skip-the-line", "evening"],
    itinerary: [
      {
        title: "Summit access with a private host",
        description:
          "Meet your host at the dedicated reservations entrance, dedicated lift to the summit, panoramic narration of Paris's quartiers, optional descent stop at the second-floor brasserie. 90-minute booking window.",
        location: "Paris — Champ de Mars",
      },
    ],
    options: [
      {
        code: "STD",
        name: "Summit access",
        description: "Skip-the-line summit access with a private English-speaking host.",
      },
      {
        code: "CHMP",
        name: "Summit + champagne",
        description: "Summit access plus a glass of champagne at the second-floor brasserie.",
      },
    ],
  },
  {
    id: newId("products"),
    name: "Honeymoon Package — London+Paris",
    days: 5,
    sellCurrency: "GBP",
    sellAmountCents: 185000,
    costAmountCents: 120000,
    supplierIdx: 5,
    status: "draft",
    visibility: "private",
    description:
      "Five-night two-city honeymoon — three nights riverside in London, two nights Montmartre in Paris, Eurostar in between, daily concierge, sunset Seine cruise on night four.",
    tags: ["honeymoon", "luxury", "multi-city", "london", "paris"],
    itinerary: [
      {
        title: "London arrival + welcome dinner",
        description:
          "LHR meet-and-greet, sedan transfer to a riverside boutique on the South Bank. Sparkling on arrival, evening Thames-side stroll, welcome dinner at a chef's-table reservation walking distance from the hotel.",
        location: "London — South Bank",
      },
      {
        title: "Tower of London + West End evening",
        description:
          "Crown Jewels access before the public opens, private tour through the medieval halls, lunch reservation in the City, free afternoon, West End theatre seats with pre-show champagne.",
        location: "London — City / West End",
      },
      {
        title: "Eurostar to Paris",
        description:
          "Leisurely brunch, transfer to St Pancras, Eurostar Business Premier to Gare du Nord, check-in at a small Montmartre maison. Evening apéro at the rooftop bar, dinner reservation in a Montmartre bistro.",
        location: "London → Paris",
      },
      {
        title: "Sunset cruise on the Seine",
        description:
          "Slow morning, private guided visit of the Musée d'Orsay before public hours, free afternoon to wander Saint-Germain, private boat boarding at sunset for a chef-curated tasting menu on the Seine.",
        location: "Paris — 7e",
      },
      {
        title: "Versailles + departure",
        description:
          "Private morning tour of Versailles with a Louis-XIV historian, lunch in the gardens, return to Paris for late checkout, sedan transfer to CDG or Eurostar back to London.",
        location: "Paris — Versailles",
      },
    ],
    options: [
      {
        code: "DLX",
        name: "Deluxe rooms",
        description:
          "River-view in London, Montmartre maison classic double in Paris, daily breakfast at both hotels.",
      },
      {
        code: "STE",
        name: "Suite upgrade",
        description:
          "Junior suite at both hotels, turndown nightly, in-room sparkling on arrival in each city.",
      },
      {
        code: "ALLIN",
        name: "All-in concierge",
        description:
          "Suite upgrade plus a daily concierge budget for restaurant reservations, theatre, and private museum bookings — handled before you arrive.",
      },
    ],
  },
]

/**
 * Fetch landscape photos from Unsplash by query. Returns empty array if the
 * access key is missing or the request fails — image seeding is best-effort.
 */
type UnsplashPhoto = {
  urls: { regular: string; full: string }
  alt_description: string | null
  description: string | null
  user: { name: string; username: string }
  width: number
  height: number
}
async function fetchUnsplashPhotos(query: string, perPage: number): Promise<UnsplashPhoto[]> {
  const key = env.UNSPLASH_ACCESS_KEY
  if (!key) return []

  const url = new URL("https://api.unsplash.com/search/photos")
  url.searchParams.set("query", query)
  url.searchParams.set("per_page", String(perPage))
  url.searchParams.set("orientation", "landscape")
  url.searchParams.set("content_filter", "high")

  const res = await fetch(url, {
    headers: {
      Authorization: `Client-ID ${key}`,
      "Accept-Version": "v1",
    },
  })
  if (!res.ok) {
    console.warn(`  unsplash: ${query} → ${res.status} ${res.statusText}`)
    return []
  }
  const body = (await res.json()) as { results?: UnsplashPhoto[] }
  return body.results ?? []
}

/** Per-product search terms that match the narrative. */
const PRODUCT_IMAGE_QUERIES: Record<string, string> = {
  "London 3-Day Essentials": "london skyline thames",
  "Paris Sunset & Seine": "paris seine sunset",
  "Montmartre Walking Tour": "montmartre paris street",
  "LHR ↔ London Transfer (Sedan)": "luxury airport transfer car",
  "Eiffel Summit Private Access": "eiffel tower",
  "Honeymoon Package — London+Paris": "honeymoon travel romantic",
}

async function seedProductImages() {
  if (!env.UNSPLASH_ACCESS_KEY) {
    console.log("→ skipping product images (UNSPLASH_ACCESS_KEY not set)")
    return
  }
  console.log("→ seeding product images from Unsplash…")

  const PRODUCT_COVER_COUNT = 3

  for (const p of PRODUCTS) {
    const query = PRODUCT_IMAGE_QUERIES[p.name] ?? "travel landscape"

    // One request per product — enough photos to cover the product gallery
    // plus a cover image for every itinerary day.
    const photos = await fetchUnsplashPhotos(query, PRODUCT_COVER_COUNT + p.days)
    if (photos.length === 0) continue

    // Product-level gallery
    for (let idx = 0; idx < Math.min(PRODUCT_COVER_COUNT, photos.length); idx++) {
      const photo = photos[idx]!
      await db.insert(productMedia).values({
        id: newId("product_media"),
        productId: p.id,
        dayId: null,
        mediaType: "image",
        name: `${p.name} — ${idx + 1}`,
        url: photo.urls.regular,
        mimeType: "image/jpeg",
        altText:
          photo.alt_description || photo.description || `Photo by ${photo.user.name} on Unsplash`,
        sortOrder: idx,
        isCover: idx === 0,
      })
    }

    // Day-level covers — one photo per itinerary day
    const dayRows = await db
      .select({ id: productDays.id, dayNumber: productDays.dayNumber })
      .from(productDays)
      .innerJoin(productItineraries, eq(productDays.itineraryId, productItineraries.id))
      .where(eq(productItineraries.productId, p.id))
      .orderBy(asc(productDays.dayNumber))

    for (const day of dayRows) {
      const photo = photos[PRODUCT_COVER_COUNT + day.dayNumber - 1]
      if (!photo) break
      await db.insert(productMedia).values({
        id: newId("product_media"),
        productId: p.id,
        dayId: day.id,
        mediaType: "image",
        name: `${p.name} — Day ${day.dayNumber}`,
        url: photo.urls.regular,
        mimeType: "image/jpeg",
        altText:
          photo.alt_description || photo.description || `Photo by ${photo.user.name} on Unsplash`,
        sortOrder: 0,
        isCover: true,
      })
    }
  }
}

async function seedProducts() {
  console.log("→ seeding products + versions + days…")
  await db.insert(products).values(
    PRODUCTS.map((p) => ({
      id: p.id,
      name: p.name,
      bookingMode: "date" as const,
      capacityMode: "limited" as const,
      visibility: p.visibility,
      sellCurrency: p.sellCurrency,
      sellAmountCents: p.sellAmountCents,
      costAmountCents: p.costAmountCents,
      marginPercent: Math.round(
        ((p.sellAmountCents - p.costAmountCents) / p.sellAmountCents) * 100,
      ),
      facilityId: p.facilityId ?? null,
      supplierId: p.supplierIdx != null ? (SUPPLIERS[p.supplierIdx]?.id ?? null) : null,
      taxClassId: TAX_NORM_CLASS,
      description: `${p.name} — ${p.days} day${p.days > 1 ? "s" : ""} of curated experiences.`,
      timezone: p.sellCurrency === "GBP" ? "Europe/London" : "Europe/Paris",
      pax: 2,
      tags: [],
      status: p.status,
      activated: p.status === "active",
    })),
  )

  // Product versions + days
  for (const p of PRODUCTS) {
    const pverId = newId("product_versions")
    await db.insert(productVersions).values({
      id: pverId,
      productId: p.id,
      versionNumber: 1,
      snapshot: { productId: p.id, days: p.days, currency: p.sellCurrency },
      authorId: USERS[0]!.id,
      notes: "v1 — initial seed",
    })

    const itineraryId = newId("product_itineraries")
    await db.insert(productItineraries).values({
      id: itineraryId,
      productId: p.id,
      name: "Default itinerary",
      isDefault: true,
      sortOrder: 0,
    })

    for (let d = 1; d <= p.days; d++) {
      const day = p.itinerary?.[d - 1]
      await db.insert(productDays).values({
        id: newId("product_days"),
        itineraryId,
        dayNumber: d,
        title: day?.title ?? `Day ${d}`,
        description: day?.description ?? `Day ${d} itinerary highlights.`,
        location: day?.location ?? null,
      })
    }
  }

  await seedProductImages()

  // Options: rich per-product set when defined, falling back to a
  // single "Standard" option. First entry is treated as the default.
  for (const p of PRODUCTS) {
    const options = p.options ?? [{ code: "STD", name: "Standard", description: "" }]
    for (const [idx, opt] of options.entries()) {
      await db.insert(productOptions).values({
        id: newId("product_options"),
        productId: p.id,
        name: opt.name,
        code: opt.code,
        description: opt.description || null,
        isDefault: idx === 0,
        status: "active",
        sortOrder: idx,
      })
    }
  }
}

// ---------- 6b. Itinerary services + option units + price rules ----------

type SeedUnit = {
  code: "ADULT" | "CHILD" | "SENIOR"
  name: string
  unitType: "person"
  minAge?: number
  maxAge?: number
  minQuantity?: number
  /** Multiplier applied to the option's base sell/cost price. */
  priceMultiplier: number
  sortOrder: number
}

const SEED_UNITS: SeedUnit[] = [
  {
    code: "ADULT",
    name: "Adult",
    unitType: "person",
    minAge: 18,
    minQuantity: 1,
    priceMultiplier: 1,
    sortOrder: 0,
  },
  {
    code: "CHILD",
    name: "Child",
    unitType: "person",
    minAge: 2,
    maxAge: 17,
    priceMultiplier: 0.5,
    sortOrder: 1,
  },
  {
    code: "SENIOR",
    name: "Senior",
    unitType: "person",
    minAge: 65,
    priceMultiplier: 0.8,
    sortOrder: 2,
  },
]

/**
 * Pick a varied set of supplier services to attach to each itinerary day.
 * The seeded supplier services cover hotels, transfers, guides, meals, and a
 * cruise — which maps nicely to our products' days.
 */
function dayServicePlan(productName: string, dayNumber: number): number[] {
  if (productName === "LHR ↔ London Transfer (Sedan)") return [3] // transfer only
  if (productName === "Eiffel Summit Private Access") return [4] // guide
  if (productName === "Montmartre Walking Tour") return [4]
  if (productName === "Paris Sunset & Seine") return [5, 6] // cruise + meal
  if (productName === "Honeymoon Package — London+Paris") {
    // Days 1-2 London, 3-5 Paris
    if (dayNumber <= 2) return [0, 3]
    if (dayNumber === 3) return [2, 3]
    return [2, 5, 6]
  }
  if (productName === "London 3-Day Essentials") {
    if (dayNumber === 1) return [0, 3] // hotel + airport transfer in
    if (dayNumber === 2) return [1] // deluxe
    return [0] // last night
  }
  return [0]
}

async function seedItineraryServicesAndPricing() {
  console.log("→ seeding day services, option units, price catalogs + rules…")

  // Price catalogs, one per sell currency
  const CATALOGS: Record<string, string> = {
    GBP: newId("price_catalogs"),
    EUR: newId("price_catalogs"),
  }
  await db.insert(priceCatalogs).values([
    {
      id: CATALOGS.GBP!,
      code: "CAT-GBP",
      name: "GBP Published",
      currencyCode: "GBP",
      catalogType: "public",
      isDefault: true,
      active: true,
    },
    {
      id: CATALOGS.EUR!,
      code: "CAT-EUR",
      name: "EUR Published",
      currencyCode: "EUR",
      catalogType: "public",
      isDefault: true,
      active: true,
    },
  ])

  for (const p of PRODUCTS) {
    // --- Day services ---
    const dayRows = await db
      .select({ id: productDays.id, dayNumber: productDays.dayNumber })
      .from(productDays)
      .innerJoin(productItineraries, eq(productDays.itineraryId, productItineraries.id))
      .where(eq(productItineraries.productId, p.id))
      .orderBy(asc(productDays.dayNumber))

    for (const day of dayRows) {
      const plan = dayServicePlan(p.name, day.dayNumber)
      for (const [sortOrder, svcIdx] of plan.entries()) {
        const svc = SERVICES[svcIdx]
        if (!svc) continue
        await db.insert(productDayServices).values({
          id: newId("product_day_services"),
          dayId: day.id,
          supplierServiceId: svc.id,
          serviceType: svc.type,
          name: svc.name,
          costCurrency: svc.currency,
          costAmountCents: svc.amountCents,
          quantity: 1,
          sortOrder,
        })
      }
    }

    // --- Option units + price rules ---
    const optionRows = await db
      .select({ id: productOptions.id })
      .from(productOptions)
      .where(eq(productOptions.productId, p.id))

    for (const option of optionRows) {
      // Insert units
      const unitIdByCode: Record<string, string> = {}
      for (const unit of SEED_UNITS) {
        const unitId = newId("option_units")
        unitIdByCode[unit.code] = unitId
        await db.insert(optionUnits).values({
          id: unitId,
          optionId: option.id,
          name: unit.name,
          code: unit.code,
          unitType: unit.unitType,
          minAge: unit.minAge ?? null,
          maxAge: unit.maxAge ?? null,
          minQuantity: unit.minQuantity ?? null,
          isRequired: unit.code === "ADULT",
          sortOrder: unit.sortOrder,
        })
      }

      // Option-level price rule linked to the catalog matching the product currency
      const catalogId = CATALOGS[p.sellCurrency]
      if (!catalogId) continue
      const optionPriceRuleId = newId("option_price_rules")
      await db.insert(optionPriceRules).values({
        id: optionPriceRuleId,
        productId: p.id,
        optionId: option.id,
        priceCatalogId: catalogId,
        name: "Standard rate",
        pricingMode: "per_person",
        baseSellAmountCents: p.sellAmountCents,
        baseCostAmountCents: p.costAmountCents,
        allPricingCategories: true,
        isDefault: true,
        active: true,
      })

      // Per-unit tier pricing
      for (const unit of SEED_UNITS) {
        const unitId = unitIdByCode[unit.code]
        if (!unitId) continue
        await db.insert(optionUnitPriceRules).values({
          id: newId("option_unit_price_rules"),
          optionPriceRuleId,
          optionId: option.id,
          unitId,
          pricingMode: "per_unit",
          sellAmountCents: Math.round(p.sellAmountCents * unit.priceMultiplier),
          costAmountCents: Math.round(p.costAmountCents * unit.priceMultiplier),
          active: true,
          sortOrder: unit.sortOrder,
        })
      }
    }
  }
}

async function seedAvailability() {
  console.log("→ seeding availability (start times + 60 days of slots)…")

  // 4 "day" products get a start time + slot stream; multi-day products get slots per date
  for (const p of PRODUCTS) {
    const stId = newId("availability_start_times")
    await db.insert(availabilityStartTimes).values({
      id: stId,
      productId: p.id,
      startTimeLocal: p.name.includes("Sunset") ? "17:30" : "09:00",
      label: p.name.includes("Sunset") ? "Sunset departure" : "Morning departure",
      durationMinutes: p.days * 24 * 60,
      sortOrder: 0,
      active: true,
    })

    // Pickup point (applies to transfer + tours)
    if (p.facilityId) {
      await db.insert(availabilityPickupPoints).values({
        id: newId("availability_pickup_points"),
        productId: p.id,
        name: "Primary meeting point",
        facilityId: p.facilityId,
        locationText: null,
        active: true,
      })
    }

    // Generate 60 days of slots starting today
    for (let i = 0; i < 60; i++) {
      const date = daysFromNow(i)
      const dateLocal = yyyyMmDd(date)
      const [hour, minute] = (p.name.includes("Sunset") ? "17:30" : "09:00")
        .split(":")
        .map(Number) as [number, number]
      const startsAt = new Date(date)
      startsAt.setUTCHours(hour, minute, 0, 0)
      const endsAt = new Date(startsAt)
      endsAt.setUTCHours(endsAt.getUTCHours() + p.days * 24)

      await db.insert(availabilitySlots).values({
        id: newId("availability_slots"),
        productId: p.id,
        dateLocal,
        startsAt,
        endsAt,
        timezone: p.sellCurrency === "GBP" ? "Europe/London" : "Europe/Paris",
        startTimeId: stId,
        initialPax: 20,
        remainingPax: 20 - (i % 5),
        status: i % 17 === 0 ? "closed" : i % 11 === 0 ? "sold_out" : "open",
      })
    }
  }
}

// ---------- 7. Legal: policies + contracts ----------

const CANCEL_POLICY = { id: newId("policies"), versionId: newId("policy_versions") }
const CONTRACT_TMPL = newId("contract_templates")
const CONTRACT_TMPL_VERSION = newId("contract_template_versions")
const SALES_CONTRACT = newId("contracts")

async function seedLegal() {
  console.log("→ seeding policies + contracts…")

  await db.insert(policies).values({
    id: CANCEL_POLICY.id,
    kind: "cancellation",
    name: "Standard cancellation policy",
    slug: "standard-cancellation",
    description: "Tiered refund based on days before departure.",
    currentVersionId: CANCEL_POLICY.versionId,
    language: "en",
  })

  await db.insert(policyVersions).values({
    id: CANCEL_POLICY.versionId,
    policyId: CANCEL_POLICY.id,
    version: 1,
    title: "Standard cancellation — v1",
    bodyFormat: "markdown",
    body: "- 60+ days before: 100% refund.\n- 30–59 days: 50% refund.\n- 0–29 days: no refund.",
    status: "published",
    publishedAt: daysFromNow(-30),
    publishedBy: USERS[1]!.id,
  })

  await db.insert(policyRules).values([
    {
      id: newId("policy_rules"),
      policyVersionId: CANCEL_POLICY.versionId,
      ruleType: "window",
      label: "60+ days",
      daysBeforeDeparture: 60,
      refundPercent: "100",
      refundType: "cash",
      sortOrder: 0,
    },
    {
      id: newId("policy_rules"),
      policyVersionId: CANCEL_POLICY.versionId,
      ruleType: "window",
      label: "30–59 days",
      daysBeforeDeparture: 30,
      refundPercent: "50",
      refundType: "cash",
      sortOrder: 1,
    },
    {
      id: newId("policy_rules"),
      policyVersionId: CANCEL_POLICY.versionId,
      ruleType: "window",
      label: "<30 days",
      daysBeforeDeparture: 0,
      refundPercent: "0",
      refundType: "cash",
      sortOrder: 2,
    },
  ])

  // Template body uses Liquid so auto-generated contracts can iterate over
  // travelers, format dates/currency via the built-in filters, and gate
  // optional sections. The utils template renderer auto-detects `{% %}` or
  // filter syntax and switches from mustache to Liquid.
  const contractBody = `<h1>Sales Agreement — Booking {{ booking.number }}</h1>

<p>Issued on <strong>{{ contract.date | format_date: "long" }}</strong>.</p>

<h2>Lead traveler</h2>
{% if leadTraveler %}
<p>{{ leadTraveler.firstName }} {{ leadTraveler.lastName }}{% if leadTraveler.email %} &lt;{{ leadTraveler.email }}&gt;{% endif %}</p>
{% else %}
<p><em>No lead traveler on file.</em></p>
{% endif %}

<h2>Travelers ({{ travelers.size }})</h2>
<ol>
{% for t in travelers %}
  <li>{{ t.firstName }} {{ t.lastName }}{% if t.participantType != "traveler" %} — {{ t.participantType }}{% endif %}</li>
{% endfor %}
</ol>

<h2>Trip</h2>
<ul>
  <li>Start: {% if booking.startDate %}{{ booking.startDate | format_date: "long" }}{% else %}TBD{% endif %}</li>
  <li>End: {% if booking.endDate %}{{ booking.endDate | format_date: "long" }}{% else %}TBD{% endif %}</li>
  <li>Pax: {{ booking.pax | default: "TBD" }}</li>
</ul>

<h2>Total</h2>
<p><strong>{{ booking.totalAmountCents | cents: booking.currency }}</strong></p>

<p>Our standard cancellation policy applies per the attached terms.</p>`

  await db.insert(contractTemplates).values({
    id: CONTRACT_TMPL,
    name: "Customer Sales Agreement",
    slug: "customer-sales-agreement",
    scope: "customer",
    body: contractBody,
    description: "Default customer sales contract (Liquid-templated).",
    language: "en",
    active: true,
    currentVersionId: CONTRACT_TMPL_VERSION,
  })

  await db.insert(contractTemplateVersions).values({
    id: CONTRACT_TMPL_VERSION,
    templateId: CONTRACT_TMPL,
    version: 1,
    body: contractBody,
    changelog: "Initial seed",
    createdBy: USERS[1]!.id,
  })

  await db.insert(contracts).values({
    id: SALES_CONTRACT,
    scope: "customer",
    title: "Sales Agreement — Honeymoon package",
    contractNumber: "CTR-2026-00001",
    status: "executed",
    language: "en",
    renderedBodyFormat: "html",
    personId: people_ids[10]!,
  })
}

// ---------- 8. Bookings + finance ----------

const BOOKING_TEMPLATES = [
  {
    key: "b-won",
    number: "VYT-2026-00001",
    status: "confirmed" as const,
    personIdx: 10,
    productIdx: 5,
    orgId: null,
    currency: "GBP",
    sellCents: 185000,
    costCents: 120000,
    pax: 2,
    daysFromNow: 45,
  },
  {
    key: "b-hold",
    number: "VYT-2026-00002",
    status: "on_hold" as const,
    personIdx: 12,
    productIdx: 4,
    orgId: null,
    currency: "EUR",
    sellCents: 33000,
    costCents: 21000,
    pax: 2,
    daysFromNow: 30,
  },
  {
    key: "b-drafting",
    number: "VYT-2026-00003",
    status: "draft" as const,
    personIdx: 11,
    productIdx: 2,
    orgId: null,
    currency: "EUR",
    sellCents: 30000,
    costCents: 18000,
    pax: 4,
    daysFromNow: 60,
  },
  {
    key: "b-transit",
    number: "VYT-2026-00004",
    status: "confirmed" as const,
    personIdx: 0,
    productIdx: 0,
    orgId: CRM_ORGS[0]!.id,
    currency: "GBP",
    sellCents: 632000,
    costCents: 384000,
    pax: 8,
    daysFromNow: 20,
  },
  {
    key: "b-cancelled",
    number: "VYT-2026-00005",
    status: "cancelled" as const,
    personIdx: 2,
    productIdx: 3,
    orgId: CRM_ORGS[0]!.id,
    currency: "GBP",
    sellCents: 24000,
    costCents: 19000,
    pax: 2,
    daysFromNow: -5,
  },
  {
    key: "b-completed",
    number: "VYT-2026-00006",
    status: "completed" as const,
    personIdx: 13,
    productIdx: 1,
    orgId: null,
    currency: "EUR",
    sellCents: 96000,
    costCents: 64000,
    pax: 2,
    daysFromNow: -14,
  },
] as const

async function seedBookingsAndFinance() {
  console.log("→ seeding bookings + participants + finance…")

  for (let i = 0; i < BOOKING_TEMPLATES.length; i++) {
    const b = BOOKING_TEMPLATES[i]!
    const bookingId = newId("bookings")
    const product = PRODUCTS[b.productIdx]!
    const serviceDate = daysFromNow(b.daysFromNow)
    const endServiceDate = daysFromNow(b.daysFromNow + product.days)

    await db.insert(bookings).values({
      id: bookingId,
      bookingNumber: b.number,
      status: b.status,
      sourceType: b.orgId ? "api_partner" : "manual",
      personId: people_ids[b.personIdx]!,
      organizationId: b.orgId,
      sellCurrency: b.currency,
      baseCurrency: b.currency,
      sellAmountCents: b.sellCents,
      baseSellAmountCents: b.sellCents,
      costAmountCents: b.costCents,
      baseCostAmountCents: b.costCents,
      marginPercent: Math.round(((b.sellCents - b.costCents) / b.sellCents) * 100),
      startDate: yyyyMmDd(serviceDate),
      endDate: yyyyMmDd(endServiceDate),
      pax: b.pax,
      internalNotes: `Auto-seeded booking — ${b.key}.`,
      confirmedAt: b.status === "confirmed" || b.status === "completed" ? daysFromNow(-3) : null,
      cancelledAt: b.status === "cancelled" ? daysFromNow(-1) : null,
      completedAt: b.status === "completed" ? daysFromNow(-1) : null,
      holdExpiresAt: b.status === "on_hold" ? daysFromNow(5) : null,
    })

    // Extension details — populated on every booking
    await db.insert(bookingQuoteDetails).values({
      bookingId,
      quoteId: null,
      quoteVersionId: null,
    })
    await db.insert(bookingProductDetails).values({
      bookingId,
      productId: product.id,
    })
    await db.insert(bookingDistributionDetails).values({
      bookingId,
      channelId: null,
      paymentOwner: b.orgId ? "channel" : "operator",
    })

    // Participants — lead + optional companions
    const leadId = newId("booking_travelers")
    const firstName = pick(FIRST_NAMES, b.personIdx)
    const lastName = pick(LAST_NAMES, b.personIdx * 7)
    await db.insert(bookingTravelers).values({
      id: leadId,
      bookingId,
      personId: people_ids[b.personIdx]!,
      participantType: "traveler",
      travelerCategory: "adult",
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      phone: `+44 20 7123 ${(1000 + i * 37).toString().padStart(4, "0")}`,
      isPrimary: true,
    })
    for (let p = 1; p < b.pax; p++) {
      await db.insert(bookingTravelers).values({
        id: newId("booking_travelers"),
        bookingId,
        personId: null,
        participantType: "traveler",
        travelerCategory: p < 2 ? "adult" : "child",
        firstName: pick(FIRST_NAMES, i * 5 + p),
        lastName: pick(LAST_NAMES, i * 3 + p),
        email: null,
        isPrimary: false,
      })
    }

    // Booking item matching the product
    const itemId = newId("booking_items")
    await db.insert(bookingItems).values({
      id: itemId,
      bookingId,
      itemType: "unit",
      status:
        b.status === "cancelled"
          ? "cancelled"
          : b.status === "completed"
            ? "fulfilled"
            : "confirmed",
      title: product.name,
      sellCurrency: b.currency,
      unitSellAmountCents: Math.round(b.sellCents / b.pax),
      totalSellAmountCents: b.sellCents,
      costCurrency: b.currency,
      unitCostAmountCents: Math.round(b.costCents / b.pax),
      totalCostAmountCents: b.costCents,
      quantity: b.pax,
      productId: product.id,
      serviceDate: yyyyMmDd(serviceDate),
      startsAt: serviceDate,
      endsAt: endServiceDate,
    })

    // Booking item extension detail
    await db.insert(bookingItemProductDetails).values({
      bookingItemId: itemId,
      productId: product.id,
    })

    await db.insert(bookingItemTravelers).values({
      id: newId("booking_item_travelers"),
      bookingItemId: itemId,
      travelerId: leadId,
      role: "traveler",
      isPrimary: true,
    })

    // Supplier statuses (1-2 suppliers per booking)
    await db.insert(bookingSupplierStatuses).values({
      id: newId("booking_supplier_statuses"),
      bookingId,
      serviceName: SERVICES[0]!.name,
      costCurrency: b.currency,
      costAmountCents: Math.round(b.costCents * 0.6),
      supplierServiceId: SERVICES[0]!.id,
      supplierReference: `SUP-REF-${1000 + i}`,
      status: b.status === "confirmed" || b.status === "completed" ? "confirmed" : "pending",
      confirmedAt: b.status === "confirmed" || b.status === "completed" ? daysFromNow(-2) : null,
    })

    // Notes + activity log + a document
    await db.insert(bookingNotes).values({
      id: newId("booking_notes"),
      bookingId,
      authorId: USERS[2]!.id,
      content: `Seeded note for ${b.number} — status ${b.status}.`,
    })
    await db.insert(bookingActivityLog).values([
      {
        id: newId("booking_activity_log"),
        bookingId,
        activityType: "booking_created",
        description: "Booking created via seed.",
        actorId: USERS[0]!.id,
      },
      {
        id: newId("booking_activity_log"),
        bookingId,
        activityType: "status_change",
        description: `Status → ${b.status}`,
        actorId: USERS[0]!.id,
      },
    ])
    if (b.status === "confirmed" || b.status === "completed") {
      await db.insert(bookingDocuments).values({
        id: newId("booking_documents"),
        bookingId,
        type: "other",
        fileName: `${b.number}-voucher.pdf`,
        fileUrl: `/v1/admin/media/seed/${b.number}-voucher.pdf`,
      })
    }

    // Finance: payment schedule + guarantee + invoice (for confirmed & completed)
    const needsInvoice = b.status === "confirmed" || b.status === "completed"
    const depositCents = Math.round(b.sellCents * 0.25)
    const balanceCents = b.sellCents - depositCents

    await db.insert(bookingPaymentSchedules).values([
      {
        id: newId("booking_payment_schedules"),
        bookingId,
        type: "deposit",
        dueDate: yyyyMmDd(daysFromNow(-5)),
        currency: b.currency,
        amountCents: depositCents,
        status: b.status === "cancelled" ? "cancelled" : needsInvoice ? "paid" : "pending",
      },
      {
        id: newId("booking_payment_schedules"),
        bookingId,
        type: "balance",
        dueDate: yyyyMmDd(daysFromNow(b.daysFromNow - 14)),
        currency: b.currency,
        amountCents: balanceCents,
        status:
          b.status === "completed" ? "paid" : b.status === "cancelled" ? "cancelled" : "pending",
      },
    ])

    if (b.status !== "cancelled") {
      await db.insert(bookingGuarantees).values({
        id: newId("booking_guarantees"),
        bookingId,
        guaranteeType: "card_on_file",
        currency: b.currency,
        amountCents: depositCents,
        status: needsInvoice ? "active" : "pending",
        notes: "Seeded card on file",
      })
    }

    // Every booking except drafts gets an invoice; cancelled ones get a credit note too.
    if (b.status !== "draft") {
      const invId = newId("invoices")
      const subtotal = Math.round(b.sellCents / 1.2)
      const tax = b.sellCents - subtotal
      const paid =
        b.status === "completed" ? b.sellCents : b.status === "cancelled" ? depositCents : 0
      const invStatus =
        b.status === "completed" ? "paid" : b.status === "cancelled" ? "void" : "issued"
      await db.insert(invoices).values({
        id: invId,
        invoiceNumber: `INV-2026-${(10000 + i).toString().padStart(5, "0")}`,
        invoiceType: "invoice",
        seriesId: INV_SERIES,
        templateId: INV_TMPL,
        taxRegimeId: TAX_NORM_REGIME,
        language: "en",
        bookingId,
        personId: people_ids[b.personIdx]!,
        organizationId: b.orgId,
        currency: b.currency,
        status: invStatus,
        subtotalCents: subtotal,
        taxCents: tax,
        totalCents: b.sellCents,
        paidCents: paid,
        balanceDueCents: b.sellCents - paid,
        issueDate: yyyyMmDd(daysFromNow(-5)),
        dueDate: yyyyMmDd(daysFromNow(b.daysFromNow - 7)),
        notes: `Invoice for booking ${b.number}`,
      })
      await db.insert(invoiceLineItems).values({
        id: newId("invoice_line_items"),
        invoiceId: invId,
        bookingItemId: itemId,
        description: `${product.name} — ${b.pax} pax`,
        quantity: b.pax,
        unitPriceCents: Math.round(b.sellCents / b.pax),
        totalCents: b.sellCents,
        taxRate: 20,
        sortOrder: 0,
      })
      if (b.status === "completed") {
        await db.insert(payments).values({
          id: newId("payments"),
          invoiceId: invId,
          amountCents: b.sellCents,
          currency: b.currency,
          paymentMethod: "credit_card",
          status: "completed",
          referenceNumber: `CH_SEED_${i}`,
          paymentDate: yyyyMmDd(daysFromNow(-1)),
        })
      }
      if (b.status === "cancelled") {
        const cnId = newId("credit_notes")
        await db.insert(creditNotes).values({
          id: cnId,
          creditNoteNumber: `CN-2026-${(10000 + i).toString().padStart(5, "0")}`,
          invoiceId: invId,
          currency: b.currency,
          status: "issued",
          amountCents: depositCents,
          reason: "Customer-initiated cancellation",
        })
        await db.insert(creditNoteLineItems).values({
          id: newId("credit_note_line_items"),
          creditNoteId: cnId,
          description: "Deposit refund",
          quantity: 1,
          unitPriceCents: depositCents,
          totalCents: depositCents,
          sortOrder: 0,
        })
      }
    }

    // Policy acceptance attached to first confirmed booking
    if (b.key === "b-won") {
      await db.insert(policyAcceptances).values({
        id: newId("policy_acceptances"),
        policyVersionId: CANCEL_POLICY.versionId,
        personId: people_ids[b.personIdx]!,
        bookingId,
        acceptedBy: people_ids[b.personIdx]!,
        method: "explicit_checkbox",
      })
    }
  }
}

// ---------- Catalog verticals (extras / cruises / charters / accommodations) ----------

async function seedCatalogVerticals() {
  console.log("→ seeding catalog verticals (extras, cruises, charters, accommodations)…")
  const ctx = {
    sellerOperatorId: process.env.TENANT_ID ?? "default",
    supplierIds: SUPPLIERS.map((s) => s.id),
    facilityIds: Object.values(FACILITIES),
  }
  const extrasIds = await seedExtras(db, ctx)
  const cruiseIds = await seedCruises(db, ctx)
  const charterIds = await seedCharters(db, ctx)
  const roomIds = await seedAccommodationRooms(db, ctx)
  console.log(
    `  · extras: ${extrasIds.length}, cruises: ${cruiseIds.length}, charters: ${charterIds.length}, rooms: ${roomIds.length}`,
  )
}

async function seedFlightsReference() {
  console.log("→ seeding flights reference data (airlines + airports + aircraft)…")
  const airlineCount = await seedAirlines(db)
  const airportCount = await seedAirports(db)
  const aircraftCount = await seedAircraft(db)
  console.log(
    `  · airlines: ${airlineCount}, airports: ${airportCount}, aircraft: ${aircraftCount}`,
  )
}

// ---------- Run ----------

async function main() {
  console.log(`Seeding → ${DATABASE_URL}`)
  console.time("seed")

  try {
    await reset()
    await seedAuth()
    await seedMarketsAndFinanceSetup()
    await seedFacilities()
    await seedSuppliers()
    await seedCrm()
    await seedProducts()
    await seedItineraryServicesAndPricing()
    await seedAvailability()
    await seedLegal()
    await seedBookingsAndFinance()
    await seedCatalogVerticals()
    await seedFlightsReference()

    console.timeEnd("seed")
    console.log("\n✓ Seed complete. Sign in with:")
    for (const u of USERS) {
      console.log(`    ${u.email} / ${u.password}`)
    }
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error("\n✗ Seed failed:", err)
  process.exit(1)
})
