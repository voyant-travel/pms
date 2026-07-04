import { createAccommodationBookingHandler } from "@voyant-travel/accommodations/booking-engine"
import { stayBookingItems, stayDailyRates } from "@voyant-travel/accommodations/schema"
import { getAccommodationContent } from "@voyant-travel/accommodations/service-content"
import { bookingItems, bookingsService } from "@voyant-travel/bookings"
import type {
  OwnedBookingHandlerRegistry,
  SourceAdapterRegistry,
} from "@voyant-travel/catalog/booking-engine"
import { cruisesBookingService } from "@voyant-travel/cruises"
import { createCruiseBookingHandler } from "@voyant-travel/cruises/booking-engine"
import type { CruiseContent } from "@voyant-travel/cruises/content-shape"
import {
  cruiseCabinCategories,
  cruisePrices,
  cruiseSailings,
  cruiseShips,
  cruises,
} from "@voyant-travel/cruises/schema"
import { getCruiseContent } from "@voyant-travel/cruises/service-content"
import { pricingService as cruisePricingService } from "@voyant-travel/cruises/service-pricing"
import { bookingPaymentSchedules } from "@voyant-travel/finance"
import { asc, eq } from "drizzle-orm"
import { asPostgresDb } from "./booking-engine-db"
import type { BookingEngineEnv } from "./booking-engine-runtime"
import { withDbFromEnv } from "./db"

export function registerRetainedVerticalBookingHandlers(
  registry: OwnedBookingHandlerRegistry,
  env: BookingEngineEnv,
  getSourceRegistry: () => SourceAdapterRegistry,
): void {
  registry.register(
    createAccommodationBookingHandler({
      async loadContent(ctx, entityId) {
        const db = asPostgresDb(ctx.db)
        const sourceRegistry = getSourceRegistry()
        const resolved = await getAccommodationContent(
          db,
          entityId,
          { preferredLocales: ["en-GB"] },
          { registry: sourceRegistry },
        )
        return resolved?.content ?? null
      },
      async commitBridge(input, opts) {
        return withDbFromEnv(env as Parameters<typeof withDbFromEnv>[0], async (rawDb) => {
          const db = asPostgresDb(rawDb)
          try {
            const roomCount = input.roomCount ?? 1
            const adults = input.adults ?? 1
            const children = input.children ?? 0
            const infants = input.infants ?? 0
            const currency = input.dailyRates[0]?.sellCurrency ?? "EUR"
            const sellAmountCents = input.dailyRates.reduce(
              (sum, rate) => sum + (rate.sellAmountCents ?? 0) * roomCount,
              0,
            )
            const costAmountCents = input.dailyRates.reduce(
              (sum, rate) => sum + (rate.costAmountCents ?? 0) * roomCount,
              0,
            )
            const nights = Math.max(
              1,
              Math.round(
                (Date.parse(`${input.checkOutDate}T00:00:00.000Z`) -
                  Date.parse(`${input.checkInDate}T00:00:00.000Z`)) /
                  86_400_000,
              ),
            )

            return await db.transaction(async (tx) => {
              const booking = await bookingsService.createBooking(
                tx,
                {
                  bookingNumber: generateStayBookingNumber(),
                  sellCurrency: currency,
                  status: "draft",
                  sourceType: "manual",
                  personId: input.personId ?? null,
                  organizationId: input.organizationId ?? null,
                  contactFirstName: input.contact.firstName,
                  contactLastName: input.contact.lastName,
                  contactEmail: input.contact.email ?? null,
                  contactPhone: input.contact.phone ?? null,
                  contactCountry: input.contact.country ?? null,
                  sellAmountCents,
                  costAmountCents,
                  pax: adults + children + infants,
                  startDate: input.checkInDate,
                  endDate: input.checkOutDate,
                  internalNotes: input.notes ?? null,
                },
                opts?.userId,
              )
              if (!booking) throw new Error("bookingsService.createBooking returned null")

              for (const [index, passenger] of input.passengers.entries()) {
                await bookingsService.createTraveler(
                  tx,
                  booking.id,
                  {
                    firstName: passenger.firstName,
                    lastName: passenger.lastName,
                    email: passenger.email ?? null,
                    phone: passenger.phone ?? null,
                    travelerCategory: passenger.travelerCategory ?? null,
                    isPrimary: passenger.isPrimary ?? index === 0,
                  },
                  opts?.userId,
                )
              }

              const [bookingItem] = await tx
                .insert(bookingItems)
                .values({
                  bookingId: booking.id,
                  title: "Accommodation stay",
                  itemType: "unit",
                  status: "on_hold",
                  serviceDate: input.checkInDate,
                  quantity: roomCount,
                  sellCurrency: currency,
                  unitSellAmountCents: Math.round(sellAmountCents / roomCount),
                  totalSellAmountCents: sellAmountCents,
                  costCurrency: costAmountCents > 0 ? currency : null,
                  unitCostAmountCents:
                    costAmountCents > 0 ? Math.round(costAmountCents / roomCount) : null,
                  totalCostAmountCents: costAmountCents > 0 ? costAmountCents : null,
                  metadata: {
                    propertyId: input.propertyId,
                    roomTypeId: input.roomTypeId,
                    ratePlanId: input.ratePlanId,
                    mealPlanId: input.mealPlanId ?? null,
                  },
                })
                .returning()

              if (!bookingItem) throw new Error("booking item insert returned null")

              const [stayItem] = await tx
                .insert(stayBookingItems)
                .values({
                  bookingItemId: bookingItem.id,
                  propertyId: input.propertyId,
                  roomTypeId: input.roomTypeId,
                  ratePlanId: input.ratePlanId,
                  mealPlanId: input.mealPlanId ?? null,
                  checkInDate: input.checkInDate,
                  checkOutDate: input.checkOutDate,
                  nightCount: nights,
                  roomCount,
                  adults,
                  children,
                  infants,
                  status: "reserved",
                  notes: input.notes ?? null,
                })
                .returning()

              if (!stayItem) throw new Error("stay booking item insert returned null")

              await tx.insert(stayDailyRates).values(
                input.dailyRates.map((rate, index) => ({
                  stayBookingItemId: stayItem.id,
                  date: addDays(input.checkInDate, index),
                  sellCurrency: rate.sellCurrency,
                  sellAmountCents: rate.sellAmountCents ?? null,
                  costCurrency: rate.costCurrency ?? null,
                  costAmountCents: rate.costAmountCents ?? null,
                })),
              )

              return {
                status: "ok",
                bookingId: booking.id,
                bookingNumber: booking.bookingNumber,
              }
            })
          } catch (err) {
            return {
              status: "failed",
              reason: err instanceof Error ? err.message : String(err),
            }
          }
        })
      },
    }),
  )

  // Cruises vertical — Phase F skeleton. computeQuote serves the
  // descriptor + per-occupancy pricing from cruise_prices; commit
  // returns failed:not_yet_implemented (cabin allocation +
  // supplier hold + per-installment payment schedule are
  // follow-ups).
  registry.register(
    createCruiseBookingHandler({
      async loadContent(ctx, entityId) {
        const db = asPostgresDb(ctx.db)
        const sourceRegistry = getSourceRegistry()
        const resolved = await getCruiseContent(
          db,
          entityId,
          { preferredLocales: ["en-GB"] },
          { registry: sourceRegistry },
        )
        return resolved?.content ?? (await buildLocalCruiseContent(db, entityId))
      },
      async loadPrice(ctx, args) {
        const db = asPostgresDb(ctx.db)
        const row = await cruisePricingService.lowestAvailablePrice(db, {
          sailingId: args.sailingId,
          occupancy: args.occupancy,
        })
        if (!row) return null
        // Match by category — `lowestAvailablePrice` returns the
        // cheapest across categories. When the user has pinned a
        // specific category, narrow the lookup. Phase F+ swaps to
        // a per-(category, occupancy) selector once the wizard
        // surfaces explicit fare-code choice.
        if (args.cabinCategoryId && row.cabinCategoryId !== args.cabinCategoryId) {
          return null
        }
        return {
          pricePerPerson: row.pricePerPerson,
          currency: row.currency,
          fareCode: row.fareCode,
        }
      },
      async commitBridge(input, opts) {
        return withDbFromEnv(env as Parameters<typeof withDbFromEnv>[0], async (rawDb) => {
          const db = asPostgresDb(rawDb)
          try {
            const result = await cruisesBookingService.createCruiseBooking(
              db,
              {
                sailingId: input.sailingId,
                cabinCategoryId: input.cabinCategoryId,
                cabinId: input.cabinId,
                occupancy: input.occupancy,
                fareCode: input.fareCode,
                personId: input.personId,
                organizationId: input.organizationId,
                contact: input.contact,
                passengers: input.passengers,
                airArrangement: input.airArrangement,
                notes: input.notes,
              },
              opts?.userId,
            )

            // Cruise installments (per booking-journey-architecture
            // §7): deposit at book + balance due 90 days before
            // sail. The handler echoes the pricing total via the
            // bridge input's pricing context — for now we read it
            // off the quote stored in cruise_details (the cruise
            // service already snapshotted it). When the journey
            // surfaces explicit installment overrides, they flow
            // through `input.installments` (TBD).
            const totalCents = priceCentsFromString(result.cruiseDetails.quotedTotalForCabin)
            if (totalCents > 0) {
              const depositCents = Math.round(totalCents * 0.25)
              const balanceCents = totalCents - depositCents
              const today = new Date()
              const sailDate = result.cruiseDetails.sailingId
                ? // TODO: resolve sail date from sailings table when wired
                  // — until then balance defaults to today + 60d.
                  null
                : null
              const balanceDue = sailDate ?? new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000)
              const depositDue = today
              await db.insert(bookingPaymentSchedules).values([
                {
                  bookingId: result.bookingId,
                  scheduleType: "deposit",
                  status: "due",
                  dueDate: depositDue.toISOString().slice(0, 10),
                  currency: result.cruiseDetails.quotedCurrency,
                  amountCents: depositCents,
                  notes: "Deposit at booking (per cruise journey §7)",
                },
                {
                  bookingId: result.bookingId,
                  scheduleType: "balance",
                  status: "pending",
                  dueDate: balanceDue.toISOString().slice(0, 10),
                  currency: result.cruiseDetails.quotedCurrency,
                  amountCents: balanceCents,
                  notes: "Balance due before sail",
                },
              ])
            }

            return {
              status: "ok",
              bookingId: result.bookingId,
              bookingNumber: result.bookingNumber,
            }
          } catch (err) {
            return {
              status: "failed",
              reason: err instanceof Error ? err.message : String(err),
            }
          }
        })
      },
    }),
  )
}

/** Parse a numeric major-unit price string (e.g. cruise_prices'
 *  decimal column shape) into integer cents. */
function priceCentsFromString(s: string): number {
  const negative = s.startsWith("-")
  const abs = negative ? s.slice(1) : s
  const parts = abs.split(".")
  const whole = parts[0] ?? "0"
  const frac = parts[1] ?? ""
  const fracPadded = `${frac}00`.slice(0, 2)
  const cents = Number(whole) * 100 + Number(fracPadded)
  return negative ? -cents : cents
}

function generateStayBookingNumber(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, "0")
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `STAY-${y}${m}-${suffix}`
}

function addDays(date: string, offset: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + offset)
  return value.toISOString().slice(0, 10)
}

async function buildLocalCruiseContent(
  db: ReturnType<typeof asPostgresDb>,
  entityId: string,
): Promise<CruiseContent | null> {
  const [cruise] = await db.select().from(cruises).where(eq(cruises.id, entityId)).limit(1)
  if (!cruise) return null

  const [ship] = cruise.defaultShipId
    ? await db.select().from(cruiseShips).where(eq(cruiseShips.id, cruise.defaultShipId)).limit(1)
    : []
  const [sailings, categories, prices] = await Promise.all([
    db
      .select()
      .from(cruiseSailings)
      .where(eq(cruiseSailings.cruiseId, entityId))
      .orderBy(asc(cruiseSailings.departureDate)),
    ship?.id
      ? db
          .select()
          .from(cruiseCabinCategories)
          .where(eq(cruiseCabinCategories.shipId, ship.id))
          .orderBy(asc(cruiseCabinCategories.name))
      : Promise.resolve([]),
    db
      .select()
      .from(cruisePrices)
      .innerJoin(cruiseSailings, eq(cruisePrices.sailingId, cruiseSailings.id))
      .where(eq(cruiseSailings.cruiseId, entityId)),
  ])
  const lowestBySailing = new Map<string, { amount: number; currency: string }>()
  for (const row of prices) {
    if (row.cruise_prices.availability !== "available") continue
    const amount = priceCentsFromString(String(row.cruise_prices.pricePerPerson))
    const current = lowestBySailing.get(row.cruise_prices.sailingId)
    if (!current || amount < current.amount) {
      lowestBySailing.set(row.cruise_prices.sailingId, {
        amount,
        currency: row.cruise_prices.currency,
      })
    }
  }

  return {
    cruise: {
      id: cruise.id,
      name: cruise.name,
      status: cruise.status,
      description: cruise.description ?? cruise.shortDescription ?? null,
      cruise_type: cruise.cruiseType,
      hero_image_url: cruise.heroImageUrl ?? null,
      highlights: Array.isArray(cruise.highlights) ? cruise.highlights.filter(isString) : [],
      duration_nights: cruise.nights,
    },
    ship: ship
      ? {
          id: ship.id,
          name: ship.name,
          ship_type: ship.shipType,
          description: ship.description ?? null,
          deck_plan_url: ship.deckPlanUrl ?? null,
          deck_plans: [],
          capacity: ship.capacityGuests ?? null,
          decks: ship.deckCount ?? null,
          year_built: ship.yearBuilt ?? null,
          gallery: Array.isArray(ship.gallery) ? ship.gallery.filter(isString) : [],
        }
      : null,
    sailings: sailings.map((sailing) => {
      const lowest = lowestBySailing.get(sailing.id)
      return {
        id: sailing.id,
        source_ref: null,
        start_date: sailing.departureDate,
        end_date: sailing.returnDate,
        duration_nights: daysBetween(sailing.departureDate, sailing.returnDate),
        status: sailing.salesStatus,
        itinerary_stops: [],
        lowest_price_cents: lowest?.amount ?? null,
        currency: lowest?.currency ?? null,
      }
    }),
    cabin_categories: categories.map((category) => ({
      id: category.id,
      code: category.code,
      name: category.name,
      description: category.description ?? null,
      type: category.roomType,
      capacity_min: category.minOccupancy,
      capacity_max: category.maxOccupancy,
      images: Array.isArray(category.images) ? category.images.filter(isString) : [],
      floorplan_images: Array.isArray(category.floorplanImages)
        ? category.floorplanImages.filter(isString)
        : [],
      square_feet: category.squareFeet == null ? null : String(category.squareFeet),
      grade_codes: Array.isArray(category.gradeCodes) ? category.gradeCodes.filter(isString) : [],
      wheelchair_accessible: category.wheelchairAccessible,
      inclusions: [],
      feature_codes: Array.isArray(category.featureCodes)
        ? category.featureCodes.filter(isString)
        : [],
      bed_configurations: [],
      accessibility_features: [],
      view_type: null,
    })),
    itinerary_stops: [],
    policies: [],
  }
}

function daysBetween(start: string, end: string): number {
  return Math.max(
    0,
    Math.round(
      (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000,
    ),
  )
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}
