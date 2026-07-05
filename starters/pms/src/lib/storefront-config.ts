import { createServerFn } from "@tanstack/react-start"

/**
 * Deployment-level storefront configuration read from the Worker env
 * (Cloudflare `vars`, surfaced on `process.env` server-side).
 *
 * `singlePropertyId` switches the storefront into single-property mode:
 * a property manager pointing their own domain at one hotel. When set,
 * `/shop` redirects straight to that property's detail page and the
 * portfolio search is hidden. Leave unset for multi-property mode
 * (portfolio landing + search).
 */
export interface StorefrontConfig {
  singlePropertyId: string | null
}

function readSinglePropertyId(): string | null {
  const raw = process.env.STOREFRONT_SINGLE_PROPERTY_ID
  const trimmed = typeof raw === "string" ? raw.trim() : ""
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Server function — runs during SSR (and as an RPC on client
 * navigation) so route loaders can read the deploy-time storefront
 * config without shipping env access to the browser bundle.
 */
export const getStorefrontConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<StorefrontConfig> => ({ singlePropertyId: readSinglePropertyId() }),
)
