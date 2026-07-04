/**
 * Thin HTTP client implementing `FlightConnectorAdapter` against the
 * standalone `flights-demo-api` service. All synthesis + persistence lives
 * in that service; this package contains zero business logic so it can be
 * dropped or replaced by a real GDS connector with no template churn.
 *
 * The adapter ignores `ctx.deps` — the demo service owns its own DB.
 */
import { requireCapability } from "@voyant-travel/flights/contract/adapter";
const CAPABILITIES = {
    provider: "demo",
    declared: [
        "flight/holds",
        "flight/ancillaries",
        "flight/seatmap",
        "flight/seat-selection",
        "flight/branded-fares",
        "flight/list-orders",
    ],
    maxSlicesPerSearch: 4,
    defaultTimeoutMs: 5_000,
};
export function createDemoFlightAdapter(options) {
    const baseUrl = options.baseUrl.replace(/\/$/, "");
    const fetchImpl = options.fetch ?? globalThis.fetch;
    async function call(ctx, path, init) {
        const url = new URL(`${baseUrl}${path}`);
        if (init?.query) {
            for (const [key, value] of Object.entries(init.query)) {
                if (value === undefined)
                    continue;
                if (Array.isArray(value)) {
                    for (const v of value)
                        url.searchParams.append(key, v);
                }
                else {
                    url.searchParams.set(key, value);
                }
            }
        }
        const response = await fetchImpl(url.toString(), {
            method: init?.method ?? "GET",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                ...(ctx.correlationId ? { "x-correlation-id": ctx.correlationId } : {}),
                ...(ctx.requestId ? { "x-request-id": ctx.requestId } : {}),
                ...(ctx.idempotencyKey ? { "idempotency-key": ctx.idempotencyKey } : {}),
            },
            body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
            signal: ctx.signal,
        });
        const text = await response.text();
        const json = text ? JSON.parse(text) : null;
        if (!response.ok) {
            const message = (typeof json === "object" && json !== null && "error" in json
                ? String(json.error)
                : null) ?? `flights-demo-api ${path} failed: ${response.status}`;
            throw new Error(message);
        }
        return json;
    }
    return {
        capabilities: CAPABILITIES,
        async searchFlights(ctx, request) {
            return call(ctx, "/search", { method: "POST", body: request });
        },
        async priceOffer(ctx, request) {
            return call(ctx, "/price", { method: "POST", body: request });
        },
        async bookFlight(ctx, request) {
            return call(ctx, "/book", { method: "POST", body: request });
        },
        async getOrder(ctx, orderId) {
            return call(ctx, `/orders/${encodeURIComponent(orderId)}`);
        },
        async cancelOrder(ctx, orderId, reason) {
            return call(ctx, `/orders/${encodeURIComponent(orderId)}/cancel`, {
                method: "POST",
                body: reason ? { reason } : {},
            });
        },
        async listOrders(ctx, query) {
            return call(ctx, "/orders", {
                query: {
                    ...(query.cursor ? { cursor: query.cursor } : {}),
                    ...(query.limit !== undefined ? { limit: String(query.limit) } : {}),
                    ...(query.search ? { q: query.search } : {}),
                    ...(query.status ? { status: query.status } : {}),
                },
            });
        },
        async getAncillaries(ctx, request) {
            return call(ctx, "/ancillaries", { method: "POST", body: request });
        },
        async getSeatMap(ctx, request) {
            return call(ctx, "/seatmap", { method: "POST", body: request });
        },
        async selectSeats(ctx, request) {
            return call(ctx, "/seat-selection", {
                method: "POST",
                body: request,
            });
        },
        async checkIn(_ctx, _request) {
            requireCapability(CAPABILITIES, "flight/checkin", "checkIn");
            throw new Error("unreachable");
        },
        async modifyOrder(_ctx, _request) {
            requireCapability(CAPABILITIES, "flight/exchange", "modifyOrder");
            throw new Error("unreachable");
        },
        async refundOrder(_ctx, _request) {
            requireCapability(CAPABILITIES, "flight/refund", "refundOrder");
            throw new Error("unreachable");
        },
        async voidOrder(_ctx, _orderId) {
            requireCapability(CAPABILITIES, "flight/void", "voidOrder");
            throw new Error("unreachable");
        },
        async addSpecialServiceRequest(_ctx, _request) {
            requireCapability(CAPABILITIES, "flight/ssr", "addSpecialServiceRequest");
            throw new Error("unreachable");
        },
    };
}
