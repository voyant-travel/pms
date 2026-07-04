/**
 * A realtime message as seen by the browser. Mirrors the server-side
 * `RealtimeMessage` from `@voyant-travel/realtime`; for the EventBus bridge the
 * `data` is a `RealtimeInvalidationHint`.
 */
export interface RealtimeClientMessage {
    event: string;
    data: unknown;
}
/** A presence member published by the transport. */
export interface PresenceMember {
    clientId: string;
    profile?: unknown;
}
export interface RealtimeSubscribeOptions {
    channel: string;
    /** Short-lived client token minted by the realtime token route. */
    token: string;
    onMessage?: (message: RealtimeClientMessage) => void;
    onPresence?: (members: ReadonlyArray<PresenceMember>) => void;
    /** Resume marker for at-least-once vendors that support replay. */
    sinceId?: string;
    /** Local presence profile announced to the channel's member set. */
    profile?: unknown;
}
/** A live subscription handle. */
export interface RealtimeConnection {
    unsubscribe(): void;
}
/**
 * Vendor-specific browser transport. This is the injection seam that keeps the
 * hooks vendor-agnostic: Voyant Cloud ships a connector backed by its
 * `RealtimeChannel` client, and self-hosters pass their own (Ably, Pusher,
 * a raw WebSocket/SSE wrapper, …).
 */
export interface RealtimeConnector {
    subscribe(options: RealtimeSubscribeOptions): RealtimeConnection;
}
//# sourceMappingURL=connector.d.ts.map