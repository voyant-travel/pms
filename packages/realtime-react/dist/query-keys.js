function isHint(value) {
    return (typeof value === "object" &&
        value !== null &&
        typeof value.entity === "string" &&
        typeof value.event === "string");
}
/**
 * Pure translation of a channel message into the query keys to invalidate.
 * Returns `[]` when the payload is not a recognisable hint or the map yields
 * nothing — callers can safely spread the result into `invalidateQueries`.
 */
export function resolveInvalidationKeys(message, map) {
    if (!isHint(message.data))
        return [];
    return map(message.data);
}
