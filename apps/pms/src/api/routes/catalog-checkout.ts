/**
 * Operator glue for the storefront checkout endpoint.
 *
 * The checkout logic lives in `@voyant-travel/commerce/checkout`. This file
 * wires the deployment's injected options and exposes:
 *   - `createCatalogCheckoutPublicRoutes()` — the public `POST /checkout/start`
 *     route, mounted under `/v1/public/catalog`.
 *   - `startCatalogCheckout(context, body)` — a thin wrapper that injects the
 *     operator options, for callers (e.g. trips-catalog-runtime) that drive the
 *     service directly.
 */

import {
  type CatalogCheckoutStartContext,
  type CatalogCheckoutStartResult,
  type CheckoutStartInput,
  createCatalogCheckoutRoutes,
  startCatalogCheckout as packageStartCatalogCheckout,
} from "@voyant-travel/commerce/checkout"
import type { Context, Hono } from "hono"
import { createOperatorCheckoutStartOptions } from "../runtime/catalog-checkout-options"

export {
  CatalogCheckoutStartError,
  type CatalogCheckoutStartResult,
  type CheckoutStartInput,
} from "@voyant-travel/commerce/checkout"

// biome-ignore lint/suspicious/noExplicitAny: env-agnostic route bundle -- owner: operator; the commerce checkout factory now returns an `OpenAPIHono<CheckoutEnv>` (so its `.openapi()` registry surfaces in the storefront spec via the build-time lazy merge). `Hono<any>` keeps this loader return structurally compatible with `LazyRoutesLoader` (`() => Promise<Hono<any>>`) without leaking the package's internal Env.
export function createCatalogCheckoutPublicRoutes(): Hono<any> {
  // Pass a per-request options factory so the injected Netopia card-payment
  // start can capture the request `Context` for per-request container access.
  return createCatalogCheckoutRoutes((c) => createOperatorCheckoutStartOptions(c))
}

/** Drive the checkout-start service with this deployment's injected options. */
export function startCatalogCheckout(
  context: Omit<CatalogCheckoutStartContext, "options"> & { c?: Context },
  body: CheckoutStartInput,
): Promise<CatalogCheckoutStartResult> {
  const { c, ...rest } = context
  return packageStartCatalogCheckout(
    { ...rest, options: createOperatorCheckoutStartOptions(c) },
    body,
  )
}
