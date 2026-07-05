import {
  createOwnedBookingHandlerRegistry,
  type OwnedBookingHandlerRegistry,
  type SourceAdapterRegistry,
} from "@voyant-travel/catalog/booking-engine"

import type { BookingEngineEnv } from "./booking-engine-runtime"
import { registerProductBookingHandler } from "./product-booking-handler"
import { registerRetainedVerticalBookingHandlers } from "./retained-vertical-booking-handlers"

export function createOwnedBookingHandlersRegistry(
  env: BookingEngineEnv,
  getSourceRegistry: () => SourceAdapterRegistry,
): OwnedBookingHandlerRegistry {
  const registry = createOwnedBookingHandlerRegistry()
  registerProductBookingHandler(registry, env)
  registerRetainedVerticalBookingHandlers(registry, env, getSourceRegistry)
  return registry
}
