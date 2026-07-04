import { type ReactNode } from "react";
import type { RealtimeConnector } from "./connector.js";
export type RealtimeTokenFetcher = () => Promise<{
    token: string;
    expiresAt: string;
}>;
export interface RealtimeReactContextValue {
    connector: RealtimeConnector;
    /** Fetches a fresh client token from the deployment's token-mint route. */
    fetchToken: RealtimeTokenFetcher;
}
export interface RealtimeReactProviderProps {
    /** Vendor-specific browser transport (Voyant Cloud, Ably, Pusher, …). */
    connector: RealtimeConnector;
    /**
     * Token endpoint to call for a scoped client token. Defaults to
     * `/v1/public/realtime/token` (use the admin path for staff surfaces).
     */
    tokenEndpoint?: string;
    /** Override the fetch implementation (defaults to credentialed `fetch`). */
    fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
    /** Fully override token retrieval (takes precedence over `tokenEndpoint`). */
    fetchToken?: RealtimeTokenFetcher;
    children: ReactNode;
}
export declare function RealtimeReactProvider({ connector, tokenEndpoint, fetcher, fetchToken, children, }: RealtimeReactProviderProps): import("react/jsx-runtime").JSX.Element;
export declare function useRealtimeContext(): RealtimeReactContextValue;
//# sourceMappingURL=provider.d.ts.map