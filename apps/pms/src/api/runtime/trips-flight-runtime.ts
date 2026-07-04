/**
 * Operator (deployment) wiring for non-catalog (flight) trip components.
 *
 * The reusable flight-component orchestration (preflight price-change detection,
 * passenger-roster building, reserve) now lives in
 * `@voyant-travel/trips/flight-component`. This file supplies the
 * deployment-specific dependency the package can't import statically: the
 * concrete flight adapter (which provider, which base URL).
 *
 * Each exported function keeps the `(c, input)` signature the trips route wiring
 * (`trips-runtime.ts`) already imports.
 */
import { createDemoFlightAdapter } from "@voyant-travel/plugin-flights-demo"
import type {
  ReserveComponentInput,
  ReserveComponentPreflightResult,
  ReserveComponentResult,
} from "@voyant-travel/trips"
import {
  createFlightComponentAdapter,
  type FlightAdapterContext,
} from "@voyant-travel/trips/flight-component"
import type { Context } from "hono"

/** Build the trips flight-component adapter for a request, injecting the
 * deployment's concrete flight adapter + adapter context. */
function flightComponentAdapter(c: Context) {
  return createFlightComponentAdapter({
    adapter: getFlightAdapter(c),
    adapterContext: buildFlightAdapterContext(c),
  })
}

export function validateNonCatalogComponentBeforeReserve(
  c: Context,
  input: ReserveComponentInput,
): Promise<ReserveComponentPreflightResult | null> {
  return flightComponentAdapter(c).validateBeforeReserve(input)
}

export function reserveNonCatalogComponent(
  c: Context,
  input: ReserveComponentInput,
): Promise<ReserveComponentResult | null> {
  return flightComponentAdapter(c).reserve(input)
}

function getFlightAdapter(c: Context) {
  const baseUrl = (c.env as { FLIGHTS_DEMO_API_URL?: string }).FLIGHTS_DEMO_API_URL
  if (!baseUrl) {
    throw new Error(
      "FLIGHTS_DEMO_API_URL is not set. Start `apps/flights-demo-api` and point this env at it.",
    )
  }
  return createDemoFlightAdapter({ baseUrl })
}

function buildFlightAdapterContext(c: Context): FlightAdapterContext {
  return {
    connectionId: "demo",
    correlationId: c.req.header("x-request-id") ?? undefined,
  }
}
