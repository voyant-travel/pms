import type { PresenceMember, RealtimeClientMessage } from "./connector.js";
export interface UseChannelOptions {
    /** Called for each message delivered on the channel. */
    onMessage?: (message: RealtimeClientMessage) => void;
    /** Called when the channel's presence set changes. */
    onPresence?: (members: ReadonlyArray<PresenceMember>) => void;
    /** Resume marker for replay-capable vendors. */
    sinceId?: string;
    /** Local presence profile announced to the channel. */
    profile?: unknown;
    /** Set `false` to pause the subscription without unmounting. */
    enabled?: boolean;
}
/**
 * Subscribe to a single realtime channel. Mints a token via the provider's
 * token route, opens a connection through the injected connector, and tears it
 * down on unmount / channel change. Vendor-agnostic — the transport is whatever
 * connector the `RealtimeReactProvider` was given.
 */
export declare function useChannel(channel: string | null | undefined, options?: UseChannelOptions): void;
//# sourceMappingURL=use-channel.d.ts.map