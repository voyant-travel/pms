import { financeService } from "@voyant-travel/finance"
import { createVoyantApp } from "@voyant-travel/framework"
import { netopiaHonoBundle } from "@voyant-travel/plugin-netopia"
import { mountWorkflowRunsAdminRoutes, WorkflowRunnerRegistry } from "@voyant-travel/workflow-runs"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { OPERATOR_APP_NAME, operatorReporter } from "../lib/observability"
import authHandler, {
  hasAuthPermission,
  resolveAuthRequest,
  validateApiTokenAccess,
} from "./auth/handler"
import {
  buildOperatorProviders,
  deploymentLocalExtensions,
  deploymentLocalModules,
  OPERATOR_EXCLUDED,
} from "./composition"
import { dbFromEnvForApp, httpDbFromEnvForApp } from "./lib/db"
import { bookingScheduleBundle } from "./routes/booking-schedule"
import { channelPushBundle } from "./routes/channel-push"
import {
  createOperatorWorkflowDriver,
  generateContractPdfForBooking,
} from "./runtime/operator-runtime-adapter"
import { tripsPaymentBundle } from "./runtime/trips-runtime"
import { catalogBridgeBundle } from "./subscribers/catalog-bridge"
import { createCatalogCheckoutBundle } from "./subscribers/catalog-checkout-finalize-runtime"
import { smartbillOperatorBundle } from "./subscribers/smartbill"

/**
 * Process-wide registry of workflow runners. Bundles register their
 * runners on bootstrap (see `createCatalogCheckoutBundle`) so the
 * `/v1/admin/workflow-runs/:id/{rerun,resume}` endpoints can dispatch
 * a workflow by name. The dashboard's "Rerun" / "Resume" buttons are
 * powered by this registry. Self-hosted workflow services should
 * register runners that call `createSelfHostWorkflowClient(...)`
 * and forward resume calls with `ctx.resumeFromStep` and
 * `ctx.seedResults`.
 */
const workflowRunnerRegistry = new WorkflowRunnerRegistry()

// The standard module/extension set is owned by @voyant-travel/framework;
// `createVoyantApp` assembles it (FRAMEWORK_RUNTIME_MANIFEST + frameworkComposition)
// with this deployment's injected `providers` and its two deployment-local module
// families (`deploymentLocalModules`), then composes + mounts. The deployment no
// longer hand-maintains a manifest or registry. See the consolidated-deployments
// RFC (Workstream B) + voyant#1608 / #1620.
export const app = createVoyantApp<CloudflareBindings, ReturnType<typeof buildOperatorProviders>>({
  providers: buildOperatorProviders(),
  modules: deploymentLocalModules,
  extensions: deploymentLocalExtensions,
  // Stays-only PMS: drop the standard flights module (ADR-0007 subsetting).
  // cruises/charters/MICE were deployment-local and are simply not registered.
  exclude: OPERATOR_EXCLUDED,
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
  // Workflow runtime — managed Cloud forwarding. App code forwards
  // trigger/event calls to Voyant Cloud; workflow bundles execute in the
  // hosted Node runtime.
  workflows: {
    driver: createOperatorWorkflowDriver,
  },
  // Durable event delivery (RFC voyant#1687 Phase 2.1): emits persist to
  // the event_outbox table before subscribers run; failed deliveries are
  // retried by the */2min drain cron in entry.ts. Requires migration
  // 0062 (event_outbox).
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
    "/v1/public/payment-link-config",
    "/v1/public/payment-link",
    "/v1/public/products",
    "/v1/public/accommodations",
    "/v1/public/operator-profile",
    "/v1/public/payment-policy",
    "/v1/local/mock-card",
  ],
  plugins: [
    // bookingScheduleBundle subscribes to booking.confirmed BEFORE
    // legal's auto-generate-contract subscriber so the rendered
    // contract reads the freshly-written deposit/balance rows.
    bookingScheduleBundle,
    catalogBridgeBundle,
    createCatalogCheckoutBundle({
      workflowRunnerRegistry,
      generateContractPdf: ({ env, db, eventBus, bookingId }) =>
        generateContractPdfForBooking(env, db, eventBus, bookingId),
    }),
    tripsPaymentBundle,
    smartbillOperatorBundle,
    channelPushBundle,
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
    // Every domain + deployment-local route family is now composed through the
    // registry (see composition.ts). The only thing left here is the workflow-
    // runs admin surface, which is coupled to the app-level runner registry that
    // bundle bootstraps populate at construction time.

    // Workflow runs admin surface — list/get + rerun/resume actions
    // feeding the `WorkflowRunsPage` UI from
    // `@voyant-travel/workflows-react/ui`. The registry is populated by
    // bundle bootstraps (e.g. catalog-checkout registers the
    // `checkout-finalize` runner).
    mountWorkflowRunsAdminRoutes(hono, {
      runners: workflowRunnerRegistry,
      resolveUserId: (c) => {
        // Hono Context — typed loosely so the package stays
        // transport-agnostic; pull the userId set by the auth
        // middleware. Returns null for runs triggered without an
        // active session (shouldn't happen on the admin surface).
        const ctx = c as { get: (key: string) => unknown }
        const userId = ctx.get("userId")
        return typeof userId === "string" ? userId : null
      },
    })

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
