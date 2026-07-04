import type { RealtimeConnector } from "./connector.js";
/**
 * Structural subset of the cloud-sdk `RealtimeChannel` this adapter depends on.
 * Declared locally so `@voyant-travel/realtime-react` stays decoupled from
 * `@voyant-travel/cloud-sdk` — callers inject the real constructor.
 *
 * @see https://github.com/voyant-travel/cloud-sdk/pull/23
 */
export interface CloudRealtimeMessage {
    event: string;
    data: unknown;
}
export interface CloudRealtimePresenceEvent {
    action: "enter" | "leave" | "update";
    clientId: string;
    data?: unknown;
}
export interface RealtimeChannelLike {
    on(event: "message", handler: (message: CloudRealtimeMessage) => void): () => void;
    on(event: "presence", handler: (event: CloudRealtimePresenceEvent) => void): () => void;
    enterPresence(data?: unknown): void;
    close(): void;
}
export interface RealtimeChannelCtorOptions {
    channel: string;
    token: string;
    baseUrl?: string;
    sinceId?: string;
}
export type RealtimeChannelCtor = new (options: RealtimeChannelCtorOptions) => RealtimeChannelLike;
export interface CreateRealtimeChannelConnectorOptions {
    /** HTTP(S) API origin forwarded to each channel (converted to ws(s)://). */
    baseUrl?: string;
}
/**
 * Adapt the cloud-sdk `RealtimeChannel` constructor into a vendor-agnostic
 * {@link RealtimeConnector} for the hooks. Inject the constructor so this stays
 * decoupled from the SDK:
 *
 * ```ts
 * import { RealtimeChannel } from "@voyant-travel/cloud-sdk"
 * const connector = createRealtimeChannelConnector(RealtimeChannel, { baseUrl })
 * ```
 *
 * Presence is tracked incrementally from `enter`/`update`/`leave` events into a
 * member list; subscribers that need the full set on connect should seed it
 * from `client.realtime.presence.get(channel)`.
 */
export declare function createRealtimeChannelConnector(RealtimeChannelCtor: RealtimeChannelCtor, options?: CreateRealtimeChannelConnectorOptions): RealtimeConnector;
//# sourceMappingURL=connector-cloud.d.ts.map