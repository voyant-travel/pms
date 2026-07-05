// @ts-nocheck -- legacy seed fixture typing cleanup is tracked separately from demo data edits.
// agent-quality: file-size exception -- curated vertical fixture data stays together for reproducible demo resets.
/**
 * Operator catalog-vertical seed helpers.
 *
 * Inserts realistic sample rows into the four "extra" verticals that the
 * operator catalog browse surface knows how to index — extras, cruises,
 * charters, and accommodations rooms — so the /catalog page in the operator
 * admin renders rich, faceted content without needing live external feeds.
 *
 * Each function is independently invokable from `seed.ts`; callers pass a
 * Drizzle client plus a context object with the seller-operator id and any
 * upstream supplier / place ids the seeded rows should attach to. The
 * functions return arrays of inserted entity ids so the caller can wire
 * follow-up data (sailings, voyages, rate plans, etc.) if desired.
 *
 * Variety is deliberate: mixed currencies (EUR/GBP/USD), mixed statuses
 * (draft/awaiting_review/live), mixed regions and themes — all of which
 * the per-vertical catalog policies project as facetable index fields.
 */

import { roomTypes } from "@voyant-travel/accommodations/schema"
import { charterProducts } from "@voyant-travel/charters/schema"
import { cruises } from "@voyant-travel/cruises/schema"
import { newId } from "@voyant-travel/db/lib/typeid"
import { productExtras } from "@voyant-travel/inventory/extras"
import { facilities, properties } from "@voyant-travel/operations"
import type { drizzle } from "drizzle-orm/postgres-js"

type Db = ReturnType<typeof drizzle>

export interface CatalogSeedContext {
  sellerOperatorId: string
  /** Existing supplier ids to attach as line/operator references. May be empty. */
  supplierIds: string[]
  /** Existing compatibility place ids the seed can borrow as embark/disembark/property anchors. May be empty. */
  facilityIds: string[]
}

const HERO_IMAGES = {
  cruiseShip: "https://images.unsplash.com/photo-1548574505-5e239809ee19?w=400",
  cruiseFjord: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400",
  cruiseGreek: "https://images.unsplash.com/photo-1530541930197-ff16ac917b0e?w=400",
  cruiseCaribbean: "https://images.unsplash.com/photo-1559599189-bbd6a3aef1cd?w=400",
  cruiseCoastal: "https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?w=400",
  yachtMotor: "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?w=400",
  yachtSail: "https://images.unsplash.com/photo-1540946485063-a40da27545f8?w=400",
  yachtCroatia: "https://images.unsplash.com/photo-1599084993091-1cb5c0721cc6?w=400",
  yachtRiviera: "https://images.unsplash.com/photo-1527199372136-dff50c10ea34?w=400",
  yachtAmalfi: "https://images.unsplash.com/photo-1544731612-de7f96afe55f?w=400",
  hotelLondon: "https://images.unsplash.com/photo-1455587734955-081b22074882?w=400",
  hotelParis: "https://images.unsplash.com/photo-1455587734955-081b22074882?w=400",
} as const

function pickSupplier(supplierIds: string[], idx: number): string | null {
  if (supplierIds.length === 0) return null
  return supplierIds[idx % supplierIds.length] ?? null
}

function pickFacility(facilityIds: string[], idx: number): string | null {
  if (facilityIds.length === 0) return null
  return facilityIds[idx % facilityIds.length] ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seeds 8 product-extra rows across two synthetic parent products. Mixes
 * selection types (optional/required/default_selected) and pricing modes
 * (per_person / per_booking / quantity_based / included) so faceted filters
 * have multiple buckets even though extras themselves don't get indexed.
 */
export async function seedExtras(db: Db, ctx: CatalogSeedContext): Promise<string[]> {
  // Two synthetic parent products to satisfy the (productId, code) unique
  // index. Plain text columns — no FK enforced at DB level.
  const parentA = newId("products")
  const parentB = newId("products")

  const rows = [
    {
      id: newId("product_extras"),
      productId: parentA,
      supplierId: pickSupplier(ctx.supplierIds, 0),
      code: "AIRPORT-PRIORITY",
      name: "Airport priority pickup",
      description:
        "Skip the queue with a meet-and-greet host inside the terminal and direct car-side handoff.",
      selectionType: "optional" as const,
      pricingMode: "per_booking" as const,
      pricedPerPerson: false,
      minQuantity: 1,
      maxQuantity: 1,
      defaultQuantity: 0,
      active: true,
      sortOrder: 10,
    },
    {
      id: newId("product_extras"),
      productId: parentA,
      supplierId: pickSupplier(ctx.supplierIds, 1),
      code: "VEG-MEAL",
      name: "Vegetarian meal plan",
      description: "All included meals swapped for chef-curated vegetarian dishes.",
      selectionType: "optional" as const,
      pricingMode: "per_person" as const,
      pricedPerPerson: true,
      minQuantity: 1,
      maxQuantity: 8,
      defaultQuantity: 0,
      active: true,
      sortOrder: 20,
    },
    {
      id: newId("product_extras"),
      productId: parentA,
      supplierId: pickSupplier(ctx.supplierIds, 2),
      code: "WELCOME-CHAMPAGNE",
      name: "Champagne welcome basket",
      description: "Bottle of NV champagne, fresh fruit and chocolates waiting in your suite.",
      selectionType: "optional" as const,
      pricingMode: "per_booking" as const,
      pricedPerPerson: false,
      minQuantity: 1,
      maxQuantity: 1,
      defaultQuantity: 0,
      active: true,
      sortOrder: 30,
    },
    {
      id: newId("product_extras"),
      productId: parentA,
      supplierId: pickSupplier(ctx.supplierIds, 3),
      code: "ADJACENT-ROOMS",
      name: "Adjacent rooms guarantee",
      description: "We guarantee adjacent or interconnecting rooms for your party.",
      selectionType: "optional" as const,
      pricingMode: "per_booking" as const,
      pricedPerPerson: false,
      minQuantity: 1,
      maxQuantity: 1,
      defaultQuantity: 0,
      active: true,
      sortOrder: 40,
    },
    {
      id: newId("product_extras"),
      productId: parentB,
      supplierId: pickSupplier(ctx.supplierIds, 4),
      code: "SPA-CREDIT",
      name: "Spa credit (€100)",
      description: "€100 spa treatment credit per guest, redeemable on arrival.",
      selectionType: "optional" as const,
      pricingMode: "per_person" as const,
      pricedPerPerson: true,
      minQuantity: 1,
      maxQuantity: 4,
      defaultQuantity: 0,
      active: true,
      sortOrder: 10,
    },
    {
      id: newId("product_extras"),
      productId: parentB,
      supplierId: pickSupplier(ctx.supplierIds, 0),
      code: "LATE-CHECKOUT",
      name: "Late checkout (16:00)",
      description: "Guaranteed 16:00 checkout (subject to room availability waived).",
      selectionType: "default_selected" as const,
      pricingMode: "per_booking" as const,
      pricedPerPerson: false,
      minQuantity: 1,
      maxQuantity: 1,
      defaultQuantity: 1,
      active: true,
      sortOrder: 20,
    },
    {
      id: newId("product_extras"),
      productId: parentB,
      supplierId: pickSupplier(ctx.supplierIds, 1),
      code: "EXCURSION-COMBO",
      name: "Excursion combo discount",
      description: "10% off when bundling two or more shore excursions.",
      selectionType: "optional" as const,
      pricingMode: "quantity_based" as const,
      pricedPerPerson: false,
      minQuantity: 2,
      maxQuantity: 6,
      defaultQuantity: 0,
      active: true,
      sortOrder: 30,
    },
    {
      id: newId("product_extras"),
      productId: parentB,
      supplierId: pickSupplier(ctx.supplierIds, 2),
      code: "CHILD-BOOSTER",
      name: "Child seat (booster)",
      description: "Forward-facing booster seat fitted in the transfer vehicle.",
      selectionType: "optional" as const,
      pricingMode: "quantity_based" as const,
      pricedPerPerson: false,
      minQuantity: 1,
      maxQuantity: 3,
      defaultQuantity: 0,
      active: true,
      sortOrder: 40,
    },
  ]

  const inserted = await db.insert(productExtras).values(rows).returning({ id: productExtras.id })

  return inserted.map((r) => r.id)
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUISES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seeds 5 cruise products spanning ocean / river / expedition / coastal types,
 * 3 statuses, mixed regions/themes/currencies, and cached price + departure
 * windows so the catalog index can populate price-range / date-range facets.
 */
export async function seedCruises(db: Db, ctx: CatalogSeedContext): Promise<string[]> {
  const rows = [
    {
      id: newId("cruises"),
      slug: "mediterranean-highlights-7nt",
      name: "Mediterranean Highlights · 7nt",
      cruiseType: "ocean" as const,
      lineSupplierId: pickSupplier(ctx.supplierIds, 0),
      nights: 7,
      embarkPortFacilityId: pickFacility(ctx.facilityIds, 0),
      disembarkPortFacilityId: pickFacility(ctx.facilityIds, 0),
      description:
        "Round-trip from Civitavecchia calling at Naples, Palma, Barcelona, Marseille and Florence/Pisa, with a sea day to enjoy the Riviera.",
      shortDescription: "Classic 7-night western Med loop from Rome.",
      highlights: [
        "Round-trip from Rome (Civitavecchia)",
        "Calls in Naples, Palma, Barcelona, Marseille",
        "Two relaxing sea days",
      ],
      inclusionsHtml:
        "<ul><li>All meals in main dining</li><li>Selected entertainment</li><li>Port charges</li></ul>",
      exclusionsHtml:
        "<ul><li>Gratuities</li><li>Shore excursions</li><li>Premium drinks</li></ul>",
      regions: ["Mediterranean", "Western Mediterranean"],
      themes: ["family", "value"],
      heroImageUrl: HERO_IMAGES.cruiseShip,
      status: "live" as const,
      lowestPriceCached: "899.00",
      lowestPriceCurrencyCached: "EUR",
      earliestDepartureCached: "2026-05-10",
      latestDepartureCached: "2026-10-25",
      externalRefs: { ncl: "MED7-2026" },
    },
    {
      id: newId("cruises"),
      slug: "norwegian-fjords-10nt",
      name: "Norwegian Fjords · 10nt",
      cruiseType: "ocean" as const,
      lineSupplierId: pickSupplier(ctx.supplierIds, 1),
      nights: 10,
      embarkPortFacilityId: pickFacility(ctx.facilityIds, 1),
      disembarkPortFacilityId: pickFacility(ctx.facilityIds, 1),
      description:
        "Sail from Southampton through the dramatic Norwegian fjords — Geiranger, Flåm, Bergen and Stavanger — with scenic cruising through Hardangerfjord.",
      shortDescription: "Ten nights through Geiranger, Flåm and Bergen.",
      highlights: [
        "Scenic cruising through Hardangerfjord",
        "Calls in Geiranger and Flåm",
        "Departures from Southampton",
      ],
      inclusionsHtml:
        "<ul><li>Full-board dining</li><li>Onboard entertainment</li><li>Scenic cruising commentary</li></ul>",
      exclusionsHtml: "<ul><li>Drinks package</li><li>Excursions</li><li>Wi-Fi</li></ul>",
      regions: ["Northern Europe", "Norwegian Fjords"],
      themes: ["scenic", "adventure"],
      heroImageUrl: HERO_IMAGES.cruiseFjord,
      status: "live" as const,
      lowestPriceCached: "1499.00",
      lowestPriceCurrencyCached: "GBP",
      earliestDepartureCached: "2026-06-04",
      latestDepartureCached: "2026-08-30",
      externalRefs: { pno: "FJORDS10-2026" },
    },
    {
      id: newId("cruises"),
      slug: "greek-isles-hopper-5nt",
      name: "Greek Isles Hopper · 5nt",
      cruiseType: "coastal" as const,
      lineSupplierId: pickSupplier(ctx.supplierIds, 2),
      nights: 5,
      embarkPortFacilityId: pickFacility(ctx.facilityIds, 2),
      disembarkPortFacilityId: pickFacility(ctx.facilityIds, 2),
      description:
        "A short, punchy island-hop from Piraeus visiting Mykonos, Kuşadası (Ephesus), Patmos, Rhodes and Santorini.",
      shortDescription: "Five nights, five islands, one unforgettable loop.",
      highlights: [
        "Round-trip Athens (Piraeus)",
        "Sunsets over Santorini caldera",
        "Day in Ephesus from Kuşadası",
      ],
      inclusionsHtml: "<ul><li>All meals included</li><li>Local Greek wine at dinner</li></ul>",
      exclusionsHtml: "<ul><li>Shore excursions</li><li>Spa</li></ul>",
      regions: ["Mediterranean", "Greek Isles", "Aegean"],
      themes: ["culture", "couples"],
      heroImageUrl: HERO_IMAGES.cruiseGreek,
      status: "awaiting_review" as const,
      lowestPriceCached: "749.00",
      lowestPriceCurrencyCached: "EUR",
      earliestDepartureCached: "2026-04-15",
      latestDepartureCached: "2026-11-05",
      externalRefs: { celestyal: "GIH5-2026" },
    },
    {
      id: newId("cruises"),
      slug: "caribbean-sampler-7nt",
      name: "Caribbean Sampler · 7nt",
      cruiseType: "ocean" as const,
      lineSupplierId: pickSupplier(ctx.supplierIds, 3),
      nights: 7,
      embarkPortFacilityId: pickFacility(ctx.facilityIds, 3),
      disembarkPortFacilityId: pickFacility(ctx.facilityIds, 3),
      description:
        "Eastern Caribbean round-trip from Miami calling at CocoCay, St. Thomas, San Juan and a relaxing sea day.",
      shortDescription: "Seven nights of beach calls and big-ship comfort.",
      highlights: [
        "Private island day at CocoCay",
        "Old San Juan walking tour included",
        "Family waterpark onboard",
      ],
      inclusionsHtml:
        "<ul><li>Main dining room meals</li><li>Pool deck activities</li><li>Kids club</li></ul>",
      exclusionsHtml: "<ul><li>Specialty dining</li><li>Drinks</li><li>Wi-Fi</li></ul>",
      regions: ["Caribbean", "Eastern Caribbean"],
      themes: ["family", "beach", "value"],
      heroImageUrl: HERO_IMAGES.cruiseCaribbean,
      status: "live" as const,
      lowestPriceCached: "699.00",
      lowestPriceCurrencyCached: "USD",
      earliestDepartureCached: "2026-01-11",
      latestDepartureCached: "2026-12-19",
      externalRefs: { rci: "CARIB7-2026" },
    },
    {
      id: newId("cruises"),
      slug: "iberia-coastal-6nt",
      name: "Iberia Coastal · 6nt",
      cruiseType: "expedition" as const,
      lineSupplierId: pickSupplier(ctx.supplierIds, 4),
      nights: 6,
      embarkPortFacilityId: pickFacility(ctx.facilityIds, 0),
      disembarkPortFacilityId: pickFacility(ctx.facilityIds, 1),
      description:
        "Small-ship coastal voyage from Lisbon to Bilbao tracing the Iberian Atlantic — Porto, Vigo, La Coruña, Santander.",
      shortDescription: "Six nights of small-ship Atlantic Iberia.",
      highlights: [
        "Small-ship under 200 guests",
        "Naturalist-led port talks",
        "Pintxo evening in San Sebastián",
      ],
      inclusionsHtml:
        "<ul><li>All meals with local pairings</li><li>One excursion per port</li><li>Naturalist team</li></ul>",
      exclusionsHtml: "<ul><li>Premium spirits</li><li>Spa</li></ul>",
      regions: ["Mediterranean", "Iberia", "Atlantic"],
      themes: ["luxury", "expedition", "culinary"],
      heroImageUrl: HERO_IMAGES.cruiseCoastal,
      status: "draft" as const,
      lowestPriceCached: "2299.00",
      lowestPriceCurrencyCached: "EUR",
      earliestDepartureCached: "2026-09-08",
      latestDepartureCached: "2026-10-20",
    },
  ]

  const inserted = await db.insert(cruises).values(rows).returning({ id: cruises.id })
  return inserted.map((r) => r.id)
}

// ─────────────────────────────────────────────────────────────────────────────
// CHARTERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seeds 5 charter products with mixed booking modes, regions and statuses,
 * varied APA percentages and cached lowest-price/voyage windows so the
 * catalog index can render motor-vs-sailing and luxury-vs-classic facets.
 */
export async function seedCharters(db: Db, ctx: CatalogSeedContext): Promise<string[]> {
  const rows = [
    {
      id: newId("charter_products"),
      slug: "riviera-classic-sirena",
      name: "Riviera Classic · M/Y Sirena",
      lineSupplierId: pickSupplier(ctx.supplierIds, 0),
      description:
        "Seven-night Côte d'Azur charter aboard M/Y Sirena — Cannes, Saint-Tropez, Monaco and the Lerins, with chef and full crew.",
      shortDescription: "Seven nights between Cannes and Monaco.",
      heroImageUrl: HERO_IMAGES.yachtRiviera,
      regions: ["Mediterranean", "French Riviera"],
      themes: ["luxury", "couples"],
      status: "live" as const,
      defaultBookingModes: ["whole_yacht", "per_suite"],
      defaultApaPercent: "30.00",
      lowestPriceCachedAmount: "85000.00",
      lowestPriceCachedCurrency: "EUR",
      earliestVoyageCached: "2026-05-15",
      latestVoyageCached: "2026-09-30",
      externalRefs: { yachtcharterfleet: "SIRENA-MED" },
    },
    {
      id: newId("charter_products"),
      slug: "aegean-escape-halcyon",
      name: "Aegean Escape · S/Y Halcyon",
      lineSupplierId: pickSupplier(ctx.supplierIds, 1),
      description:
        "Five-night sailing yacht charter through the Cyclades — Mykonos, Paros, Naxos and a sunset call at Santorini.",
      shortDescription: "Five-night Cyclades island sail.",
      heroImageUrl: HERO_IMAGES.yachtSail,
      regions: ["Mediterranean", "Greek Isles", "Aegean"],
      themes: ["sailing", "couples", "boutique"],
      status: "live" as const,
      defaultBookingModes: ["whole_yacht"],
      defaultApaPercent: "25.00",
      lowestPriceCachedAmount: "42000.00",
      lowestPriceCachedCurrency: "EUR",
      earliestVoyageCached: "2026-05-01",
      latestVoyageCached: "2026-10-15",
    },
    {
      id: newId("charter_products"),
      slug: "croatia-islands-marisol",
      name: "Croatia Islands · M/Y Marisol",
      lineSupplierId: pickSupplier(ctx.supplierIds, 2),
      description:
        "Seven nights along the Dalmatian coast aboard M/Y Marisol — Split, Hvar, Vis, Korčula and Dubrovnik.",
      shortDescription: "Dalmatian coast, seven nights.",
      heroImageUrl: HERO_IMAGES.yachtCroatia,
      regions: ["Mediterranean", "Adriatic", "Croatia"],
      themes: ["family", "active"],
      status: "awaiting_review" as const,
      defaultBookingModes: ["per_suite", "whole_yacht"],
      defaultApaPercent: "27.50",
      lowestPriceCachedAmount: "65000.00",
      lowestPriceCachedCurrency: "EUR",
      earliestVoyageCached: "2026-06-01",
      latestVoyageCached: "2026-09-15",
    },
    {
      id: newId("charter_products"),
      slug: "cote-azur-long-weekend",
      name: "Côte d'Azur Long Weekend",
      lineSupplierId: pickSupplier(ctx.supplierIds, 3),
      description:
        "Three-night long-weekend charter from Antibes — Saint-Tropez, Pampelonne lunch and a Monaco evening — perfect for events week.",
      shortDescription: "Three-night Riviera long weekend.",
      heroImageUrl: HERO_IMAGES.yachtMotor,
      regions: ["Mediterranean", "French Riviera"],
      themes: ["events", "luxury"],
      status: "draft" as const,
      defaultBookingModes: ["whole_yacht"],
      defaultApaPercent: "32.00",
      lowestPriceCachedAmount: "38000.00",
      lowestPriceCachedCurrency: "GBP",
      earliestVoyageCached: "2026-05-20",
      latestVoyageCached: "2026-05-29",
    },
    {
      id: newId("charter_products"),
      slug: "amalfi-capri-charter",
      name: "Amalfi to Capri Charter",
      lineSupplierId: pickSupplier(ctx.supplierIds, 4),
      description:
        "Six nights from Salerno around the Amalfi Coast — Positano, Capri, Ischia and Procida — with chef-led culinary highlights ashore.",
      shortDescription: "Six nights, Amalfi Coast and bay of Naples.",
      heroImageUrl: HERO_IMAGES.yachtAmalfi,
      regions: ["Mediterranean", "Tyrrhenian", "Amalfi Coast"],
      themes: ["culinary", "couples", "luxury"],
      status: "live" as const,
      defaultBookingModes: ["per_suite", "whole_yacht"],
      defaultApaPercent: "28.00",
      lowestPriceCachedAmount: "92000.00",
      lowestPriceCachedCurrency: "USD",
      earliestVoyageCached: "2026-05-25",
      latestVoyageCached: "2026-10-05",
    },
  ]

  const inserted = await db
    .insert(charterProducts)
    .values(rows)
    .returning({ id: charterProducts.id })
  return inserted.map((r) => r.id)
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOMMODATION (rooms across 2 properties)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seeds 2 accommodation resale locations (one London hotel, one Paris boutique)
 * and 8 room types spread across them. The function inserts shared place rows
 * inline so accommodation content has stable location anchors.
 */
export async function seedAccommodationRooms(db: Db, ctx: CatalogSeedContext): Promise<string[]> {
  // Always seed two dedicated place rows for the accommodations demo so the
  // compatibility property rows have stable, accommodations-tagged anchors.
  const facilityLondonId = newId("facilities")
  const facilityParisId = newId("facilities")

  await db.insert(facilities).values([
    {
      id: facilityLondonId,
      kind: "hotel" as const,
      status: "active" as const,
      name: "Hotel Thames London",
      code: `UK-LON-THAMES-${facilityLondonId.slice(-6)}`,
      description: "Riverside hotel near Westminster with classic British design.",
      timezone: "Europe/London",
      tags: ["london", "central", "river-view"],
      ownerType: "supplier" as const,
    },
    {
      id: facilityParisId,
      kind: "hotel" as const,
      status: "active" as const,
      name: "Maison Montmartre Paris",
      code: `FR-PAR-MAISON-${facilityParisId.slice(-6)}`,
      description: "Boutique stay tucked into the cobbled lanes below Sacré-Cœur.",
      timezone: "Europe/Paris",
      tags: ["paris", "montmartre", "boutique"],
      ownerType: "supplier" as const,
    },
  ])

  const propertyLondonId = newId("properties")
  const propertyParisId = newId("properties")

  await db.insert(properties).values([
    {
      id: propertyLondonId,
      facilityId: facilityLondonId,
      propertyType: "hotel" as const,
      brandName: "Thames Collection",
      groupName: "Voyant Hotels",
      rating: 4,
      ratingScale: 5,
      checkInTime: "15:00",
      checkOutTime: "11:00",
      policyNotes: "No pets. Children welcome with cot supplied free of charge.",
      amenityNotes: "Restaurant, bar, gym, business centre, valet parking.",
    },
    {
      id: propertyParisId,
      facilityId: facilityParisId,
      propertyType: "hotel" as const,
      brandName: "Maison Collection",
      groupName: "Voyant Hotels",
      rating: 4,
      ratingScale: 5,
      checkInTime: "14:00",
      checkOutTime: "12:00",
      policyNotes: "Pets up to 8kg welcome. Quiet hours 22:00–08:00.",
      amenityNotes: "Garden patio, breakfast room, concierge, evening turn-down.",
    },
  ])

  // Both hotel properties roll up to the first synthetic supplier (the
  // "Voyant Hotels" group) — keeps the demo coherent with the seeded
  // supplier list while still letting individual rooms attribute back.
  const accommodationsSupplierId = pickSupplier(ctx.supplierIds, 0)

  const rows = [
    // ── Hotel Thames London ──
    {
      id: newId("room_types"),
      propertyId: propertyLondonId,
      supplierId: accommodationsSupplierId,
      code: "DLX-RIVER",
      name: "Deluxe Sea-View Suite",
      description:
        "Spacious suite on a high floor with floor-to-ceiling windows over the Thames; king bed, lounge area, marble bathroom.",
      inventoryMode: "pooled" as const,
      roomClass: "suite",
      maxAdults: 3,
      maxChildren: 1,
      maxInfants: 1,
      standardOccupancy: 2,
      maxOccupancy: 4,
      minOccupancy: 1,
      bedroomCount: 1,
      bathroomCount: 1,
      areaValue: 48,
      areaUnit: "m2",
      accessibilityNotes: "Lift access; bathroom not roll-in.",
      smokingAllowed: false,
      active: true,
      sortOrder: 10,
    },
    {
      id: newId("room_types"),
      propertyId: propertyLondonId,
      supplierId: accommodationsSupplierId,
      code: "EXEC-KING",
      name: "Executive King · City View",
      description:
        "Modern executive king with rainfall shower and access to the 8th-floor lounge for breakfast and evening canapés.",
      inventoryMode: "pooled" as const,
      roomClass: "executive",
      maxAdults: 2,
      maxChildren: 1,
      maxInfants: 1,
      standardOccupancy: 2,
      maxOccupancy: 3,
      minOccupancy: 1,
      bedroomCount: 1,
      bathroomCount: 1,
      areaValue: 32,
      areaUnit: "m2",
      smokingAllowed: false,
      active: true,
      sortOrder: 20,
    },
    {
      id: newId("room_types"),
      propertyId: propertyLondonId,
      supplierId: accommodationsSupplierId,
      code: "STD-TWIN",
      name: "Standard Twin Park-Side",
      description:
        "Classic twin overlooking a quiet courtyard garden; ideal for friends or colleagues.",
      inventoryMode: "pooled" as const,
      roomClass: "standard",
      maxAdults: 2,
      maxChildren: 0,
      maxInfants: 0,
      standardOccupancy: 2,
      maxOccupancy: 2,
      minOccupancy: 1,
      bedroomCount: 1,
      bathroomCount: 1,
      areaValue: 22,
      areaUnit: "m2",
      smokingAllowed: false,
      active: true,
      sortOrder: 30,
    },
    {
      id: newId("room_types"),
      propertyId: propertyLondonId,
      supplierId: accommodationsSupplierId,
      code: "FAM-CONNECT",
      name: "Family Connecting Rooms",
      description:
        "Two interconnecting rooms (one king, one twin) with a shared internal door — perfect for families of up to five.",
      inventoryMode: "serialized" as const,
      roomClass: "family",
      maxAdults: 3,
      maxChildren: 3,
      maxInfants: 1,
      standardOccupancy: 4,
      maxOccupancy: 5,
      minOccupancy: 2,
      bedroomCount: 2,
      bathroomCount: 2,
      areaValue: 54,
      areaUnit: "m2",
      accessibilityNotes: "Step-free path from lift; bath with grab rails in one bathroom.",
      smokingAllowed: false,
      active: true,
      sortOrder: 40,
    },
    // ── Maison Montmartre Paris ──
    {
      id: newId("room_types"),
      propertyId: propertyParisId,
      supplierId: accommodationsSupplierId,
      code: "GARDEN-TWIN",
      name: "Family Garden Twin",
      description:
        "Ground-floor twin opening directly onto the garden patio, ideal for families with young children.",
      inventoryMode: "pooled" as const,
      roomClass: "family",
      maxAdults: 2,
      maxChildren: 2,
      maxInfants: 1,
      standardOccupancy: 3,
      maxOccupancy: 4,
      minOccupancy: 1,
      bedroomCount: 1,
      bathroomCount: 1,
      areaValue: 28,
      areaUnit: "m2",
      accessibilityNotes: "Step-free direct access from lobby.",
      smokingAllowed: false,
      active: true,
      sortOrder: 10,
    },
    {
      id: newId("room_types"),
      propertyId: propertyParisId,
      supplierId: accommodationsSupplierId,
      code: "MAISON-SUITE",
      name: "Maison Suite · Sacré-Cœur View",
      description:
        "Top-floor suite with private balcony framing Sacré-Cœur, separate sitting room and complimentary minibar.",
      inventoryMode: "pooled" as const,
      roomClass: "suite",
      maxAdults: 2,
      maxChildren: 1,
      maxInfants: 1,
      standardOccupancy: 2,
      maxOccupancy: 3,
      minOccupancy: 1,
      bedroomCount: 1,
      bathroomCount: 1,
      areaValue: 42,
      areaUnit: "m2",
      accessibilityNotes: "Lift to 5th floor; final flight has 4 stairs.",
      smokingAllowed: false,
      active: true,
      sortOrder: 20,
    },
    {
      id: newId("room_types"),
      propertyId: propertyParisId,
      supplierId: accommodationsSupplierId,
      code: "ATELIER-DBL",
      name: "Atelier Double",
      description:
        "Bohemian artist-loft style double with exposed beams, skylight and a writing desk overlooking Rue Lepic.",
      inventoryMode: "pooled" as const,
      roomClass: "boutique",
      maxAdults: 2,
      maxChildren: 0,
      maxInfants: 0,
      standardOccupancy: 2,
      maxOccupancy: 2,
      minOccupancy: 1,
      bedroomCount: 1,
      bathroomCount: 1,
      areaValue: 19,
      areaUnit: "m2",
      accessibilityNotes: "No lift access — 3rd floor walk-up.",
      smokingAllowed: false,
      active: true,
      sortOrder: 30,
    },
    {
      id: newId("room_types"),
      propertyId: propertyParisId,
      supplierId: accommodationsSupplierId,
      code: "ACCESS-DBL",
      name: "Accessible Garden Double",
      description:
        "Ground-floor accessible double with roll-in shower, lowered amenities and emergency pull-cord. Adjacent to garden patio.",
      inventoryMode: "serialized" as const,
      roomClass: "accessible",
      maxAdults: 2,
      maxChildren: 1,
      maxInfants: 1,
      standardOccupancy: 2,
      maxOccupancy: 3,
      minOccupancy: 1,
      bedroomCount: 1,
      bathroomCount: 1,
      areaValue: 26,
      areaUnit: "m2",
      accessibilityNotes:
        "Roll-in shower, grab rails, widened doorways, lowered light switches and peephole.",
      smokingAllowed: false,
      active: true,
      sortOrder: 40,
    },
  ]

  const inserted = await db.insert(roomTypes).values(rows).returning({ id: roomTypes.id })
  return inserted.map((r) => r.id)
}
