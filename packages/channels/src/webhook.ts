/**
 * Pure shared-secret check for the public channel webhook. No db, no Hono —
 * unit-tested in `webhook.test.ts`.
 *
 * The public webhook (`POST /v1/public/pms/channels/:channel/webhook`) is
 * anonymous by construction, so it authenticates the caller with a shared secret
 * carried in the `x-channel-secret` header, compared against the deployment's
 * `CHANNEL_WEBHOOK_SECRET` binding. A connector's own provider-signature check
 * (`ChannelConnector.verifyWebhook`) is an ADDITIONAL, independent gate.
 */

/** The header a channel must send carrying the shared secret. */
export const CHANNEL_WEBHOOK_SECRET_HEADER = "x-channel-secret"

export type WebhookSecretCheck =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "missing_header" | "mismatch" }

/**
 * Constant-time-ish comparison of the presented secret against the expected one.
 * Fails closed: an unconfigured secret (`undefined`/empty binding) rejects every
 * request rather than opening the endpoint.
 */
export function checkWebhookSecret(
  expected: string | undefined,
  presented: string | null | undefined,
): WebhookSecretCheck {
  if (!expected) return { ok: false, reason: "not_configured" }
  if (!presented) return { ok: false, reason: "missing_header" }
  if (!timingSafeEqual(expected, presented)) return { ok: false, reason: "mismatch" }
  return { ok: true }
}

/** Length-independent, byte-wise comparison that avoids early-exit timing leaks. */
function timingSafeEqual(a: string, b: string): boolean {
  let mismatch = a.length === b.length ? 0 : 1
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}
