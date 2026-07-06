import { queryOptions } from "@tanstack/react-query"
import { createMiddleware, createServerFn } from "@tanstack/react-start"

import { ariKeys, type PropertyOption } from "@/components/ari/ari-client"
import { dbFromEnvForApp } from "../api/lib/db"
import { getOperatorStartEnv } from "./operator-start-context"

/**
 * SSR data seam for the hotel Dashboard (the property-scoped daily overview at
 * `/`, replacing the packaged operator dashboard).
 *
 * The dashboard's KPI / front-desk / housekeeping / revenue panels are scoped to
 * the property picked in the shared selector, which lives in `localStorage` and
 * is therefore unknown server-side — those reads necessarily run client-side
 * (the page renders on the client; the route is `ssr: "data-only"`). What SSR
 * CAN populate is the property list itself, so the selector paints with the
 * portfolio on first render instead of flashing empty. This loader prefetches
 * the property options through a cookie-authenticated server function that reads
 * the database directly (mirroring the operator dashboard's original SSR
 * pattern), under the SAME query key the client `usePropertyOptions` hook uses.
 */

type OperatorServerContext = {
  env?: CloudflareBindings
  request: Request
}

const withOperatorRequest = createMiddleware({ type: "request" }).server(
  ({ context, next, request }) =>
    next({
      context: { request, env: getOperatorStartEnv(context) },
    }),
)

function requireOperatorEnv(context: OperatorServerContext): CloudflareBindings {
  if (!context.env) {
    throw new Error("Cloudflare bindings are not available for server-side dashboard data")
  }
  return context.env
}

function unauthorizedDashboardError(): Error & { status: 401 } {
  return Object.assign(new Error("Unauthorized"), { status: 401 as const })
}

async function requireAuthenticatedOperatorRequest(
  context: OperatorServerContext,
): Promise<CloudflareBindings> {
  const env = requireOperatorEnv(context)
  const { hasAuthPermission } = await import("../api/auth/handler")

  if (!(await hasAuthPermission(context.request, env))) {
    throw unauthorizedDashboardError()
  }

  return env
}

async function withDashboardDb<T>(
  env: CloudflareBindings,
  fn: (db: ReturnType<typeof dbFromEnvForApp>["db"]) => Promise<T>,
): Promise<T> {
  const { db, dispose } = dbFromEnvForApp(env)
  try {
    return await fn(db)
  } finally {
    await dispose()
  }
}

/**
 * Property options for the dashboard selector: sellable properties joined to
 * their facility name (properties carry no display name of their own — it lives
 * on the linked facility). The server-side twin of the client
 * `listPropertyOptions`, returning the identical `PropertyOption[]` shape so the
 * hydrated cache satisfies `usePropertyOptions` without a shape mismatch.
 */
export const getOperatorDashboardPropertyOptions = createServerFn({ method: "GET" })
  .middleware([withOperatorRequest])
  .handler(async ({ context }): Promise<PropertyOption[]> => {
    const env = await requireAuthenticatedOperatorRequest(context)
    return withDashboardDb(env, async (db) => {
      const { placesService, facilitiesService } = await import("@voyant-travel/operations")
      const serviceDb = db as unknown as Parameters<typeof placesService.listProperties>[0]
      const [properties, facilities] = await Promise.all([
        placesService.listProperties(serviceDb, { limit: 200, offset: 0 }),
        facilitiesService.listFacilities(serviceDb, { limit: 200, offset: 0 }),
      ])
      const nameByFacility = new Map(
        facilities.data.map((f: { id: string; name: string }) => [f.id, f.name]),
      )
      return properties.data.map(
        (p: {
          id: string
          facilityId: string
          brandName: string | null
          propertyType: string
        }) => ({
          id: p.id,
          label: nameByFacility.get(p.facilityId) ?? p.brandName ?? p.id,
          propertyType: p.propertyType,
        }),
      )
    })
  })

/**
 * Query options for the dashboard property selector, keyed to `ariKeys.properties()`
 * — the SAME key the client `usePropertyOptions` hook reads — so an SSR prefetch
 * hydrates that hook's cache.
 */
export function getOperatorDashboardPropertyOptionsQueryOptions() {
  return queryOptions({
    queryKey: ariKeys.properties(),
    queryFn: () => getOperatorDashboardPropertyOptions(),
    staleTime: 60_000,
  })
}
