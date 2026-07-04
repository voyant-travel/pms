/**
 * Deployment glue for the catalog offer routes (owned by
 * `@voyant-travel/catalog`, mounted at `/v1/admin/catalog`).
 *
 * The route ORCHESTRATION (search/detail/pricing handlers, validation, offer
 * mapping) lives in the catalog package via `createCatalogOffersAdminRoutes`.
 * This file supplies the deployment-specific access the package can't import
 * statically:
 *   - the Voyant Connect client, constructed from env
 *     (`@voyant-travel/connect-sdk`),
 *   - the Typesense hero-field + dynamic-hotel lookups (TYPESENSE_* env),
 *   - destination-name resolution (`@voyant-travel/plugin-voyant-connect`).
 */

import {
  type CatalogOffersAirportLabel,
  type CatalogOffersConnectClient,
  type CatalogOffersIndexFields,
  type CatalogOffersRouteModuleOptions,
  type CatalogOffersSearchDestination,
  createCatalogOffersAdminRoutes,
} from "@voyant-travel/catalog/offers"
import { createVoyantConnectClient } from "@voyant-travel/connect-sdk"
import { createDestinationNameResolver } from "@voyant-travel/plugin-voyant-connect"
import type { Context } from "hono"

interface PackageOffersEnv {
  VOYANT_API_KEY?: string
  VOYANT_CONNECT_API_KEY?: string
  VOYANT_CLOUD_API_KEY?: string
  VOYANT_CONNECT_OPERATOR_ID?: string
  VOYANT_CONNECT_API_URL?: string
  TYPESENSE_HOST?: string
  TYPESENSE_ADMIN_API_KEY?: string
  TYPESENSE_API_KEY?: string
}

function connectApiKey(env: PackageOffersEnv): string | undefined {
  return env.VOYANT_API_KEY ?? env.VOYANT_CONNECT_API_KEY ?? env.VOYANT_CLOUD_API_KEY
}

// Distinct ids per index lookup — ~80 backtick-quoted catalog ids stays well
// under Typesense's 4000-char filter_by limit.
const INDEX_LOOKUP_BATCH = 80

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Build the Voyant Connect client for a request, or null when unconfigured. */
function resolveConnectClient(c: Context): CatalogOffersConnectClient | null {
  const env = c.env as PackageOffersEnv
  const apiKey = connectApiKey(env)
  const operatorId = env.VOYANT_CONNECT_OPERATOR_ID
  if (!apiKey || !operatorId) return null
  return createVoyantConnectClient({
    apiKey,
    operatorId,
    ...(env.VOYANT_CONNECT_API_URL ? { baseUrl: env.VOYANT_CONNECT_API_URL } : {}),
  }) as CatalogOffersConnectClient
}

/**
 * Resolve product ids → indexed hero fields from Typesense. Best-effort —
 * cards still render from the offer alone if enrichment fails.
 */
async function fetchIndexFields(
  c: Context,
  ids: string[],
): Promise<Map<string, CatalogOffersIndexFields>> {
  const env = c.env as PackageOffersEnv
  const out = new Map<string, CatalogOffersIndexFields>()
  const host = env.TYPESENSE_HOST
  const key = env.TYPESENSE_ADMIN_API_KEY ?? env.TYPESENSE_API_KEY
  if (!host || !key || ids.length === 0) return out
  const base = host.startsWith("http") ? host.replace(/\/$/, "") : `https://${host}`
  // Dedupe + chunk: a destination search yields many (hotel, date) offers but
  // only a handful of distinct hotels. Typesense rejects a `filter_by` over
  // 4000 chars, so cap each request to a safe batch of distinct ids.
  const distinct = [...new Set(ids)]
  for (const batch of chunk(distinct, INDEX_LOOKUP_BATCH)) {
    const filter = `id:=[${batch.map((id) => `\`${id}\``).join(",")}]`
    const url =
      `${base}/collections/products__en-GB__staff__default/documents/search` +
      `?q=*&query_by=name&filter_by=${encodeURIComponent(filter)}&per_page=${batch.length}` +
      `&include_fields=id,name,thumbnailUrl,stars,destinations,countryCodes`
    try {
      const res = (await fetch(url, { headers: { "X-TYPESENSE-API-KEY": key } }).then((r) =>
        r.json(),
      )) as { hits?: Array<{ document?: CatalogOffersIndexFields & { id?: string } }> }
      for (const hit of res.hits ?? []) {
        if (hit.document?.id) out.set(hit.document.id, hit.document)
      }
    } catch {
      // Enrichment is best-effort; cards still render from the offer alone.
    }
  }
  return out
}

/**
 * Resolve a destination to its dynamic (live-composable) hotels from our index.
 * Gating on `supplyModel:=dynamic` keeps scheduled connections out of the live
 * packages/search fan-out.
 */
async function resolveDynamicHotelIds(
  c: Context,
  destination: CatalogOffersSearchDestination,
  limit: number,
): Promise<string[]> {
  const env = c.env as PackageOffersEnv
  const host = env.TYPESENSE_HOST
  const key = env.TYPESENSE_ADMIN_API_KEY ?? env.TYPESENSE_API_KEY
  if (!host || !key) return []
  const base = host.startsWith("http") ? host.replace(/\/$/, "") : `https://${host}`
  const filters = ["supplyModel:=dynamic"]
  if (destination.countryCode) filters.push(`countryCodes:=[\`${destination.countryCode}\`]`)
  if (destination.city) filters.push(`destinations:=[\`${destination.city}\`]`)
  const filter = filters.join(" && ")
  const url =
    `${base}/collections/products__en-GB__staff__default/documents/search` +
    `?q=*&query_by=name&filter_by=${encodeURIComponent(filter)}` +
    `&per_page=${Math.min(limit, 250)}&include_fields=id`
  try {
    const res = (await fetch(url, { headers: { "X-TYPESENSE-API-KEY": key } }).then((r) =>
      r.json(),
    )) as { hits?: Array<{ document?: { id?: string } }> }
    return (res.hits ?? []).map((hit) => hit.document?.id).filter((id): id is string => Boolean(id))
  } catch {
    return []
  }
}

/**
 * Resolve departure airport codes (OTP, IAS…) to "City (CODE)" labels via
 * Voyant Data air. Defensive — name resolution must NEVER fail the search; on
 * any error we fall back to the bare code.
 */
async function resolveAirportLabels(
  c: Context,
  codes: string[],
): Promise<CatalogOffersAirportLabel[]> {
  const env = c.env as PackageOffersEnv
  const sorted = [...new Set(codes)].sort()
  const apiKey = connectApiKey(env)
  if (!apiKey || sorted.length === 0) return sorted.map((code) => ({ code, label: code }))
  let resolver: ReturnType<typeof createDestinationNameResolver> | null = null
  try {
    resolver = createDestinationNameResolver({ apiKey })
  } catch {
    resolver = null
  }
  return Promise.all(
    sorted.map(async (code) => {
      if (!resolver) return { code, label: code }
      try {
        const city = await resolver.resolve(code)
        return { code, label: city && city !== code ? `${city} (${code})` : code }
      } catch {
        return { code, label: code }
      }
    }),
  )
}

/** Build the catalog offer route-module options for this deployment. */
export function createOperatorCatalogOffersRouteModuleOptions(): CatalogOffersRouteModuleOptions {
  return {
    resolveConnectClient,
    fetchIndexFields,
    resolveDynamicHotelIds,
    resolveAirportLabels,
  }
}

/**
 * The catalog offer admin routes, wired with this deployment's options. Returns
 * an `OpenAPIHono` so the package-owned `.openapi()` defs surface in the
 * operator spec via the build-time lazy-merge (voyant#2114 / voyant#2208).
 */
export function createCatalogOffersAdminRoutesForOperator(): ReturnType<
  typeof createCatalogOffersAdminRoutes
> {
  return createCatalogOffersAdminRoutes(createOperatorCatalogOffersRouteModuleOptions())
}
