import type { BookingsExtrasRoutes } from "@voyant-travel/bookings/extras"
import type { BookingRequirementsRoutes } from "@voyant-travel/bookings/requirements/routes"
import type { BookingRoutes } from "@voyant-travel/bookings/routes"
import type { MarketsRoutes, PricingRoutes, SellabilityRoutes } from "@voyant-travel/commerce"
import type { ExternalRefsRoutes, SupplierRoutes } from "@voyant-travel/distribution"
import type { DistributionRoutes } from "@voyant-travel/distribution/routes"
import type { FinanceRoutes } from "@voyant-travel/finance/routes"
import type { IdentityRoutes } from "@voyant-travel/identity/routes"
import type { InventoryExtrasRoutes } from "@voyant-travel/inventory/extras"
import type { ProductRoutes } from "@voyant-travel/inventory/routes"
import type { OperationsAdminRoutes } from "@voyant-travel/operations"
import type { QuotesRoutes } from "@voyant-travel/quotes/routes"
import type { RelationshipsRoutes } from "@voyant-travel/relationships/routes"
import type { Hono } from "hono"

/**
 * Composed API type for Hono RPC.
 *
 * Since `createApp()` mounts modules dynamically in a loop,
 * the route types aren't captured via chaining. We define the
 * full type manually here so that `hono/client` can infer
 * end-to-end typed requests.
 *
 * Keys are the documented `/v1/admin/{name}` mount prefixes. The legacy
 * `/v1/{name}` surface was removed (voyant#2114) along with the `routes`
 * module field, so every staff bundle now mounts under `/v1/admin`.
 */
type ApiRoutes = Hono & {
  "/v1/admin/relationships": RelationshipsRoutes
  "/v1/admin/quotes": QuotesRoutes
  "/v1/admin/identity": IdentityRoutes
  "/v1/admin/external-refs": ExternalRefsRoutes
  "/v1/admin/booking-requirements": BookingRequirementsRoutes
  "/v1/admin/extras": InventoryExtrasRoutes & BookingsExtrasRoutes
  "/v1/admin/pricing": PricingRoutes
  "/v1/admin/markets": MarketsRoutes
  "/v1/admin/sellability": SellabilityRoutes
  "/v1/admin/distribution": DistributionRoutes
  "/v1/admin/suppliers": SupplierRoutes
  "/v1/admin/products": ProductRoutes
  "/v1/admin/bookings": BookingRoutes
  "/v1/admin/finance": FinanceRoutes
  "/v1/admin/operations": OperationsAdminRoutes
}

export type AppType = ApiRoutes
