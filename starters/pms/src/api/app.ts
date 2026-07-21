import { financeService } from "@voyant-travel/finance"
import { createVoyantApp } from "@voyant-travel/framework"
import { netopiaHonoBundle } from "@voyant-travel/plugin-netopia"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { OPERATOR_APP_NAME, operatorReporter } from "../lib/observability"
import authHandler, {
  hasAuthPermission,
  resolveAuthRequest,
  validateApiTokenAccess,
} from "./auth/handler"
import {
  buildOperatorProviders,
  operatorComposition,
  operatorGraphComposition,
  operatorProjectRuntime,
} from "./composition"
import { dbFromEnvForApp, httpDbFromEnvForApp } from "./lib/db"
import { mountStayBookingDetailRoutes } from "./routes/stay-booking-detail"
import { bindOperatorGraphEventDelivery } from "./runtime/worker-runtime-host"
import { smartbillOperatorBundle } from "./subscribers/smartbill"

// Standard modules, extensions, and subscriber facet modules are composed from
// the generated project graph in composition.ts. This app adds only PMS-local
// factories and bundles.
export const app = createVoyantApp<CloudflareBindings, ReturnType<typeof buildOperatorProviders>>({
  providers: buildOperatorProviders(),
  modules: operatorComposition.modules,
  extensions: operatorComposition.extensions,
  accessCatalog: operatorProjectRuntime.graphRuntime.accessCatalog,
  accessResources: operatorGraphComposition.accessResources,
  dbTransactionalPaths: operatorGraphComposition.routePosture.transactionalPaths,
  // Observability seam (RFC voyant#1553): stamp this app's name on emitted
  // error events and forward unhandled 5xx exceptions — each tagged with the
  // same `requestId` shown to the user on `X-Request-Id` — to the Workers log
  // drain. The same sink is wired into the lean auth app (api/auth/handler.ts),
  // which is dispatched around this graph. Swap `operatorReporter` for a
  // Sentry/OpenTelemetry adapter in one place; the no-op default stays valid.
  appName: OPERATOR_APP_NAME,
  reporter: operatorReporter,
  // Split data plane (perf, RFC voyant#1687 Phase 1.1):
  // - `db` (default): neon-http — one fetch per query, NO connection
  //   handshake. Serves all reads and single-statement writes.
  // - `dbTransactional`: per-request Neon WebSocket Pool — the only
  //   Workers-compatible client that supports db.transaction(). createApp
  //   routes it to the surfaces of modules/extensions declaring
  //   `requiresTransactionalDb` or `transactionalPaths` — the trips module and
  //   the catalog booking engine respectively (ADR-0008), so this deployment no
  //   longer hand-maintains a `dbTransactionalPaths` list.
  // `DB_FORCE_TRANSACTIONAL=1` reverts to the WS client for ALL requests
  // (operational escape hatch if a transactional surface was missed).
  db: (env) =>
    env.DB_FORCE_TRANSACTIONAL === "1" ? dbFromEnvForApp(env) : httpDbFromEnvForApp(env),
  dbTransactional: (env) => dbFromEnvForApp(env),
  // Durable event delivery (RFC voyant#1687 Phase 2.1): emits persist to
  // the event_outbox table before subscribers run; failed deliveries are
  // retried by the DB package's selected event-outbox job. Requires migration
  // 0062 (event_outbox); delivery state remains authoritative in the database.
  outbox: true,
  // ADR-0008: the anonymous-access surface is DECLARED on the routes that own it
  // (`anonymous` on the module/extension, or on a plugin bundle for webhook
  // routes — the Netopia callback now declares its own via `netopiaHonoBundle`),
  // and the framework assembles the allow-list (see the `anonymous-surface` test
  // in @voyant-travel/framework). What remains here is the escape hatch: routes
  // not yet owned by an annotatable module, tracked for migration onto their
  // owning package module.
  //   - payment-link / payment-link-config: the storefront payment-link family
  //     mounts at split prefixes via lazy absolute routes; pending a per-bundle
  //     declaration.
  //   - products / accommodations: storefront detail surfaces whose owning
  //     module isn't yet annotated.
  //   - operator-profile / payment-policy: sanitized storefront-preview reads;
  //     owning module not yet annotated.
  publicPaths: [
    ...operatorGraphComposition.routePosture.publicPaths,
    "/v1/public/payment-link-config",
    "/v1/public/payment-link",
    "/v1/public/products",
    "/v1/public/accommodations",
    // Guest-authorized rich stay-booking detail (mounted in additionalRoutes).
    // Access is gated per-request by a traveler-email match or a
    // `voyant_guest_booking` capability — an id in the path alone leaks nothing.
    "/v1/public/stay-bookings",
    "/v1/public/operator-profile",
    "/v1/public/payment-policy",
    "/v1/local/mock-card",
  ],
  plugins: [
    // Standard product subscribers are graph-owned and are mounted through
    // operatorComposition. Only deployment/provider plugins remain here.
    smartbillOperatorBundle,
    netopiaHonoBundle(),
  ],
  auth: {
    handler: () => ({
      fetch: async (request, env, ctx) =>
        authHandler.fetch(request, env, ctx as ExecutionContext | undefined),
    }),
    resolve: async ({ request, env }) => resolveAuthRequest(request, env),
    hasPermission: async ({ request, env }) => hasAuthPermission(request, env),
    validateApiKey: async ({ env, db, apiKey }) => validateApiTokenAccess(env, db, apiKey),
  },
  additionalRoutes: (hono) => {
    // Guest-facing rich stay detail for the confirmation + manage-booking
    // pages. Authorization is enforced inside the handler (email match or
    // guest-booking capability); the prefix is listed in `publicPaths` above.
    mountStayBookingDetailRoutes(hono)

    hono.get("/v1/local/mock-card/:sessionId/approve", async (c) => {
      const mockEnabled = String(
        (c.env as { MOCK_CARD_PAYMENTS?: string }).MOCK_CARD_PAYMENTS ?? "",
      )
        .trim()
        .toLowerCase()
      if (!["1", "true", "yes", "on"].includes(mockEnabled)) {
        return c.json({ error: "mock_card_payments_disabled" }, 404)
      }

      const sessionId = c.req.param("sessionId")
      const db = c.get("db") as PostgresJsDatabase
      const eventBus = (c.var as { eventBus?: unknown }).eventBus
      const payment = await financeService.completePaymentSession(
        db,
        sessionId,
        {
          status: "paid",
          captureMode: "automatic",
          paymentMethod: "credit_card",
          providerPaymentId: `mock_payment_${sessionId}`,
          externalReference: `MOCK-${sessionId}`,
          providerPayload: {
            localMock: true,
            approvedAt: new Date().toISOString(),
          },
          metadata: { localMock: true },
          notes: "Approved by local mock card provider.",
        },
        { eventBus: eventBus as never },
      )

      if (!payment) {
        return c.json({ error: "payment_session_not_found" }, 404)
      }

      // A real PSP redirects the browser to the checkout's return URL after
      // an approved payment. Emulate that so the storefront card flow lands
      // on its confirmation page (`/shop/confirmation/:bookingId`) instead of
      // stranding the guest on the mock pay landing. Fall back to the pay
      // landing page only when the session carries no return URL (e.g.
      // operator-sent payment links, which have no storefront to return to).
      if (payment.returnUrl) {
        return c.redirect(payment.returnUrl)
      }

      const origin =
        (
          c.env as { PUBLIC_CHECKOUT_BASE_URL?: string; DASH_BASE_URL?: string; APP_URL?: string }
        ).PUBLIC_CHECKOUT_BASE_URL?.trim() ||
        (c.env as { DASH_BASE_URL?: string }).DASH_BASE_URL?.trim() ||
        (c.env as { APP_URL?: string }).APP_URL?.trim().replace(/\/api\/?$/, "") ||
        new URL(c.req.url).origin
      return c.redirect(
        `${origin.replace(/\/$/, "")}/pay/${encodeURIComponent(sessionId)}?mockCard=approved`,
      )
    })
  },
})

bindOperatorGraphEventDelivery(async (event, bindings) => {
  await app.ready(bindings)
  if (!app.eventBus.deliver) {
    throw new Error("The operator event bus does not support durable event redelivery.")
  }
  return app.eventBus.deliver(event as Parameters<NonNullable<typeof app.eventBus.deliver>>[0])
})
