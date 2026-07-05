/**
 * API client for the admin dashboard.
 *
 * Uses Hono RPC for end-to-end type-safe API calls.
 * The browser sends requests directly to the API with credentials: "include".
 * The session cookie (better-auth.session_token) is sent automatically.
 */

import { hc } from "hono/client"

import type { AppType } from "../api/api-types"
import { getApiUrl } from "./env"
import { operatorFetcher } from "./voyant-fetcher"

export const client = hc<AppType>(getApiUrl(), {
  init: { credentials: "include" },
})

// ---------------------------------------------------------------------------
// Legacy client — kept for incremental migration of non-module routes
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

interface ApiCallOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>
}

function extractErrorMessage(status: number, statusText: string, body: unknown): string {
  let message = `API error: ${status} ${statusText}`
  if (typeof body === "object" && body !== null && "error" in body) {
    const errorField = (body as { error: unknown }).error
    if (typeof errorField === "string") {
      message = errorField
    } else if (typeof errorField === "object" && errorField !== null && "message" in errorField) {
      message = String((errorField as { message: string }).message)
    }
  }
  return message
}

export async function apiCall<T = unknown>(path: string, options: ApiCallOptions = {}): Promise<T> {
  const { headers: customHeaders, ...fetchOptions } = options
  const apiUrl = getApiUrl()

  const headers = new Headers({
    "Content-Type": "application/json",
    ...customHeaders,
  })

  // Goes through `operatorFetcher`: on the client this is a normal
  // `credentials: "include"` fetch; on the server it forwards the incoming
  // request's cookie + rewrites to the request origin so the loader hits
  // the same Worker's /api/* route.
  const response = await operatorFetcher(`${apiUrl}${path}`, {
    ...fetchOptions,
    headers,
  })

  if (!response.ok) {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = await response.text().catch(() => undefined)
    }

    throw new ApiError(
      extractErrorMessage(response.status, response.statusText, body),
      response.status,
      body,
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

export const api = {
  fetch: apiCall,

  get: <T = unknown>(path: string, options?: ApiCallOptions) =>
    apiCall<T>(path, { ...options, method: "GET" }),

  post: <T = unknown>(path: string, body?: unknown, options?: ApiCallOptions) =>
    apiCall<T>(path, {
      ...options,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  put: <T = unknown>(path: string, body?: unknown, options?: ApiCallOptions) =>
    apiCall<T>(path, {
      ...options,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T = unknown>(path: string, body?: unknown, options?: ApiCallOptions) =>
    apiCall<T>(path, {
      ...options,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T = unknown>(path: string, options?: ApiCallOptions) =>
    apiCall<T>(path, { ...options, method: "DELETE" }),
}
