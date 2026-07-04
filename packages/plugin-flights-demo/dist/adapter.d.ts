/**
 * Thin HTTP client implementing `FlightConnectorAdapter` against the
 * standalone `flights-demo-api` service. All synthesis + persistence lives
 * in that service; this package contains zero business logic so it can be
 * dropped or replaced by a real GDS connector with no template churn.
 *
 * The adapter ignores `ctx.deps` — the demo service owns its own DB.
 */
import type { FlightConnectorAdapter } from "@voyant-travel/flights/contract/adapter";
export interface DemoFlightAdapterOptions {
    /**
     * Base URL of the running `flights-demo-api` service (e.g.
     * `http://localhost:3320`). No trailing slash required.
     */
    baseUrl: string;
    /** Custom fetch implementation — useful for tests. Defaults to `globalThis.fetch`. */
    fetch?: typeof fetch;
}
export declare function createDemoFlightAdapter(options: DemoFlightAdapterOptions): FlightConnectorAdapter;
//# sourceMappingURL=adapter.d.ts.map