import type { QueryKey } from "@tanstack/react-query";
import type { RealtimeClientMessage } from "./connector.js";
/**
 * The invalidation hint shape published by the `@voyant-travel/realtime`
 * EventBus bridge.
 */
export interface RealtimeInvalidationHint {
    event: string;
    entity: string;
    id?: string;
}
/**
 * Maps a hint to the React Query keys that should be invalidated. Receiving a
 * `{ entity: "booking", id }` hint typically invalidates both the list and the
 * detail key for that entity.
 */
export type HintToQueryKeys = (hint: RealtimeInvalidationHint) => ReadonlyArray<QueryKey>;
/**
 * Pure translation of a channel message into the query keys to invalidate.
 * Returns `[]` when the payload is not a recognisable hint or the map yields
 * nothing — callers can safely spread the result into `invalidateQueries`.
 */
export declare function resolveInvalidationKeys(message: RealtimeClientMessage, map: HintToQueryKeys): ReadonlyArray<QueryKey>;
//# sourceMappingURL=query-keys.d.ts.map