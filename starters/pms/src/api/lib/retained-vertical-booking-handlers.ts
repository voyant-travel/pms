import { createAccommodationBookingHandler } from "@voyant-travel/accommodations/booking-engine"
import { getAccommodationContent } from "@voyant-travel/accommodations/service-content"
import type {
  OwnedBookingHandlerRegistry,
  SourceAdapterRegistry,
} from "@voyant-travel/catalog/booking-engine"
import { asPostgresDb } from "./booking-engine-db"
import type { BookingEngineEnv } from "./booking-engine-runtime"
import { withDbFromEnv } from "./db"
import { persistStayBooking } from "./persist-stay-booking"

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
        return withDbFromEnv(env as Parameters<typeof withDbFromEnv>[0], async (rawDb) =>
          persistStayBooking(asPostgresDb(rawDb), input, opts),
        )
      },
    }),
  )
}
