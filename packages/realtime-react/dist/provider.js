"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useMemo } from "react";
const RealtimeReactContext = createContext(null);
const defaultFetcher = (url, init) => fetch(url, { credentials: "include", ...init });
export function RealtimeReactProvider({ connector, tokenEndpoint = "/v1/public/realtime/token", fetcher = defaultFetcher, fetchToken, children, }) {
    const value = useMemo(() => {
        const resolveToken = fetchToken ??
            (async () => {
                const response = await fetcher(tokenEndpoint, { method: "POST" });
                if (!response.ok) {
                    throw new Error(`Realtime token request failed: ${response.status}`);
                }
                const body = (await response.json());
                return { token: body.data.token, expiresAt: body.data.expiresAt };
            });
        return { connector, fetchToken: resolveToken };
    }, [connector, tokenEndpoint, fetcher, fetchToken]);
    return _jsx(RealtimeReactContext.Provider, { value: value, children: children });
}
export function useRealtimeContext() {
    const context = useContext(RealtimeReactContext);
    if (!context) {
        throw new Error("useRealtimeContext must be used inside <RealtimeReactProvider>. Wrap your app with <RealtimeReactProvider connector={...} />.");
    }
    return context;
}
