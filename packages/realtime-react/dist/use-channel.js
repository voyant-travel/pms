"use client";
import { useEffect, useRef } from "react";
import { useRealtimeContext } from "./provider.js";
/**
 * Subscribe to a single realtime channel. Mints a token via the provider's
 * token route, opens a connection through the injected connector, and tears it
 * down on unmount / channel change. Vendor-agnostic — the transport is whatever
 * connector the `RealtimeReactProvider` was given.
 */
export function useChannel(channel, options = {}) {
    const { connector, fetchToken } = useRealtimeContext();
    const { onMessage, onPresence, sinceId, profile, enabled = true } = options;
    // Keep the latest callbacks without re-subscribing on every render.
    const handlers = useRef({ onMessage, onPresence });
    handlers.current = { onMessage, onPresence };
    useEffect(() => {
        if (!channel || !enabled)
            return;
        let connection = null;
        let cancelled = false;
        void fetchToken().then(({ token }) => {
            if (cancelled)
                return;
            connection = connector.subscribe({
                channel,
                token,
                sinceId,
                profile,
                onMessage: (message) => handlers.current.onMessage?.(message),
                onPresence: (members) => handlers.current.onPresence?.(members),
            });
        });
        return () => {
            cancelled = true;
            connection?.unsubscribe();
        };
    }, [channel, enabled, sinceId, profile, connector, fetchToken]);
}
