import type { PresenceMember } from "./connector.js";
/**
 * Track the presence member list of a channel ("Ana is viewing this booking").
 * Returns the current members; `profile` is announced as this client's entry.
 */
export declare function usePresence(channel: string | null | undefined, profile?: unknown): ReadonlyArray<PresenceMember>;
//# sourceMappingURL=use-presence.d.ts.map