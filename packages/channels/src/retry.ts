/**
 * Pure retry/attempt-counting logic for the outbound ARI push worker. No db, no
 * Hono — unit-tested in `retry.test.ts`.
 *
 * `processPendingAriEvents` calls `nextEventState` with the connector's
 * {@link PushResult} and the row's current attempt count to decide the row's new
 * `(status, attempts, lastError)` without embedding the policy in the service.
 */

import type { PushResult } from "./connector.js"

/** After this many failed attempts a pending event is parked as `failed`. */
export const MAX_ARI_PUSH_ATTEMPTS = 5

export type AriEventStatus = "pending" | "pushed" | "failed" | "skipped"

export interface AriEventState {
  status: AriEventStatus
  attempts: number
  lastError: string | null
}

/**
 * Given the current attempt count and the connector's push outcome, compute the
 * row's next persisted state:
 *   - `pushed`  → terminal success.
 *   - `skipped` → terminal no-op (connector declined; does NOT burn a retry).
 *   - `failed`  → increment attempts; stay `pending` for another sweep until the
 *                 count reaches {@link MAX_ARI_PUSH_ATTEMPTS}, then park as `failed`.
 */
export function nextEventState(currentAttempts: number, result: PushResult): AriEventState {
  if (result.status === "pushed") {
    return { status: "pushed", attempts: currentAttempts + 1, lastError: null }
  }
  if (result.status === "skipped") {
    return { status: "skipped", attempts: currentAttempts, lastError: result.error ?? null }
  }
  const attempts = currentAttempts + 1
  const exhausted = attempts >= MAX_ARI_PUSH_ATTEMPTS
  return {
    status: exhausted ? "failed" : "pending",
    attempts,
    lastError: result.error ?? "push failed",
  }
}

/** A thrown push (connector bug) is treated as a failed attempt, same counting. */
export function stateForThrow(currentAttempts: number, error: unknown): AriEventState {
  return nextEventState(currentAttempts, {
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
  })
}
