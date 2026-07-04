import { createAccommodationBookingHandler } from "@voyant-travel/accommodations/booking-engine"
import { stayBookingItems, stayDailyRates } from "@voyant-travel/accommodations/schema"
import { getAccommodationContent } from "@voyant-travel/accommodations/service-content"
import { bookingItems, bookingsService } from "@voyant-travel/bookings"
import type {
  OwnedBookingHandlerRegistry,
  SourceAdapterRegistry,
} from "@voyant-travel/catalog/booking-engine"
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
