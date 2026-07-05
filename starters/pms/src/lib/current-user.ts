import { createMiddleware, createServerFn } from "@tanstack/react-start"

export type { AuthMode, BootstrapStatus, CurrentUser } from "./current-user-model"

import type { BootstrapStatus, CurrentUser } from "./current-user-model"
import { getOperatorStartEnv } from "./operator-start-context"

export function cloudAuthStartHref(next?: string): string {
  const params = new URLSearchParams()
  if (next) {
    params.set("next", next)
  }

  const query = params.toString()
  return `/api/auth/cloud/start${query ? `?${query}` : ""}`
}

function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname
  return hostname === "127.0.0.1" || hostname === "localhost"
}

function shouldUseBrowserEvidenceAuthFallback(request: Request): boolean {
  return process.env.VOYANT_OPERATOR_BROWSER_EVIDENCE === "1" && isLocalRequest(request)
}

const withRequest = createMiddleware({ type: "request" }).server(({ context, next, request }) => {
  return next({
    context: { request, env: getOperatorStartEnv(context) },
  })
})

export const getBootstrapStatus = createServerFn({ method: "GET" })
  .middleware([withRequest])
  .handler(async ({ context }) => {
    if (shouldUseBrowserEvidenceAuthFallback(context.request)) {
      return { hasUsers: true }
    }

    if (context.env) {
      const { getBootstrapStatusForRequest } = await import("../api/auth/handler")
      return getBootstrapStatusForRequest(context.request, context.env)
    }

    const response = await fetch(new URL("/api/auth/bootstrap-status", context.request.url), {
      method: "GET",
    })
    if (!response.ok) throw new Error("Failed to fetch bootstrap status")
    return (await response.json()) as BootstrapStatus
  })

export const getCurrentUser = createServerFn({ method: "GET" })
  .middleware([withRequest])
  .handler(async ({ context }) => {
    if (shouldUseBrowserEvidenceAuthFallback(context.request)) {
      return null
    }

    if (context.env) {
      const { getCurrentUserForRequest } = await import("../api/auth/handler")
      return getCurrentUserForRequest(context.request, context.env)
    }

    const headers = new Headers()
    const cookie = context.request.headers.get("cookie")

    if (cookie) {
      headers.set("cookie", cookie)
    }

    const response = await fetch(new URL("/api/auth/me", context.request.url), {
      headers,
      method: "GET",
    })

    if (response.status === 401) {
      return null
    }

    if (!response.ok) {
      throw new Error("Failed to fetch current user")
    }

    return (await response.json()) as CurrentUser
  })

export function getCurrentUserQueryOptions(initialUser?: CurrentUser | null) {
  return {
    queryKey: ["current-user"] as const,
    queryFn: () => getCurrentUser(),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    ...(initialUser !== undefined ? { initialData: initialUser } : {}),
  }
}
