import { describe, expect, it } from "vitest"

import { checkWebhookSecret } from "./webhook"

describe("checkWebhookSecret", () => {
  it("accepts a matching secret", () => {
    expect(checkWebhookSecret("s3cret", "s3cret")).toEqual({ ok: true })
  })

  it("fails closed when no secret is configured", () => {
    expect(checkWebhookSecret(undefined, "anything")).toEqual({
      ok: false,
      reason: "not_configured",
    })
    expect(checkWebhookSecret("", "anything")).toEqual({ ok: false, reason: "not_configured" })
  })

  it("rejects a missing header", () => {
    expect(checkWebhookSecret("s3cret", null)).toEqual({ ok: false, reason: "missing_header" })
    expect(checkWebhookSecret("s3cret", undefined)).toEqual({ ok: false, reason: "missing_header" })
    expect(checkWebhookSecret("s3cret", "")).toEqual({ ok: false, reason: "missing_header" })
  })

  it("rejects a wrong secret", () => {
    expect(checkWebhookSecret("s3cret", "guess")).toEqual({ ok: false, reason: "mismatch" })
  })

  it("rejects a prefix of the secret (length-aware compare)", () => {
    expect(checkWebhookSecret("s3cret", "s3cre")).toEqual({ ok: false, reason: "mismatch" })
  })
})
