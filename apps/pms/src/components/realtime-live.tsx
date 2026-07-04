"use client"

import type { QueryKey } from "@tanstack/react-query"
import type { AdminChildProvider } from "@voyant-travel/admin/providers/operator-admin-shell"
import { RealtimeChannel } from "@voyant-travel/cloud-sdk"
import {
  createRealtimeChannelConnector,
  type RealtimeInvalidationHint,
  RealtimeReactProvider,
  useLiveQueries,
} from "@voyant-travel/realtime-react"
import { useMemo } from "react"
import { getApiUrl } from "@/lib/env"
import { operatorFetcher } from "@/lib/voyant-fetcher"

// The single deployment-wide channel every admin screen listens on. Module-level
// constant so the subscription identity stays stable across renders.
const ADMIN_CHANNELS = ["admin"]

// Dashboard aggregate query-key roots (prefix-matched, so every `from` window
// refreshes from one hint).
const DASH_BOOKINGS: QueryKey = ["dashboard-bookings-aggregates"]
const DASH_FINANCE: QueryKey = ["dashboard-finance-aggregates"]
const DASH_PRODUCTS: QueryKey = ["dashboard-products-aggregates"]

/**
 * Maps a hint `entity` to the React Query key roots to invalidate. Each entry
 * lists every plausible root for that entity across the module's `*-react`
 * package(s); React Query prefix-matches, so a root that isn't mounted is a
 * cheap no-op. Adding a module = one entry here + a bridge route (lib/realtime).
 */
const ENTITY_INVALIDATIONS: Record<string, ReadonlyArray<QueryKey>> = {
  // The operator product detail/edit pages use inventory-react (root
  // `["voyant","products"]`).
  product: [["voyant", "products"], DASH_PRODUCTS],
  person: [["voyant", "relationships", "people"]],
  organization: [["voyant", "relationships", "organizations"]],
  signal: [["voyant", "relationships", "customer-signals"]],
  supplier: [["voyant", "suppliers"]],
  quote: [["voyant", "quotes"]],
  invoice: [["voyant", "finance"], DASH_FINANCE],
  contract: [["legal", "contracts"]],
  cruise: [["voyant", "cruises"]],
  // A pricing-rule change also moves the product's pricing surfaces.
  pricing: [
    ["voyant", "pricing"],
    ["voyant", "products"],
  ],
  // commerce-react promotions use a bare `["promotions"]` root, not `voyant/*`.
  promotion: [["promotions"], ["voyant", "pricing"]],
  booking: [["voyant", "bookings"], DASH_BOOKINGS, DASH_FINANCE],
  payment: [["voyant", "bookings"], ["voyant", "finance"], DASH_BOOKINGS, DASH_FINANCE],
  availability: [["voyant", "availability"], ["voyant", "products"], DASH_PRODUCTS],
}

function mapHintToKeys(hint: RealtimeInvalidationHint): ReadonlyArray<QueryKey> {
  return ENTITY_INVALIDATIONS[hint.entity] ?? []
}

function AdminLiveRegion() {
  useLiveQueries(ADMIN_CHANNELS, mapHintToKeys)
  return null
}

/**
 * Admin-shell child provider that makes every admin screen live via hint-driven
 * React Query invalidation (dashboard, product/contact/booking/invoice/… lists
 * and detail pages), keeping each screen's polling/staleTime as a fallback.
 * Subscribes over the Voyant Cloud `RealtimeChannel`, authenticated with a
 * scoped token minted by `POST /v1/admin/realtime/token`.
 */
export const RealtimeLiveProvider: AdminChildProvider = ({ children }) => {
  const connector = useMemo(
    () => createRealtimeChannelConnector(RealtimeChannel, { baseUrl: getApiUrl() }),
    [],
  )
  return (
    <RealtimeReactProvider
      connector={connector}
      tokenEndpoint={`${getApiUrl()}/v1/admin/realtime/token`}
      fetcher={operatorFetcher}
    >
      <AdminLiveRegion />
      {children}
    </RealtimeReactProvider>
  )
}
