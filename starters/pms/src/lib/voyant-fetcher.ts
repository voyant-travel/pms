import { createIsomorphicFn } from "@tanstack/react-start"
import { getRequestHeader, getRequestUrl } from "@tanstack/react-start/server"
import { defaultFetcher, type VoyantFetcher } from "@voyant-travel/inventory-react"

const ADMIN_API_PREFIXES = [
  "/v1/relationships",
  "/v1/operations",
  "/v1/products",
  "/v1/markets",
  "/v1/bookings",
  "/v1/suppliers",
  "/v1/pricing",
] as const

function rewriteOperatorApiPath(pathname: string): string {
  const apiPrefix = pathname.startsWith("/api/v1/") ? "/api" : ""
  const apiPath = apiPrefix ? pathname.slice(apiPrefix.length) : pathname

  if (!apiPath.startsWith("/v1/")) return pathname
  if (/^\/v1\/public\/finance\/bookings\/[^/]+\/payments$/.test(apiPath)) {
    return `${apiPrefix}/v1/admin/finance${apiPath.slice("/v1/public/finance".length)}`
  }

  if (apiPath.startsWith("/v1/admin/") || apiPath.startsWith("/v1/public/")) {
    return pathname
  }

  for (const prefix of ADMIN_API_PREFIXES) {
    if (apiPath === prefix || apiPath.startsWith(`${prefix}/`)) {
      return `${apiPrefix}/v1/admin${apiPath.slice(3)}`
    }
  }

  return pathname
}

function normalizeOperatorApiSearchParams(pathname: string, searchParams: URLSearchParams): void {
  const apiPath = pathname.startsWith("/api/v1/") ? pathname.slice("/api".length) : pathname

  if (apiPath === "/v1/admin/bookings" && searchParams.get("status") === "__all__") {
    searchParams.delete("status")
  }
}

function normalizeOperatorApiUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const parsed = new URL(url)
    parsed.pathname = rewriteOperatorApiPath(parsed.pathname)
    normalizeOperatorApiSearchParams(parsed.pathname, parsed.searchParams)
    return parsed.toString()
  }

  if (url.startsWith("/")) {
    const parsed = new URL(url, "http://operator.local")
    parsed.pathname = rewriteOperatorApiPath(parsed.pathname)
    normalizeOperatorApiSearchParams(parsed.pathname, parsed.searchParams)
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  }

  return url
}

/**
 * Isomorphic Voyant fetcher.
 *
 * On the client: same as `defaultFetcher` — browser sends session cookies via
 * `credentials: "include"`.
 *
 * On the server (route loaders / server functions when SSR is enabled):
 * forwards the incoming request's `Cookie` header and rewrites absolute
 * `getApiUrl()`-style URLs onto the request origin, so the fetch loops back
 * into this Worker and hits the Hono app mounted at `/api/*` in `entry.ts`.
 *
 * `createIsomorphicFn` strips the `.server(...)` branch (including its
 * imports) from client bundles, so the `@tanstack/react-start/server`
 * import here doesn't ship to the browser.
 */
const fetcherImpl = createIsomorphicFn()
  .client((url: string, init?: RequestInit) => defaultFetcher(normalizeOperatorApiUrl(url), init))
  .server((url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const cookie = getRequestHeader("cookie")
    if (cookie) headers.set("cookie", cookie)

    const origin = getRequestUrl().origin
    const normalizedUrl = normalizeOperatorApiUrl(url)
    let target = normalizedUrl
    if (normalizedUrl.startsWith("http://") || normalizedUrl.startsWith("https://")) {
      const u = new URL(normalizedUrl)
      target = `${origin}${u.pathname}${u.search}${u.hash}`
    }

    return fetch(target, { ...init, headers })
  })

export const operatorFetcher: VoyantFetcher = (url, init) =>
  fetcherImpl(url, init) as Promise<Response>
