import { createMiddleware, createStart } from "@tanstack/react-start"

/**
 * Disable server-side execution of route loaders and components by default.
 *
 * Routes opt back into SSR with `ssr: true` or `ssr: "data-only"` and use
 * the SSR-aware `operatorFetcher` from `lib/voyant-fetcher.ts` to forward
 * the incoming request's cookies. The SPA-mode default keeps the rest of
 * the dashboard on the existing client-only path during the gradual SSR
 * rollout.
 */
const csrfMiddleware = createMiddleware({ type: "request" }).server(
  ({ request, serverFnMeta, next }) => {
    // Only enforce on server function RPC requests — route loaders that opt
    // into SSR don't need this guard (they're not externally callable RPCs).
    if (!serverFnMeta) return next()

    const method = request.method.toUpperCase()
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next()

    const origin = request.headers.get("origin")
    if (!origin) return next()

    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return new Response("Forbidden", { status: 403 })
      }
    } catch {
      return new Response("Forbidden", { status: 403 })
    }

    return next()
  },
)

export const startInstance = createStart(() => ({
  defaultSsr: false,
  requestMiddleware: [csrfMiddleware],
}))
