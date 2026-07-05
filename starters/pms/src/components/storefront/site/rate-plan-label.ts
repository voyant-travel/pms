/**
 * Rate-plan label parsing for the storefront.
 *
 * Seeded rate-plan names encode both a meal/board plan and a cancellation
 * policy, but the two are NOT always in the same order:
 *   - "Flexible — Bed & Breakfast"   → cancellation first
 *   - "Non-refundable — Room Only"   → cancellation first
 *   - "Half Board — Flexible"        → board first
 *
 * A position-based split ("everything after the — is the board") mislabels
 * the last case as board "Flexible" and drops the cancellation policy. This
 * helper classifies each segment by keyword instead, so board and
 * cancellation are recovered regardless of order.
 */

export interface RatePlanLabel {
  board: string
  cancellation: string | null
}

/** Board/meal-plan keywords, matched case-insensitively anywhere in a segment. */
const BOARD_PATTERN =
  /bed\s*(?:&|and)\s*breakfast|room only|half board|full board|all[- ]inclusive|breakfast/i

/**
 * Cancellation/policy keywords in priority order — the first that appears in
 * the name wins. Non-refundable takes precedence (it's the most consequential
 * for the guest) over the weekly-minimum and flexible labels.
 */
const CANCELLATION_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/non-refundable/i, "Non-refundable"],
  [/weekly/i, "7-night minimum"],
  [/flexible/i, "Free cancellation"],
]

function resolveCancellation(name: string): string | null {
  for (const [pattern, label] of CANCELLATION_RULES) {
    if (pattern.test(name)) return label
  }
  return null
}

/**
 * Derive a human meal-plan + cancellation label from a rate-plan name,
 * order-independently. Falls back to "Room only" when no board keyword is
 * present.
 */
export function describeRate(name: string): RatePlanLabel {
  const parts = name
    .split(/\s*—\s*/)
    .map((p) => p.trim())
    .filter(Boolean)

  const cancellation = resolveCancellation(name)

  // Prefer the segment that actually names a board. If none does, use the
  // segment that isn't the cancellation policy; failing that, "Room only".
  const boardSegment =
    parts.find((p) => BOARD_PATTERN.test(p)) ?? parts.find((p) => !resolveCancellation(p))

  const board = boardSegment?.trim() || "Room only"

  return { board, cancellation }
}
