import type { RealtimeClientMessage } from "./connector.js";
import { type HintToQueryKeys } from "./query-keys.js";
export interface UseLiveQueriesOptions {
    /** Pause all subscriptions without unmounting. */
    enabled?: boolean;
    /** Observe raw messages in addition to the invalidation behaviour. */
    onMessage?: (channel: string, message: RealtimeClientMessage) => void;
}
/**
 * The hook most screens need: subscribe to one or more channels and translate
 * each invalidation hint into `queryClient.invalidateQueries` calls, so
 * existing data-fetching screens go live without rewriting their data layer.
 *
 * `map` turns a hint (`{ entity, id }`) into the React Query keys to refetch.
 * Subscriptions are managed by a single effect (no hooks-in-a-loop); pass a
 * stable `channels` array (memoise in the caller) to avoid re-subscribing.
 */
export declare function useLiveQueries(channels: ReadonlyArray<string>, map: HintToQueryKeys, options?: UseLiveQueriesOptions): void;
//# sourceMappingURL=use-live-queries.d.ts.map