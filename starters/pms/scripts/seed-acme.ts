// @ts-nocheck -- demo fixture: deep-imports workspace service sources; loose typing is intentional.
// agent-quality: file-size exception -- the Acme Hotels demo dataset stays in one file for a reproducible reset.
/**
 * Acme Hotels — realistic PMS demo dataset.
 *
 * Seeds a fictitious 3-property hotel group ("Acme Hotels") and exercises the
 * first-party PMS package services end-to-end so the seed doubles as an
 * integration test:
 *
 *   • operations   — property group, facilities (+ addresses, features), properties (RAW inserts; no authoring service upstream)
 *   • pms-ari       — room types, meal plans, rate plans (+ room-type joins), daily rates + pooled inventory
 *   • pms-units     — physical room units (serialized) with DERIVED daily inventory (recompute)
 *   • bookings      — ~40 guest stays across the lifecycle (persistStayBooking, the single owned-stay write path)
 *   • pms-front-desk— unit assignments + check-in + no-show
 *   • pms-housekeeping — auto-generated tasks, room statuses, maintenance blocks
 *   • pms-folios    — business dates, night audit (open folios + posted nights), a settled past folio
 *
 * Idempotency: WIPE-AND-RESEED. The script TRUNCATEs every table it writes to
 * (CASCADE) before inserting, so re-running produces a clean, non-duplicated
 * dataset. This DB is the dedicated local PMS demo database (see compose.yaml).
 *
 * Run:   pnpm --filter pms-admin seed:acme
 * Target: DATABASE_URL from starters/pms/.dev.vars
 *
 * After seeding, run `pnpm --filter pms-admin reindex` so storefront search
 * returns the properties' room types.
 */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { stayBookingItems } from "@voyant-travel/accommodations/schema"
import { bookingItems } from "@voyant-travel/bookings"
import { bookings } from "@voyant-travel/bookings/schema"
import { newId } from "@voyant-travel/db/lib/typeid"
import {
  facilities,
  facilityAddressProjections,
  facilityFeatures,
  properties,
  propertyGroupMembers,
  propertyGroups,
} from "@voyant-travel/operations/places"
import { financeService } from "@voyant-travel/finance"
import { businessDates, folios } from "@voyant-travel/pms-folios/schema"
import { and, eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

// PMS package service sources (deep-imported: most write functions are not on
// the package `.` barrel, and the exports map only exposes `.`/`./schema`).
import {
  attachRatePlanRoomType,
  createBedConfig,
  createMealPlan,
  createRatePlan,
  createRoomType,
} from "../../../packages/ari/src/service-crud.js"
import { bulkUpsertInventory, bulkUpsertRates } from "../../../packages/ari/src/service-calendar.js"
import { checkIn, noShow } from "../../../packages/front-desk/src/service-ops.js"
import { generateTasksForDate } from "../../../packages/housekeeping/src/service-generation.js"
import { createMaintenanceBlock } from "../../../packages/housekeeping/src/service-maintenance.js"
import { setRoomStatus } from "../../../packages/housekeeping/src/service-room-status.js"
import { openFolio } from "../../../packages/folios/src/service-folios.js"
import {
  getOrInitBusinessDate,
  runNightAudit,
} from "../../../packages/folios/src/service-night-audit.js"
import { createPosting } from "../../../packages/folios/src/service-postings.js"
import { assignUnit } from "../../../packages/units/src/service-assignments.js"
import { createRoomUnit } from "../../../packages/units/src/service-units.js"

import { persistStayBooking } from "../src/api/lib/persist-stay-booking.js"

// ───────────────────────── Env & DB ─────────────────────────

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = resolve(SCRIPT_DIR, "..")

function parseDotEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (const rawLine of readFileSync(path, "utf8").split("\n")) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue
      const eq = line.indexOf("=")
      if (eq === -1) continue
      out[line.slice(0, eq).trim()] = line
        .slice(eq + 1)
        .trim()
        .replace(/^"(.*)"$/, "$1")
    }
  } catch {
    // missing file — fine
  }
  return out
}

function loadEnv(): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const file of [
    resolve(TEMPLATE_DIR, ".env"),
    resolve(TEMPLATE_DIR, "../../.env"),
    resolve(TEMPLATE_DIR, "../../.env.local"),
    resolve(TEMPLATE_DIR, ".dev.vars"),
  ]) {
    Object.assign(merged, parseDotEnv(file))
  }
  return merged
}

const env = { ...loadEnv(), ...process.env }
const DATABASE_URL = env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set (checked .dev.vars and process.env)")
  process.exit(1)
}

const sqlClient = postgres(DATABASE_URL, { max: 1, onnotice: () => {} })
const db = drizzle(sqlClient)

const EUR = "EUR"

// ───────────────────────── Date helpers (UTC) ─────────────────────────

function today(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
const TODAY = today()
function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}
function isoOffset(days: number): string {
  return iso(addDays(TODAY, days))
}
/** Inclusive list of ISO dates for the nights of a stay (checkIn … checkOut-1). */
function nightsOf(checkIn: string, checkOut: string): string[] {
  const out: string[] = []
  let d = new Date(`${checkIn}T00:00:00Z`)
  const end = new Date(`${checkOut}T00:00:00Z`)
  while (d < end) {
    out.push(iso(d))
    d = addDays(d, 1)
  }
  return out
}

// ───────────────────────── Pricing model ─────────────────────────
//
// Nightly rate = base × plan modifier, then seasonal (Seaside summer ×1.6),
// then weekend uplift (Grand + Seaside, Fri/Sat +15%). Booking prices are
// computed with the SAME function so folio/booking totals match the calendar.

type PropertyKey = "grand" | "seaside" | "city"
type PlanKind = "bb" | "nr" | "hb" | "flex_ro" | "weekly"

function nightlyCents(
  propertyKey: PropertyKey,
  baseCents: number,
  plan: PlanKind,
  isoDate: string,
): number {
  let v = baseCents
  if (plan === "nr") v = Math.round(baseCents * 0.85)
  else if (plan === "hb") v = baseCents + 3000 // +€30/night half-board supplement
  else if (plan === "weekly") v = Math.round(baseCents * 0.8) // apartments weekly, non-refundable
  const d = new Date(`${isoDate}T00:00:00Z`)
  const month = d.getUTCMonth() + 1
  const dow = d.getUTCDay() // 0=Sun … 6=Sat
  if (propertyKey === "seaside" && (month === 6 || month === 7 || month === 8)) {
    v = Math.round(v * 1.6)
  }
  if ((propertyKey === "grand" || propertyKey === "seaside") && (dow === 5 || dow === 6)) {
    v = Math.round(v * 1.15)
  }
  return v
}

// ───────────────────────── Reset ─────────────────────────

const WIPE_TABLES = [
  // Finance reference data (invoice number series)
  "invoice_number_series",
  // PMS overlays first (loose refs to bookings/units/properties)
  "pms_folio_postings",
  "pms_folios",
  "pms_business_dates",
  "pms_housekeeping_tasks",
  "pms_unit_room_status",
  "pms_maintenance_blocks",
  "pms_stay_ops",
  "pms_unit_assignments",
  "pms_room_units",
  // Bookings (cascades booking_items, travelers, stay_booking_items, stay_daily_rates)
  "bookings",
  // Accommodations authoring
  "rate_plan_daily_rates",
  "rate_plan_room_types",
  "room_type_daily_inventory",
  "room_type_bed_configs",
  "rate_plans",
  "meal_plans",
  "room_types",
  // Operations
  "property_group_members",
  "properties",
  "facility_features",
  "facility_operation_schedules",
  "facility_address_projections",
  "facilities",
  "property_groups",
]

async function reset() {
  console.log("→ truncating Acme demo tables…")
  await sqlClient.unsafe(
    `TRUNCATE TABLE ${WIPE_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  )
}

// ───────────────────────── Property definitions ─────────────────────────

interface RoomTypeDef {
  code: string
  name: string
  description: string
  roomClass: string
  maxAdults: number
  maxChildren: number
  standardOccupancy: number
  maxOccupancy: number
  bedroomCount: number
  bathroomCount: number
  areaValue: number
  baseCents: number
  beds: { bedType: string; quantity: number }[]
}

interface RatePlanDef {
  code: string
  name: string
  description: string
  plan: PlanKind
  meal: "RO" | "BB" | "HB"
  refundable: boolean
  guaranteeMode: "none" | "card_hold" | "deposit" | "full_prepay"
}

interface MealPlanDef {
  code: "RO" | "BB" | "HB"
  name: string
  includesBreakfast: boolean
  includesDinner: boolean
}

interface UnitBlock {
  code: string // room type code
  floor: number
  from: number // first room number on floor
  count: number
}

interface PropertyDef {
  key: PropertyKey
  facilityKind: "hotel" | "resort"
  propertyType: "hotel" | "resort" | "apartment"
  facilityCode: string
  name: string
  brandName: string
  description: string
  timezone: string
  rating: number | null
  address: {
    line1: string
    city: string
    region: string
    postalCode: string
    country: string
    latitude: number
    longitude: number
  }
  features: { category: string; name: string; highlighted?: boolean }[]
  inventoryMode: "serialized" | "pooled"
  roomTypes: RoomTypeDef[]
  meals: MealPlanDef[]
  ratePlans: RatePlanDef[]
  units?: UnitBlock[] // serialized
  pooledCapacity?: Record<string, number> // pooled: code → capacity
}

const MEALS_FULL: MealPlanDef[] = [
  { code: "RO", name: "Room Only", includesBreakfast: false, includesDinner: false },
  { code: "BB", name: "Bed & Breakfast", includesBreakfast: true, includesDinner: false },
  { code: "HB", name: "Half Board", includesBreakfast: true, includesDinner: true },
]
const MEALS_BB: MealPlanDef[] = [MEALS_FULL[0], MEALS_FULL[1]]
const MEALS_RO: MealPlanDef[] = [MEALS_FULL[0]]

const PROPERTIES: PropertyDef[] = [
  {
    key: "grand",
    facilityKind: "hotel",
    propertyType: "hotel",
    facilityCode: "ACME-GRAND",
    name: "Acme Grand Hotel",
    brandName: "Acme Hotels",
    description:
      "Landmark five-star hotel on Calea Victoriei in the heart of Bucharest, blending Belle Époque architecture with a rooftop spa and fine-dining brasserie.",
    timezone: "Europe/Bucharest",
    rating: 5,
    address: {
      line1: "Calea Victoriei 12",
      city: "Bucharest",
      region: "Bucharest",
      postalCode: "010061",
      country: "RO",
      latitude: 44.4361,
      longitude: 26.0973,
    },
    features: [
      { category: "amenity", name: "Free WiFi", highlighted: true },
      { category: "amenity", name: "Rooftop spa & indoor pool", highlighted: true },
      { category: "amenity", name: "Fine-dining brasserie" },
      { category: "amenity", name: "24h fitness centre" },
      { category: "amenity", name: "Valet parking" },
      { category: "service", name: "24h concierge" },
      { category: "amenity", name: "Business centre" },
    ],
    inventoryMode: "serialized",
    roomTypes: [
      {
        code: "CLD",
        name: "Classic Double",
        description:
          "Elegant 24 m² double with a queen bed, city outlook and a marble bathroom with rainfall shower.",
        roomClass: "standard",
        maxAdults: 2,
        maxChildren: 1,
        standardOccupancy: 2,
        maxOccupancy: 3,
        bedroomCount: 1,
        bathroomCount: 1,
        areaValue: 24,
        baseCents: 12000,
        beds: [{ bedType: "queen", quantity: 1 }],
      },
      {
        code: "TWS",
        name: "Twin Superior",
        description:
          "Bright 26 m² twin with two single beds and a seating nook — ideal for friends or colleagues.",
        roomClass: "superior",
        maxAdults: 2,
        maxChildren: 0,
        standardOccupancy: 2,
        maxOccupancy: 2,
        bedroomCount: 1,
        bathroomCount: 1,
        areaValue: 26,
        baseCents: 13500,
        beds: [{ bedType: "single", quantity: 2 }],
      },
      {
        code: "DLK",
        name: "Deluxe King",
        description:
          "Spacious 32 m² king room on a high floor with a lounge chair, Nespresso and evening turndown.",
        roomClass: "deluxe",
        maxAdults: 2,
        maxChildren: 1,
        standardOccupancy: 2,
        maxOccupancy: 3,
        bedroomCount: 1,
        bathroomCount: 1,
        areaValue: 32,
        baseCents: 18000,
        beds: [{ bedType: "king", quantity: 1 }],
      },
      {
        code: "JRS",
        name: "Junior Suite",
        description:
          "45 m² junior suite with a separate sitting area, king bed and a deep soaking tub overlooking the old town.",
        roomClass: "suite",
        maxAdults: 2,
        maxChildren: 2,
        standardOccupancy: 2,
        maxOccupancy: 4,
        bedroomCount: 1,
        bathroomCount: 1,
        areaValue: 45,
        baseCents: 32000,
        beds: [{ bedType: "king", quantity: 1 }, { bedType: "sofa", quantity: 1 }],
      },
      {
        code: "PRES",
        name: "Presidential Suite",
        description:
          "95 m² top-floor suite with a grand salon, dining room, dressing room and a private terrace over Calea Victoriei.",
        roomClass: "suite",
        maxAdults: 2,
        maxChildren: 2,
        standardOccupancy: 2,
        maxOccupancy: 4,
        bedroomCount: 2,
        bathroomCount: 2,
        areaValue: 95,
        baseCents: 85000,
        beds: [{ bedType: "king", quantity: 1 }, { bedType: "queen", quantity: 1 }],
      },
    ],
    meals: MEALS_FULL,
    ratePlans: [
      {
        code: "FLEX-BB",
        name: "Flexible — Bed & Breakfast",
        description: "Fully flexible rate with breakfast included; free cancellation up to 24h.",
        plan: "bb",
        meal: "BB",
        refundable: true,
        guaranteeMode: "card_hold",
      },
      {
        code: "NR-RO",
        name: "Non-refundable — Room Only",
        description: "Best available non-refundable rate, room only. Prepaid, non-cancellable.",
        plan: "nr",
        meal: "RO",
        refundable: false,
        guaranteeMode: "full_prepay",
      },
      {
        code: "HB-FLEX",
        name: "Half Board — Flexible",
        description: "Flexible rate with breakfast and dinner at the brasserie included.",
        plan: "hb",
        meal: "HB",
        refundable: true,
        guaranteeMode: "card_hold",
      },
    ],
    units: [
      { code: "CLD", floor: 1, from: 101, count: 12 },
      { code: "CLD", floor: 2, from: 201, count: 6 },
      { code: "TWS", floor: 2, from: 207, count: 6 },
      { code: "TWS", floor: 3, from: 301, count: 8 },
      { code: "DLK", floor: 3, from: 309, count: 6 },
      { code: "DLK", floor: 4, from: 401, count: 10 },
      { code: "JRS", floor: 5, from: 501, count: 10 },
      { code: "PRES", floor: 6, from: 601, count: 2 },
    ],
  },
  {
    key: "seaside",
    facilityKind: "resort",
    propertyType: "resort",
    facilityCode: "ACME-SEASIDE",
    name: "Acme Seaside Resort",
    brandName: "Acme Hotels",
    description:
      "Four-star beachfront resort on the Mamaia strip in Constanța, with direct private-beach access, outdoor pools and a seafood terrace.",
    timezone: "Europe/Bucharest",
    rating: 4,
    address: {
      line1: "Bulevardul Mamaia 250",
      city: "Constanța",
      region: "Constanța",
      postalCode: "900001",
      country: "RO",
      latitude: 44.2456,
      longitude: 28.6216,
    },
    features: [
      { category: "amenity", name: "Free WiFi", highlighted: true },
      { category: "amenity", name: "Private beach access", highlighted: true },
      { category: "amenity", name: "Two outdoor pools" },
      { category: "amenity", name: "Seafood terrace restaurant" },
      { category: "amenity", name: "Kids club & playground" },
      { category: "amenity", name: "Free parking" },
    ],
    inventoryMode: "serialized",
    roomTypes: [
      {
        code: "GRD",
        name: "Garden Double",
        description: "26 m² double opening onto the resort gardens, a short stroll from the pools.",
        roomClass: "standard",
        maxAdults: 2,
        maxChildren: 1,
        standardOccupancy: 2,
        maxOccupancy: 3,
        bedroomCount: 1,
        bathroomCount: 1,
        areaValue: 26,
        baseCents: 8500,
        beds: [{ bedType: "queen", quantity: 1 }],
      },
      {
        code: "SVD",
        name: "Sea View Double",
        description: "28 m² double with a furnished balcony and uninterrupted Black Sea views.",
        roomClass: "superior",
        maxAdults: 2,
        maxChildren: 1,
        standardOccupancy: 2,
        maxOccupancy: 3,
        bedroomCount: 1,
        bathroomCount: 1,
        areaValue: 28,
        baseCents: 11000,
        beds: [{ bedType: "queen", quantity: 1 }],
      },
      {
        code: "FAM",
        name: "Family Studio",
        description:
          "40 m² studio sleeping four, with a kitchenette, sofa bed and a balcony facing the gardens.",
        roomClass: "family",
        maxAdults: 2,
        maxChildren: 2,
        standardOccupancy: 3,
        maxOccupancy: 4,
        bedroomCount: 1,
        bathroomCount: 1,
        areaValue: 40,
        baseCents: 15000,
        beds: [{ bedType: "queen", quantity: 1 }, { bedType: "sofa", quantity: 1 }],
      },
      {
        code: "PEN",
        name: "Penthouse Suite",
        description:
          "70 m² top-floor suite with a wraparound sea-view terrace, living room and a whirlpool tub.",
        roomClass: "suite",
        maxAdults: 2,
        maxChildren: 2,
        standardOccupancy: 2,
        maxOccupancy: 4,
        bedroomCount: 1,
        bathroomCount: 1,
        areaValue: 70,
        baseCents: 40000,
        beds: [{ bedType: "king", quantity: 1 }],
      },
    ],
    meals: MEALS_BB,
    ratePlans: [
      {
        code: "FLEX-BB",
        name: "Flexible — Bed & Breakfast",
        description: "Flexible rate with breakfast buffet included; free cancellation up to 48h.",
        plan: "bb",
        meal: "BB",
        refundable: true,
        guaranteeMode: "card_hold",
      },
      {
        code: "NR-RO",
        name: "Non-refundable — Room Only",
        description: "Prepaid non-refundable rate, room only.",
        plan: "nr",
        meal: "RO",
        refundable: false,
        guaranteeMode: "full_prepay",
      },
    ],
    units: [
      { code: "GRD", floor: 1, from: 101, count: 12 },
      { code: "SVD", floor: 2, from: 201, count: 8 },
      { code: "SVD", floor: 3, from: 301, count: 6 },
      { code: "FAM", floor: 3, from: 307, count: 4 },
      { code: "FAM", floor: 4, from: 401, count: 6 },
      { code: "PEN", floor: 4, from: 407, count: 4 },
    ],
  },
  {
    key: "city",
    facilityKind: "hotel",
    propertyType: "apartment",
    facilityCode: "ACME-CITY",
    name: "Acme City Apartments",
    brandName: "Acme Hotels",
    description:
      "Self-catering serviced apartments in central Cluj-Napoca, a few minutes from Piața Unirii, with self check-in and weekly housekeeping.",
    timezone: "Europe/Bucharest",
    rating: 3,
    address: {
      line1: "Strada Memorandumului 8",
      city: "Cluj-Napoca",
      region: "Cluj",
      postalCode: "400114",
      country: "RO",
      latitude: 46.7693,
      longitude: 23.5893,
    },
    features: [
      { category: "amenity", name: "Free WiFi", highlighted: true },
      { category: "amenity", name: "Full kitchenette", highlighted: true },
      { category: "amenity", name: "Washing machine" },
      { category: "service", name: "Self check-in" },
      { category: "amenity", name: "Street parking permit" },
    ],
    inventoryMode: "pooled",
    roomTypes: [
      {
        code: "STU",
        name: "Studio Apartment",
        description: "Open-plan 30 m² studio with a full kitchenette and a queen bed.",
        roomClass: "studio",
        maxAdults: 2,
        maxChildren: 1,
        standardOccupancy: 2,
        maxOccupancy: 2,
        bedroomCount: 0,
        bathroomCount: 1,
        areaValue: 30,
        baseCents: 5500,
        beds: [{ bedType: "queen", quantity: 1 }],
      },
      {
        code: "ONEBR",
        name: "One-Bedroom Apartment",
        description: "45 m² apartment with a separate bedroom, living room and full kitchen.",
        roomClass: "apartment",
        maxAdults: 2,
        maxChildren: 2,
        standardOccupancy: 2,
        maxOccupancy: 4,
        bedroomCount: 1,
        bathroomCount: 1,
        areaValue: 45,
        baseCents: 9000,
        beds: [{ bedType: "queen", quantity: 1 }, { bedType: "sofa", quantity: 1 }],
      },
      {
        code: "TWOBR",
        name: "Two-Bedroom Apartment",
        description: "65 m² family apartment with two bedrooms, two bathrooms and a full kitchen.",
        roomClass: "apartment",
        maxAdults: 4,
        maxChildren: 2,
        standardOccupancy: 4,
        maxOccupancy: 6,
        bedroomCount: 2,
        bathroomCount: 2,
        areaValue: 65,
        baseCents: 14000,
        beds: [{ bedType: "queen", quantity: 2 }],
      },
    ],
    meals: MEALS_RO,
    ratePlans: [
      {
        code: "FLEX-RO",
        name: "Flexible — Room Only",
        description: "Flexible self-catering rate; free cancellation up to 72h.",
        plan: "flex_ro",
        meal: "RO",
        refundable: true,
        guaranteeMode: "card_hold",
      },
      {
        code: "WEEKLY-RO",
        name: "Weekly Stay — Room Only",
        description: "Discounted non-refundable rate for stays of a week or more.",
        plan: "weekly",
        meal: "RO",
        refundable: false,
        guaranteeMode: "full_prepay",
      },
    ],
    pooledCapacity: { STU: 8, ONEBR: 6, TWOBR: 4 },
  },
]

// ───────────────────────── Seeded-entity registry ─────────────────────────

interface SeededProperty {
  key: PropertyKey
  facilityId: string
  propertyId: string
  def: PropertyDef
  roomTypeIds: Record<string, string> // code → room_type id
  ratePlanIds: Record<string, string> // code → rate_plan id
  mealPlanIds: Record<string, string> // code → meal_plan id
  unitIdsByType: Record<string, string[]> // code → unit ids (serialized)
}

const seeded: Record<PropertyKey, SeededProperty> = {} as any

// Placeholder hero images (stable seeds) — property-level content for cards.
const HERO = {
  grand: "https://picsum.photos/seed/acme-grand/800/500",
  seaside: "https://picsum.photos/seed/acme-seaside/800/500",
  city: "https://picsum.photos/seed/acme-city/800/500",
}

// ───────────────────────── Operations (raw inserts) ─────────────────────────

async function seedOperations() {
  console.log("→ operations: property group, facilities, properties…")
  const groupId = newId("property_groups")
  await db.insert(propertyGroups).values({
    id: groupId,
    groupType: "management_company",
    status: "active",
    name: "Acme Hotels",
    code: "ACME-GROUP",
    brandName: "Acme Hotels",
    legalName: "Acme Hospitality Group SRL",
    website: "https://acmehotels.example",
    notes: "Fictitious demo hotel group used by the Voyant PMS starter.",
  })

  for (const def of PROPERTIES) {
    const facilityId = newId("facilities")
    const propertyId = newId("properties")

    await db.insert(facilities).values({
      id: facilityId,
      kind: def.facilityKind,
      status: "active",
      name: def.name,
      code: def.facilityCode,
      description: def.description,
      timezone: def.timezone,
      ownerType: "internal",
      tags: [def.key, "acme", def.address.city.toLowerCase()],
    })

    await db.insert(facilityAddressProjections).values({
      facilityId,
      fullText: `${def.address.line1}, ${def.address.city}, ${def.address.country}`,
      line1: def.address.line1,
      city: def.address.city,
      region: def.address.region,
      postalCode: def.address.postalCode,
      country: def.address.country,
      latitude: def.address.latitude,
      longitude: def.address.longitude,
    })

    await db.insert(facilityFeatures).values(
      def.features.map((f, i) => ({
        id: newId("facility_features"),
        facilityId,
        category: f.category,
        name: f.name,
        highlighted: f.highlighted ?? false,
        sortOrder: i * 10,
      })),
    )

    await db.insert(properties).values({
      id: propertyId,
      facilityId,
      propertyType: def.propertyType,
      brandName: def.brandName,
      groupName: "Acme Hotels",
      rating: def.rating,
      ratingScale: def.rating == null ? null : 5,
      checkInTime: "15:00",
      checkOutTime: "11:00",
      policyNotes:
        "Check-in from 15:00, check-out by 11:00. Valid photo ID required at check-in.",
      amenityNotes: def.features.map((f) => f.name).join(", "),
    })

    await db.insert(propertyGroupMembers).values({
      id: newId("property_group_members"),
      groupId,
      propertyId,
      membershipRole: def.key === "grand" ? "flagship" : "managed",
      isPrimary: def.key === "grand",
    })

    seeded[def.key] = {
      key: def.key,
      facilityId,
      propertyId,
      def,
      roomTypeIds: {},
      ratePlanIds: {},
      mealPlanIds: {},
      unitIdsByType: {},
    }
  }
}

// ───────────────────────── ARI: room types, meals, rate plans, rates ─────────

async function seedAri() {
  console.log("→ ari: room types, meal plans, rate plans…")
  for (const def of PROPERTIES) {
    const p = seeded[def.key]

    // meal plans
    for (let i = 0; i < def.meals.length; i++) {
      const m = def.meals[i]
      const row = await createMealPlan(db, {
        propertyId: p.propertyId,
        code: m.code,
        name: m.name,
        includesBreakfast: m.includesBreakfast,
        includesDinner: m.includesDinner,
        sortOrder: i * 10,
      })
      p.mealPlanIds[m.code] = row.id
    }

    // room types (+ bed configs)
    for (let i = 0; i < def.roomTypes.length; i++) {
      const rt = def.roomTypes[i]
      const row = await createRoomType(db, {
        propertyId: p.propertyId,
        code: rt.code,
        name: rt.name,
        description: rt.description,
        inventoryMode: def.inventoryMode,
        roomClass: rt.roomClass,
        maxAdults: rt.maxAdults,
        maxChildren: rt.maxChildren,
        maxInfants: 1,
        standardOccupancy: rt.standardOccupancy,
        maxOccupancy: rt.maxOccupancy,
        minOccupancy: 1,
        bedroomCount: rt.bedroomCount,
        bathroomCount: rt.bathroomCount,
        areaValue: rt.areaValue,
        areaUnit: "m2",
        smokingAllowed: false,
        active: true,
        sortOrder: i * 10,
        metadata: { thumbnailUrl: HERO[def.key] },
      })
      p.roomTypeIds[rt.code] = row.id
      for (let b = 0; b < rt.beds.length; b++) {
        await createBedConfig(db, row.id, {
          bedType: rt.beds[b].bedType,
          quantity: rt.beds[b].quantity,
          isPrimary: b === 0,
        })
      }
    }

    // rate plans (+ attach every room type)
    for (let i = 0; i < def.ratePlans.length; i++) {
      const rp = def.ratePlans[i]
      const row = await createRatePlan(db, {
        propertyId: p.propertyId,
        code: rp.code,
        name: rp.name,
        description: rp.description,
        mealPlanId: p.mealPlanIds[rp.meal],
        currencyCode: EUR,
        chargeFrequency: "per_night",
        guaranteeMode: rp.guaranteeMode,
        commissionable: true,
        refundable: rp.refundable,
        active: true,
        sortOrder: i * 10,
      })
      p.ratePlanIds[rp.code] = row.id
      for (let j = 0; j < def.roomTypes.length; j++) {
        await attachRatePlanRoomType(db, row.id, {
          roomTypeId: p.roomTypeIds[def.roomTypes[j].code],
          active: true,
          sortOrder: j * 10,
        })
      }
    }
  }
}

async function seedRates() {
  console.log("→ ari: daily rates (today-30 … today+180)…")
  const from = -30
  const to = 180
  const rateOps: any[] = []
  for (const def of PROPERTIES) {
    const p = seeded[def.key]
    for (const rp of def.ratePlans) {
      for (const rt of def.roomTypes) {
        for (let d = from; d <= to; d++) {
          const date = isoOffset(d)
          rateOps.push({
            ratePlanId: p.ratePlanIds[rp.code],
            roomTypeId: p.roomTypeIds[rt.code],
            from: date,
            to: date,
            sellCurrency: EUR,
            sellAmountCents: nightlyCents(def.key, rt.baseCents, rp.plan, date),
            occupancyBasis: "room",
            includedAdults: 2,
          })
        }
      }
    }
  }
  // Each op expands to one row of ~15 columns; keep well under Postgres' 65534
  // bind-parameter ceiling by chunking (bulkUpsertRates writes one INSERT/call).
  let upserted = 0
  const CHUNK = 2000
  for (let i = 0; i < rateOps.length; i += CHUNK) {
    const res = await bulkUpsertRates(db, rateOps.slice(i, i + CHUNK))
    upserted += res.upserted
  }
  console.log(`  rates upserted: ${upserted}`)
}

// ───────────────────────── Units + inventory ─────────────────────────

async function seedUnitsAndInventory() {
  console.log("→ units (serialized) + pooled inventory…")
  for (const def of PROPERTIES) {
    const p = seeded[def.key]
    if (def.inventoryMode === "serialized" && def.units) {
      for (const block of def.units) {
        for (let n = 0; n < block.count; n++) {
          const number = String(block.from + n)
          const row = await createRoomUnit(db, {
            propertyId: p.propertyId,
            roomTypeId: p.roomTypeIds[block.code],
            unitNumber: number,
            name: `Room ${number}`,
            floor: String(block.floor),
            status: "available",
            active: true,
          })
          ;(p.unitIdsByType[block.code] ??= []).push(row.id)
        }
      }
      const totalUnits = Object.values(p.unitIdsByType).reduce((s, a) => s + a.length, 0)
      console.log(`  ${def.name}: ${totalUnits} units (inventory derived via recompute)`)
    } else if (def.inventoryMode === "pooled" && def.pooledCapacity) {
      const invOps = def.roomTypes.map((rt) => ({
        roomTypeId: p.roomTypeIds[rt.code],
        from: isoOffset(-30),
        to: isoOffset(180),
        capacity: def.pooledCapacity![rt.code],
        closed: false,
      }))
      const res = await bulkUpsertInventory(db, invOps)
      console.log(`  ${def.name}: pooled inventory upserted ${res.upserted}`)
    }
  }
}

// ───────────────────────── Guests & bookings ─────────────────────────

const GUESTS = [
  ["Andrei", "Popescu"], ["Maria", "Ionescu"], ["Elena", "Dumitru"], ["Mihai", "Georgescu"],
  ["Ana", "Constantin"], ["Cristian", "Marin"], ["Ioana", "Stan"], ["Gabriel", "Radu"],
  ["Emma", "Schmidt"], ["Lukas", "Müller"], ["Sofia", "Rossi"], ["Marco", "Bianchi"],
  ["Olivia", "Johnson"], ["James", "Wilson"], ["Chloé", "Martin"], ["Louis", "Bernard"],
  ["Anna", "Kowalski"], ["Piotr", "Nowak"], ["Isabel", "García"], ["Diego", "Fernández"],
  ["Nora", "Andersson"], ["Erik", "Johansson"], ["Fatima", "Hassan"], ["Omar", "Farouk"],
  ["Yuki", "Tanaka"], ["Hana", "Novak"], ["Lucas", "Silva"], ["Beatriz", "Costa"],
  ["Katarina", "Horvat"], ["Ivan", "Petrov"], ["Laura", "Dubois"], ["Thomas", "Weber"],
  ["Alina", "Voicu"], ["Bogdan", "Munteanu"], ["Carmen", "Dinu"], ["Vlad", "Ene"],
  ["George", "Brown"], ["Hannah", "Davies"], ["Nina", "Vasile"], ["Radu", "Barbu"],
  ["Teodora", "Nistor"], ["Paul", "Lungu"], ["Diana", "Sava"], ["Alex", "Toma"], ["Ruxandra", "Pop"],
]
function guest(i: number) {
  const [firstName, lastName] = GUESTS[i % GUESTS.length]
  const email = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]/g, "") + "@example.com"
  const phone = `+40 7${String(20_000_000 + i * 137_911).slice(0, 8)}`
  return { firstName, lastName, email, phone }
}

type Scenario =
  | "in_house"
  | "arrival_assigned"
  | "arrival_unassigned"
  | "departure"
  | "future"
  | "past"
  | "no_show"
  | "cancelled"

interface StayPlan {
  scenario: Scenario
  propertyKey: PropertyKey
  roomCode: string
  ratePlanCode: string
  checkIn: string
  checkOut: string
  guestIdx: number
  adults: number
  children?: number
  roomCount?: number
}

interface CreatedStay extends StayPlan {
  bookingId: string
  bookingItemId: string
  stayItemId: string
}

const createdStays: CreatedStay[] = []

async function createStay(plan: StayPlan): Promise<CreatedStay> {
  const p = seeded[plan.propertyKey]
  const def = p.def
  const rt = def.roomTypes.find((r) => r.code === plan.roomCode)!
  const rp = def.ratePlans.find((r) => r.code === plan.ratePlanCode)!
  const g = guest(plan.guestIdx)
  const roomCount = plan.roomCount ?? 1
  const nights = nightsOf(plan.checkIn, plan.checkOut)
  const dailyRates = nights.map((date) => ({
    sellCurrency: EUR,
    sellAmountCents: nightlyCents(plan.propertyKey, rt.baseCents, rp.plan, date),
  }))

  const result = await persistStayBooking(db as any, {
    propertyId: p.propertyId,
    roomTypeId: p.roomTypeIds[plan.roomCode],
    ratePlanId: p.ratePlanIds[plan.ratePlanCode],
    mealPlanId: p.mealPlanIds[rp.meal],
    checkInDate: plan.checkIn,
    checkOutDate: plan.checkOut,
    roomCount,
    adults: plan.adults,
    children: plan.children ?? 0,
    infants: 0,
    dailyRates,
    contact: {
      firstName: g.firstName,
      lastName: g.lastName,
      email: g.email,
      phone: g.phone,
      country: "RO",
    },
    passengers: [
      {
        firstName: g.firstName,
        lastName: g.lastName,
        email: g.email,
        phone: g.phone,
        travelerCategory: "adult",
        isPrimary: true,
      },
    ],
    notes: `Acme demo stay (${plan.scenario}).`,
  })
  if (result.status !== "ok" || !result.bookingId) {
    throw new Error(`persistStayBooking failed for ${plan.scenario}: ${result.reason}`)
  }

  const [item] = await db
    .select({ id: bookingItems.id })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, result.bookingId))
    .limit(1)
  const [stay] = await db
    .select({ id: stayBookingItems.id })
    .from(stayBookingItems)
    .where(eq(stayBookingItems.bookingItemId, item.id))
    .limit(1)

  const created: CreatedStay = {
    ...plan,
    bookingId: result.bookingId,
    bookingItemId: item.id,
    stayItemId: stay.id,
  }
  createdStays.push(created)
  return created
}

/** The stay itinerary that drives all the operational scenarios. */
function buildStayPlans(): StayPlan[] {
  const plans: StayPlan[] = []
  let g = 0
  const next = () => g++

  // 8 in-house today — arrived a few days ago, leaving in the next few days
  const inHouse: [PropertyKey, string, string][] = [
    ["grand", "DLK", "FLEX-BB"],
    ["grand", "CLD", "NR-RO"],
    ["grand", "JRS", "HB-FLEX"],
    ["grand", "TWS", "FLEX-BB"],
    ["grand", "PRES", "FLEX-BB"],
    ["seaside", "SVD", "FLEX-BB"],
    ["seaside", "FAM", "FLEX-BB"],
    ["seaside", "GRD", "NR-RO"],
  ]
  inHouse.forEach(([propertyKey, roomCode, ratePlanCode], i) => {
    plans.push({
      scenario: "in_house",
      propertyKey,
      roomCode,
      ratePlanCode,
      checkIn: isoOffset(-2 - (i % 2)),
      checkOut: isoOffset(1 + (i % 3)),
      guestIdx: next(),
      adults: 2,
      children: roomCode === "FAM" || roomCode === "JRS" ? 1 : 0,
    })
  })

  // 4 arrivals today (2 assigned, 2 not)
  const arrivals: [PropertyKey, string, string, boolean][] = [
    ["grand", "CLD", "FLEX-BB", true],
    ["seaside", "GRD", "FLEX-BB", true],
    ["grand", "DLK", "NR-RO", false],
    ["seaside", "SVD", "FLEX-BB", false],
  ]
  arrivals.forEach(([propertyKey, roomCode, ratePlanCode, assigned], i) => {
    plans.push({
      scenario: assigned ? "arrival_assigned" : "arrival_unassigned",
      propertyKey,
      roomCode,
      ratePlanCode,
      checkIn: isoOffset(0),
      checkOut: isoOffset(2 + (i % 2)),
      guestIdx: next(),
      adults: 2,
    })
  })

  // 3 departures today
  const departures: [PropertyKey, string, string][] = [
    ["grand", "CLD", "FLEX-BB"],
    ["grand", "TWS", "NR-RO"],
    ["seaside", "GRD", "FLEX-BB"],
  ]
  departures.forEach(([propertyKey, roomCode, ratePlanCode], i) => {
    plans.push({
      scenario: "departure",
      propertyKey,
      roomCode,
      ratePlanCode,
      checkIn: isoOffset(-2 - (i % 3)),
      checkOut: isoOffset(0),
      guestIdx: next(),
      adults: 2,
    })
  })

  // 15 future (next 60 days), a few multi-room and some apartments
  const future: [PropertyKey, string, string, number][] = [
    ["grand", "DLK", "FLEX-BB", 3],
    ["grand", "JRS", "HB-FLEX", 6],
    ["grand", "CLD", "NR-RO", 10],
    ["grand", "PRES", "FLEX-BB", 14],
    ["grand", "TWS", "FLEX-BB", 21],
    ["seaside", "SVD", "FLEX-BB", 30],
    ["seaside", "FAM", "FLEX-BB", 40],
    ["seaside", "PEN", "FLEX-BB", 52],
    ["seaside", "GRD", "NR-RO", 18],
    ["city", "STU", "FLEX-RO", 5],
    ["city", "ONEBR", "FLEX-RO", 12],
    ["city", "TWOBR", "WEEKLY-RO", 26],
    ["city", "STU", "WEEKLY-RO", 45],
    ["grand", "DLK", "FLEX-BB", 8],
    ["seaside", "SVD", "FLEX-BB", 60],
  ]
  future.forEach(([propertyKey, roomCode, ratePlanCode, offset], i) => {
    const los = propertyKey === "city" ? (ratePlanCode === "WEEKLY-RO" ? 7 : 3) : 2 + (i % 4)
    plans.push({
      scenario: "future",
      propertyKey,
      roomCode,
      ratePlanCode,
      checkIn: isoOffset(offset),
      checkOut: isoOffset(offset + los),
      guestIdx: next(),
      adults: 2,
      children: roomCode === "FAM" || roomCode === "TWOBR" ? 2 : 0,
      roomCount: i === 0 || i === 4 ? 2 : 1,
    })
  })

  // 8 past / completed
  const past: [PropertyKey, string, string, number][] = [
    ["grand", "CLD", "FLEX-BB", -60],
    ["grand", "DLK", "NR-RO", -45],
    ["grand", "JRS", "HB-FLEX", -30],
    ["seaside", "SVD", "FLEX-BB", -50],
    ["seaside", "GRD", "NR-RO", -20],
    ["city", "ONEBR", "FLEX-RO", -15],
    ["grand", "TWS", "FLEX-BB", -10],
    ["seaside", "FAM", "FLEX-BB", -7],
  ]
  past.forEach(([propertyKey, roomCode, ratePlanCode, offset], i) => {
    plans.push({
      scenario: "past",
      propertyKey,
      roomCode,
      ratePlanCode,
      checkIn: isoOffset(offset),
      checkOut: isoOffset(offset + 2 + (i % 3)),
      guestIdx: next(),
      adults: 2,
    })
  })

  // 1 no-show yesterday
  plans.push({
    scenario: "no_show",
    propertyKey: "grand",
    roomCode: "CLD",
    ratePlanCode: "NR-RO",
    checkIn: isoOffset(-1),
    checkOut: isoOffset(1),
    guestIdx: next(),
    adults: 1,
  })

  // 2 cancelled (future)
  ;[
    ["seaside", "PEN", "FLEX-BB", 22] as const,
    ["grand", "JRS", "FLEX-BB", 35] as const,
  ].forEach(([propertyKey, roomCode, ratePlanCode, offset]) => {
    plans.push({
      scenario: "cancelled",
      propertyKey,
      roomCode,
      ratePlanCode,
      checkIn: isoOffset(offset),
      checkOut: isoOffset(offset + 3),
      guestIdx: next(),
      adults: 2,
    })
  })

  return plans
}

async function seedBookings() {
  console.log("→ bookings: creating stays…")
  const plans = buildStayPlans()
  for (const plan of plans) await createStay(plan)

  // Apply realistic booking + reservation statuses.
  const statusByScenario: Record<Scenario, string> = {
    in_house: "confirmed",
    arrival_assigned: "confirmed",
    arrival_unassigned: "confirmed",
    departure: "confirmed",
    future: "confirmed",
    past: "completed",
    no_show: "confirmed",
    cancelled: "cancelled",
  }
  for (const s of createdStays) {
    await db
      .update(bookings)
      .set({ status: statusByScenario[s.scenario] as any })
      .where(eq(bookings.id, s.bookingId))
    if (s.scenario === "cancelled") {
      await db
        .update(stayBookingItems)
        .set({ status: "cancelled" as any })
        .where(eq(stayBookingItems.id, s.stayItemId))
    }
  }
  console.log(`  created ${createdStays.length} stays`)
}

// ───────────────────────── Ops: assignments, check-in, no-show ─────────────

async function seedFrontDesk() {
  console.log("→ front-desk: unit assignments, check-in, no-show…")
  const usedUnits: Record<PropertyKey, Set<string>> = { grand: new Set(), seaside: new Set(), city: new Set() }

  function takeUnit(propertyKey: PropertyKey, roomCode: string): string | null {
    const pool = seeded[propertyKey].unitIdsByType[roomCode] ?? []
    for (const id of pool) {
      if (!usedUnits[propertyKey].has(id)) {
        usedUnits[propertyKey].add(id)
        return id
      }
    }
    return null
  }

  let assigned = 0
  let checkedIn = 0
  for (const s of createdStays) {
    const wantsUnit =
      s.scenario === "in_house" ||
      s.scenario === "departure" ||
      s.scenario === "arrival_assigned"
    if (wantsUnit && seeded[s.propertyKey].def.inventoryMode === "serialized") {
      const unitId = takeUnit(s.propertyKey, s.roomCode)
      if (unitId) {
        await assignUnit(
          db as any,
          {
            bookingItemId: s.bookingItemId,
            unitId,
            fromDate: s.checkIn,
            toDate: nightsOf(s.checkIn, s.checkOut).slice(-1)[0] ?? s.checkIn,
          },
          "seed",
        )
        assigned++
      }
    }
    if (s.scenario === "in_house") {
      await checkIn(db as any, { bookingItemId: s.bookingItemId }, "seed")
      checkedIn++
    }
  }

  // no-show yesterday
  const ns = createdStays.find((s) => s.scenario === "no_show")
  if (ns) await noShow(db as any, { bookingItemId: ns.bookingItemId }, "seed")

  console.log(`  assignments: ${assigned}, checked-in: ${checkedIn}, no-show: ${ns ? 1 : 0}`)
}

// ───────────────────────── Housekeeping ─────────────────────────

async function seedHousekeeping() {
  console.log("→ housekeeping: generate tasks, room statuses, maintenance…")
  for (const def of PROPERTIES) {
    if (def.inventoryMode !== "serialized") continue
    const res = await generateTasksForDate(db as any, seeded[def.key].propertyId, isoOffset(0))
    console.log(
      `  ${def.name}: generated ${res.inserted} task(s) (departures ${res.departures}, stayovers ${res.stayovers})`,
    )
  }

  // Sprinkle room statuses: most in-house units clean/inspected, a couple dirty.
  const grand = seeded.grand
  const cleanUnits = (grand.unitIdsByType.DLK ?? []).slice(0, 3)
  for (const id of cleanUnits) await setRoomStatus(db as any, { unitId: id, roomStatus: "clean" }, "seed")
  const inspected = (grand.unitIdsByType.JRS ?? []).slice(0, 2)
  for (const id of inspected) {
    await setRoomStatus(db as any, { unitId: id, roomStatus: "clean" }, "seed")
    await setRoomStatus(db as any, { unitId: id, roomStatus: "inspected" }, "seed")
  }
  const dirty = (seeded.seaside.unitIdsByType.SVD ?? []).slice(0, 2)
  for (const id of dirty) await setRoomStatus(db as any, { unitId: id, roomStatus: "dirty" }, "seed")

  // 2 active maintenance blocks (recompute fires on create).
  const blocks: [PropertyKey, string, number, number, string][] = [
    ["grand", "PRES", 0, 5, "Suite refurbishment — new furniture install."],
    ["seaside", "PEN", 3, 10, "Balcony waterproofing after winter storms."],
  ]
  let blocked = 0
  for (const [key, code, fromOff, toOff, description] of blocks) {
    const pool = seeded[key].unitIdsByType[code] ?? []
    const unitId = pool[pool.length - 1]
    if (!unitId) continue
    await createMaintenanceBlock(
      db as any,
      {
        unitId,
        propertyId: seeded[key].propertyId,
        fromDate: isoOffset(fromOff),
        toDate: isoOffset(toOff),
        reason: "maintenance",
        description,
      },
      "seed",
    )
    blocked++
  }
  console.log(`  room statuses set, ${blocked} maintenance block(s)`)
}

// ───────────────────────── Folios ─────────────────────────

async function seedFolios() {
  console.log("→ folios: business dates + night audit + settled folio…")

  // Grand: run the night audit for the last two nights so in-house guests get
  // an open folio with a couple of posted room-nights. Set the business date to
  // TODAY-2, then run the audit twice (each run posts one night and rolls +1).
  const grand = seeded.grand
  await getOrInitBusinessDate(db as any, grand.propertyId) // ensure a row exists
  await db
    .update(businessDates)
    .set({ currentDate: isoOffset(-2) })
    .where(eq(businessDates.propertyId, grand.propertyId))
  const audit1 = await runNightAudit(db as any, grand.propertyId)
  const audit2 = await runNightAudit(db as any, grand.propertyId)
  console.log(
    `  Grand night audit: night ${audit1.businessDate} posted ${audit1.posted}, night ${audit2.businessDate} posted ${audit2.posted}; business date now ${audit2.rolledTo}`,
  )

  // Seaside + City: just initialise the business date to today.
  await getOrInitBusinessDate(db as any, seeded.seaside.propertyId)
  await getOrInitBusinessDate(db as any, seeded.city.propertyId)

  // Run the Seaside audit too, so in-house seaside guests have open folios.
  await db
    .update(businessDates)
    .set({ currentDate: isoOffset(-1) })
    .where(eq(businessDates.propertyId, seeded.seaside.propertyId))
  const seasideAudit = await runNightAudit(db as any, seeded.seaside.propertyId)
  console.log(`  Seaside night audit: night ${seasideAudit.businessDate} posted ${seasideAudit.posted}`)

  // 1 settled past folio: open a stay folio for a completed Grand stay, post the
  // room-nights + city tax + a full payment, then flip it to settled. (We flip
  // status directly rather than minting a finance invoice via settleFolio, to
  // keep the demo seed decoupled from finance number-series setup.)
  const pastGrand = createdStays.find((s) => s.scenario === "past" && s.propertyKey === "grand")
  if (pastGrand) {
    const g = guest(pastGrand.guestIdx)
    const folio = await openFolio(db as any, {
      propertyId: seeded.grand.propertyId,
      kind: "stay",
      bookingId: pastGrand.bookingId,
      bookingItemId: pastGrand.bookingItemId,
      guestName: `${g.firstName} ${g.lastName}`,
      currency: EUR,
    })
    const nights = nightsOf(pastGrand.checkIn, pastGrand.checkOut)
    const rt = seeded.grand.def.roomTypes.find((r) => r.code === pastGrand.roomCode)!
    const rp = seeded.grand.def.ratePlans.find((r) => r.code === pastGrand.ratePlanCode)!
    let total = 0
    for (const date of nights) {
      const cents = nightlyCents("grand", rt.baseCents, rp.plan, date)
      total += cents
      await createPosting(db as any, folio.id, {
        businessDate: date,
        type: "room",
        description: `Room charge — ${rt.name}`,
        amountCents: cents,
      })
      const tax = Math.round(cents * 0.05)
      total += tax
      await createPosting(db as any, folio.id, {
        businessDate: date,
        type: "tax",
        description: "City tax (5%)",
        amountCents: tax,
      })
    }
    await createPosting(db as any, folio.id, {
      businessDate: pastGrand.checkOut,
      type: "payment",
      description: "Card payment on departure",
      amountCents: -total,
    })
    await db
      .update(folios)
      .set({ status: "settled", settledAt: new Date() })
      .where(eq(folios.id, folio.id))
    console.log(`  settled past folio ${folio.folioNumber} (total €${(total / 100).toFixed(2)})`)
  }
}

// ───────────────────────── Finance ─────────────────────────

/**
 * Seed one active default invoice-number series per scope.
 *
 * Storefront checkout allocates invoice numbers at finalize
 * (`issueInvoiceFromBooking` → scope `invoice`) and the bank-transfer path
 * issues a proforma up-front (scope `proforma`); both throw
 * `InvoiceNumberAllocationError: no_active_series_for_scope` when no active
 * series exists. Ship a sensible default per scope so a fresh Acme dataset can
 * take a booking through to a real invoice out of the box. `credit_note` is
 * seeded too so refunds/cancellations can allocate.
 */
async function seedFinance() {
  const series = [
    { code: "INV", name: "Invoices", prefix: "INV-", scope: "invoice" },
    { code: "PRO", name: "Proformas", prefix: "PRO-", scope: "proforma" },
    { code: "CN", name: "Credit notes", prefix: "CN-", scope: "credit_note" },
  ] as const
  for (const s of series) {
    await financeService.createInvoiceNumberSeries(db, {
      code: s.code,
      name: s.name,
      prefix: s.prefix,
      separator: "",
      padLength: 5,
      currentSequence: 0,
      resetStrategy: "annual",
      resetAt: null,
      scope: s.scope,
      isDefault: true,
      active: true,
    })
  }
  console.log(`  invoice number series: ${series.map((s) => `${s.prefix}#####(${s.scope})`).join(", ")}`)
}

// ───────────────────────── Main ─────────────────────────

async function main() {
  console.log(`\nSeeding Acme Hotels demo dataset → ${DATABASE_URL}\n`)
  await reset()
  await seedFinance()
  await seedOperations()
  await seedAri()
  await seedRates()
  await seedUnitsAndInventory()
  await seedBookings()
  await seedFrontDesk()
  await seedHousekeeping()
  await seedFolios()

  console.log("\n✓ Acme Hotels demo dataset seeded.")
  console.log("  Next: pnpm --filter pms-admin reindex   (to populate storefront search)\n")
  await sqlClient.end()
  process.exit(0)
}

main().catch(async (err) => {
  console.error("\n✗ seed-acme failed:", err)
  await sqlClient.end().catch(() => {})
  process.exit(1)
})
