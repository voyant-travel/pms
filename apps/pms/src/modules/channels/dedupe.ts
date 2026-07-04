/**
 * Pure idempotency-key + date-range helpers for outbound ARI events. No db, no
 * Hono — unit-tested in `dedupe.test.ts`.
 *
 * The dedupe key collapses a re-enqueue of the same (channel, roomType, ratePlan,
 * date-range) onto the existing ledger row (`pms_channel_ari_events.dedupe_key` is
 * UNIQUE), so an ARI edit re-pushed before the previous push drains does not fan
 * out duplicate work at the channel.
 */

import type { AriDelta } from "./connector.js"

/** The date span a delta covers, as `[min, max]` inclusive `YYYY-MM-DD`. */
export function ariDateRange(dates: readonly { date: string }[]): [string, string] | null {
  if (dates.length === 0) return null
  let min = dates[0]!.date
  let max = dates[0]!.date
  for (const { date } of dates) {
    if (date < min) min = date
    if (date > max) max = date
  }
  return [min, max]
}

/**
 * Build the deterministic dedupe key for a delta bound to a channel. Stable across
 * key ordering and independent of the intra-range dates (only the min/max bound
 * the key) — two edits to the same room/rate over the same window share a key.
 * A delta with no dates keys on `-` so it still dedupes rather than throwing.
 */
export function buildAriDedupeKey(channel: string, delta: AriDelta): string {
  const range = ariDateRange(delta.dates)
  const span = range ? `${range[0]}:${range[1]}` : "-"
  return [channel, delta.propertyId, delta.roomTypeId, delta.ratePlanId ?? "-", span].join("|")
}
