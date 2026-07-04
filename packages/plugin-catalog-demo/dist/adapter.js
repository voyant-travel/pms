/**
 * Thin HTTP client implementing `SourceAdapter` against the standalone
 * `catalog-demo-api` service. All persistence + state lives in that
 * service; this package contains zero business logic so it can be
 * dropped or replaced by a real upstream connector (Voyant Connect peer,
 * TUI direct API, Hotelbeds, GDS) with no template churn.
 *
 * Mirrors the shape of `@voyant-travel/plugin-flights-demo` for `flights`.
 */
import { AdapterRateLimitedError, } from "@voyant-travel/catalog";
/** Stable kind identifier emitted as `source.kind` on every projection. */
export const DEMO_SOURCE_KIND = "demo";
export function createDemoCatalogAdapter(options) {
    const baseUrl = options.baseUrl.replace(/\/$/, "");
    const verticals = options.verticals?.length ? Array.from(options.verticals) : ["products"];
    const fetchImpl = options.fetch ?? globalThis.fetch;
    const timeoutMs = options.timeoutMs ?? 8_000;
    const capabilities = {
        verticals,
        supportsLiveResolution: true,
        supportsDriftDetection: false,
        supportsBookingForwarding: true,
        postBookOperations: ["cancel", "status"],
        // Demo upstream now serves rich content (highlights, days,
        // options, media, policies) via /get-content — same contract as
        // real adapters. Starters that want to demonstrate the thin-
        // synthesizer fallback can flip this and the catalog content
        // service falls through to synthesizeProductContent.
        supportsContentFetch: true,
        // Channel push (outbound). The demo upstream advertises all three
        // flows so templates can exercise the channel-push pipeline
        // end-to-end without a real channel integration.
        supportsBookingPush: true,
        supportsAvailabilityPush: true,
        supportsContentPush: true,
    };
    async function call(path, init) {
        const url = `${baseUrl}${path}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(url, {
                method: init?.method ?? "GET",
                headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
                body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
                signal: controller.signal,
            });
            const text = await response.text();
            const data = text ? JSON.parse(text) : undefined;
            // Surface 429 distinctly so the channel-push pipeline can drain
            // its rate-limit bucket per the upstream's Retry-After hint.
            if (response.status === 429) {
                const retryAfterRaw = response.headers.get("Retry-After");
                const retryAfterSec = retryAfterRaw ? Number.parseInt(retryAfterRaw, 10) : 60;
                const retryAfterMs = (Number.isFinite(retryAfterSec) ? retryAfterSec : 60) * 1000;
                throw new AdapterRateLimitedError(DEMO_SOURCE_KIND, retryAfterMs, path, data);
            }
            if (!response.ok) {
                const detail = data && typeof data === "object" && "error" in data && typeof data.error === "string"
                    ? data.error
                    : response.statusText;
                throw new Error(`catalog-demo-api ${init?.method ?? "GET"} ${path}: ${detail}`);
            }
            return data;
        }
        finally {
            clearTimeout(timer);
        }
    }
    return {
        kind: DEMO_SOURCE_KIND,
        capabilities,
        async connect(_ctx) {
            // Sanity-ping the upstream so misconfigured URLs surface immediately
            // instead of at first booking attempt.
            await call("/health");
        },
        async pause(_ctx) {
            // Nothing local to release — the demo-api keeps running.
        },
        async disconnect(_ctx) {
            // Same as pause for the demo. Real adapters might revoke an OAuth
            // token here; the demo-api has no auth.
        },
        async getState(_ctx) {
            try {
                await call("/health");
                return "active";
            }
            catch {
                return "error";
            }
        },
        async discover(_ctx, cursor) {
            return call("/discover", {
                method: "POST",
                body: { cursor, entityModules: verticals },
            });
        },
        async liveResolve(_ctx, request) {
            return call("/live-resolve", {
                method: "POST",
                body: request,
            });
        },
        async reserve(_ctx, request) {
            return call("/reserve", {
                method: "POST",
                body: request,
            });
        },
        async cancel(_ctx, request) {
            return call("/cancel", {
                method: "POST",
                body: request,
            });
        },
        async getContent(_ctx, request) {
            return call("/get-content", {
                method: "POST",
                body: request,
            });
        },
        // ── Channel push (outbound) ─────────────────────────────────────
        // The demo-api records pushed bookings/availability/content for
        // tests and demos to inspect.
        async pushBooking(_ctx, request) {
            return call("/push-booking", {
                method: "POST",
                body: request,
            });
        },
        async pushAvailability(_ctx, request) {
            return call("/push-availability", {
                method: "POST",
                body: request,
            });
        },
        async pushContent(_ctx, request) {
            return call("/push-content", {
                method: "POST",
                body: request,
            });
        },
    };
}
