/**
 * Thin HTTP client implementing `SourceAdapter` against the standalone
 * `catalog-demo-api` service. All persistence + state lives in that
 * service; this package contains zero business logic so it can be
 * dropped or replaced by a real upstream connector (Voyant Connect peer,
 * TUI direct API, Hotelbeds, GDS) with no template churn.
 *
 * Mirrors the shape of `@voyant-travel/plugin-flights-demo` for `flights`.
 */
import { type SourceAdapter } from "@voyant-travel/catalog";
/** Stable kind identifier emitted as `source.kind` on every projection. */
export declare const DEMO_SOURCE_KIND = "demo";
/**
 * Options accepted by `createDemoCatalogAdapter()`. The adapter is a pure
 * HTTP client — no DB handle, no in-memory state. The standalone
 * `catalog-demo-api` service owns persistence; this package round-trips.
 */
export interface DemoCatalogAdapterOptions {
    /**
     * Base URL of the running `catalog-demo-api` service (e.g.
     * `http://localhost:3330`). No trailing slash required.
     */
    baseUrl: string;
    /**
     * Verticals this adapter feeds projections for. Defaults to `["products"]`,
     * matching the tracer scope. Other values must match the `entityModule`
     * on the demo-api's inventory rows.
     */
    verticals?: ReadonlyArray<string>;
    /** Custom fetch implementation — useful for tests. Defaults to `globalThis.fetch`. */
    fetch?: typeof fetch;
    /** Default 8s. */
    timeoutMs?: number;
}
export declare function createDemoCatalogAdapter(options: DemoCatalogAdapterOptions): SourceAdapter;
//# sourceMappingURL=adapter.d.ts.map