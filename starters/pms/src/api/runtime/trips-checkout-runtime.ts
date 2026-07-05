/**
 * Operator (deployment) wiring for trip checkout.
 *
 * The reusable trip-checkout orchestration (`startTripCheckout`) and the
 * billing helpers live in `@voyant-travel/trips/checkout`. This file supplies
 * the deployment-specific dependencies:
 *   - FX quoting via the Voyant Cloud FX API,
 *   - the public checkout base URL (resolved from env bindings),
 *   - the payment-provider start (this deployment uses Netopia).
 *
 * Swapping the FX source or payment provider is a change here — never in the
 * package's checkout orchestration.
 */
import type { AnyDrizzleDb } from "@voyant-travel/db"
import {
  type FxQuote,
  startTripCheckout as packageStartTripCheckout,
  type TripCheckoutDeps,
  type TripCheckoutInput,
  type TripCheckoutResult,
} from "@voyant-travel/trips/checkout"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import { resolveVoyantApiKey } from "../../lib/voyant-cloud"
import { cardPaymentStarter } from "./card-payment"

/** Build the deployment-specific trip-checkout dependencies for a request. */
function createTripCheckoutDeps(c: Context): TripCheckoutDeps {
  return {
    db: getDb(c),
    quoteFx: (sourceCurrency, targetCurrency) => quoteFx(c, sourceCurrency, targetCurrency),
    resolveCheckoutBaseUrl: () => resolvePublicCheckoutBaseUrl(c.env as CloudflareBindings),
    startProviderPayment: async ({ paymentSessionId, billing, description }) => {
      await cardPaymentStarter(c, {
        db: getDb(c) as PostgresJsDatabase,
        sessionId: paymentSessionId,
        billing,
        description,
      })
    },
  }
}

/** Thin glue preserving the operator's `startTripCheckout(c, input)` signature. */
export function startTripCheckout(
  c: Context,
  input: TripCheckoutInput,
): Promise<TripCheckoutResult> {
  return packageStartTripCheckout(createTripCheckoutDeps(c), input)
}

function resolvePublicCheckoutBaseUrl(env: CloudflareBindings): string | null {
  return (
    env.PUBLIC_CHECKOUT_BASE_URL?.trim() ||
    env.DASH_BASE_URL?.trim() ||
    env.APP_URL?.trim().replace(/\/api\/?$/, "") ||
    null
  )
}

async function quoteFx(
  c: Context,
  sourceCurrency: string,
  targetCurrency: string,
): Promise<FxQuote> {
  if (sourceCurrency === targetCurrency) {
    return { rate: 1, quotedAt: new Date().toISOString(), validUntil: null }
  }

  const env = c.env as {
    VOYANT_API_KEY?: string
    VOYANT_CLOUD_API_KEY?: string
    VOYANT_CLOUD_API_URL?: string
  }
  const apiKey = resolveVoyantApiKey(env)
  if (!apiKey) {
    throw new Error("trip_checkout_fx_requires_voyant_api_key")
  }

  const baseUrl = (env.VOYANT_CLOUD_API_URL ?? "https://api.voyant.travel").replace(/\/$/, "")
  const url = new URL(
    `/data/fx/v1/fx/pair/${encodeURIComponent(sourceCurrency)}/${encodeURIComponent(
      targetCurrency,
    )}`,
    `${baseUrl}/`,
  )
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      "x-voyant-sdk": "voyant-operator-trips",
    },
  })
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok) {
    throw new Error(`trip_checkout_fx_quote_failed:${response.status}`)
  }

  const body = asRecord(payload?.data) ?? payload
  const rate = numberValue(body?.conversionRate) ?? numberValue(body?.conversion_rate)
  if (!rate || rate <= 0) {
    throw new Error("trip_checkout_fx_quote_invalid")
  }

  return {
    rate,
    quotedAt:
      stringValue(body?.timeLastUpdateUtc) ??
      stringValue(body?.time_last_update_utc) ??
      unixSecondsToIso(
        numberValue(body?.timeLastUpdateUnix) ?? numberValue(body?.time_last_update_unix),
      ) ??
      new Date().toISOString(),
    validUntil:
      stringValue(body?.timeNextUpdateUtc) ??
      stringValue(body?.time_next_update_utc) ??
      unixSecondsToIso(
        numberValue(body?.timeNextUpdateUnix) ?? numberValue(body?.time_next_update_unix),
      ),
  }
}

function unixSecondsToIso(value: number | null): string | null {
  if (!value || !Number.isFinite(value)) return null
  return new Date(value * 1000).toISOString()
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function getDb(c: Context): AnyDrizzleDb {
  return (c.var as { db: AnyDrizzleDb }).db
}
