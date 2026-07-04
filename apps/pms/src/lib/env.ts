/**
 * API URL helper.
 *
 * API is embedded at /api on the same origin — no cross-origin needed.
 * Returns an absolute URL so Better Auth's `new URL(baseURL)` works during SSR.
 */

export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api`
  }
  // SSR: fall back to the dev origin. In prod, set DASH_BASE_URL.
  return `${process.env.DASH_BASE_URL ?? "http://localhost:3300"}/api`
}
