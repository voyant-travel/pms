import { describe, expect, it, vi } from "vitest"
import { operatorApiDispatch } from "./hono-api-dispatch"

/**
 * Dispatch mechanics (prefix matching, URL rewriting, lean-auth ordering,
 * background warm-up) are covered in @voyant-travel/worker-runtime. These tests
 * cover the operator's wiring on top: the lean auth app answers CORS
 * preflight without touching the full API module graph.
 */
describe("operator API dispatch wiring", () => {
  it("exposes the /api prefix surface", () => {
    expect(operatorApiDispatch.isApiRequest("/api/v1/products")).toBe(true)
    expect(operatorApiDispatch.isApiRequest("/shop/api")).toBe(false)
    expect(operatorApiDispatch.isAuthRequest("/api/auth/me")).toBe(true)
    expect(operatorApiDispatch.isAuthRequest("/api/authz")).toBe(false)
  })

  it("strips the /api prefix and preserves the query string", () => {
    const forwarded = operatorApiDispatch.toAppRequest(
      new Request("https://example.test/api/v1/admin/settings?tab=profile"),
    )

    expect(forwarded.url).toBe("https://example.test/v1/admin/settings?tab=profile")
  })

  it("rewrites legacy persisted media URLs to the admin media surface", () => {
    const forwarded = operatorApiDispatch.toAppRequest(
      new Request("https://example.test/api/v1/media/uploads/photo.png?download=1"),
    )

    expect(forwarded.url).toBe("https://example.test/v1/admin/media/uploads/photo.png?download=1")
  })

  it("handles auth CORS preflight without loading the full API app", async () => {
    const request = new Request("https://example.test/api/auth/me", {
      method: "OPTIONS",
      headers: {
        origin: "https://dashboard.example",
        "access-control-request-method": "GET",
        "access-control-request-headers": "content-type",
      },
    })
    const env = {
      APP_URL: "https://example.test",
      CORS_ALLOWLIST: "https://dashboard.example",
    } as CloudflareBindings
    const ctx: ExecutionContext = {
      props: undefined,
      tracing: {} as ExecutionContext["tracing"],
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    }

    const response = await operatorApiDispatch.dispatch(request, env, ctx)

    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBe("https://dashboard.example")
    expect(response.headers.get("access-control-allow-credentials")).toBe("true")
    expect(response.headers.get("access-control-allow-methods")).toBe("GET")
    expect(response.headers.get("access-control-allow-headers")).toBe("content-type")
    expect(response.headers.get("vary")).toBe("Origin")
    // OPTIONS must not trigger the background API warm-up.
    expect(ctx.waitUntil).not.toHaveBeenCalled()
  })
})
