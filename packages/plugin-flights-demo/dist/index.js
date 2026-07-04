/**
 * `@voyant-travel/plugin-flights-demo` — `FlightConnectorAdapter` implementation
 * that talks to the standalone `flights-demo-api` HTTP service. Drop-in
 * replacement for a real GDS connector when no upstream is configured.
 *
 * The service owns its own Postgres database; this package contains zero
 * persistence or business logic so it can be deleted (or swapped for
 * another connector) without touching template DB schemas.
 *
 * See `apps/flights-demo-api/README.md` for the service.
 */
export { createDemoFlightAdapter, } from "./adapter.js";
