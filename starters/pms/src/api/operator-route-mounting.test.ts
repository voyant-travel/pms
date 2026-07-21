/**
 * Integration smoke test: mount the REAL operator composition through
 * `createApp` and confirm the migrated route families actually resolve.
 *
 * A mounted route returns something other than 404 (it may 4xx/5xx on the stub
 * db — we only assert it is reached). An unmounted path returns 404. This
 * exercises all three lazy mechanisms (lazyAdminRoutes, lazyPublicRoutes,
 * multi-prefix lazyRoutes) end-to-end through the composed registry, including
 * the context bridge (handlers read c.var.db without throwing "undefined db").
 */

import type { Actor } from "@voyant-travel/core"
import { mountApp } from "@voyant-travel/hono"
import { composeFromManifest } from "@voyant-travel/hono/composition"
import { describe, expect, it } from "vitest"

import {
  buildOperatorProviders,
  OPERATOR_RUNTIME_MANIFEST,
  operatorComposition,
} from "./composition"

const TEST_ENV = { DATABASE_URL: "postgres://test" } as never
const TEST_CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as never

function build() {
  const { modules, extensions } = composeFromManifest(
    OPERATOR_RUNTIME_MANIFEST,
    operatorComposition,
    buildOperatorProviders(),
  )
  return mountApp({
    // Stub db — enough to be leased + bridged; handlers may 5xx using it, which
    // still proves the route is mounted and the context reached the sub-app.
    // biome-ignore lint/suspicious/noExplicitAny: stub db for mount smoke test.
    db: () => ({}) as any,
    modules,
    extensions,
    auth: {
      resolve: ({ request }) => {
        const actor: Actor = new URL(request.url).pathname.startsWith("/v1/public/")
          ? "customer"
          : "staff"
        return { userId: "u1", actor }
      },
    },
  })
}

async function status(path: string, method = "GET"): Promise<number> {
  const app = build()
  const res = await app.request(path, { method }, TEST_ENV, TEST_CTX)
  return res.status
}

describe("operator composed route mounting (smoke)", () => {
  it("returns 404 for an unmounted admin path (control)", async () => {
    expect([401, 404]).toContain(await status("/v1/admin/definitely-not-mounted/x"))
  })

  it("mounts lazyAdminRoutes modules (mcp)", async () => {
    expect(await status("/v1/admin/mcp/manifest")).not.toBe(404)
  })

  it("does not mount the excluded flights module (stays-only PMS)", async () => {
    expect([401, 404]).toContain(await status("/v1/admin/flights/reference/airports"))
  })

  it("mounts lazy module admin + public surfaces (invitations)", async () => {
    expect(await status("/v1/admin/invitations")).not.toBe(404)
    expect(await status("/v1/public/invitations/tok_123")).not.toBe(404)
  })

  it("mounts lazy extensions (action-ledger health, proposals, catalog offers)", async () => {
    expect(await status("/v1/admin/action-ledger/health")).not.toBe(404)
    expect(await status("/v1/public/proposals/qv_123")).not.toBe(404)
    expect(await status("/v1/admin/catalog/package-offers", "POST")).not.toBe(404)
  })

  it("does not mount the stripped tour verticals (cruises, charters, mice)", async () => {
    // These verticals were removed in the stays-only PMS strip pass.
    expect([401, 404]).toContain(await status("/v1/public/charters"))
    expect([401, 404]).toContain(await status("/v1/admin/charters/products"))
    expect([401, 404]).toContain(await status("/v1/public/cruises"))
    expect([401, 404]).toContain(await status("/v1/admin/mice/programs"))
  })

  it("mounts the ARI authoring module at /v1/admin/pms/ari", async () => {
    // Auto-discovered deployment-local module (src/modules/ari), name `pms/ari`.
    // Reached routes hit the stub db and 5xx; that still proves the mount (≠404).
    expect(await status("/v1/admin/pms/ari/room-types")).not.toBe(404)
    expect(await status("/v1/admin/pms/ari/rate-plans")).not.toBe(404)
    expect(
      await status("/v1/admin/pms/ari/calendar?propertyId=p&from=2026-07-01&to=2026-07-02"),
    ).not.toBe(404)
  })

  it("mounts the units + front-desk modules (Phase 3)", async () => {
    // Auto-discovered deployment-local modules (src/modules/units, front-desk).
    // Reached routes hit the stub db and 5xx; that still proves the mount (≠404).
    expect(await status("/v1/admin/pms/units/units")).not.toBe(404)
    expect(await status("/v1/admin/pms/units/assignments")).not.toBe(404)
    expect(
      await status(
        "/v1/admin/pms/front-desk/tape-chart?propertyId=p&from=2026-07-01&to=2026-07-02",
      ),
    ).not.toBe(404)
    expect(await status("/v1/admin/pms/front-desk/boards?propertyId=p&date=2026-07-01")).not.toBe(
      404,
    )
  })

  it("mounts the housekeeping module (Phase 4)", async () => {
    // Auto-discovered deployment-local module (src/modules/housekeeping).
    // Reached routes hit the stub db and 5xx; that still proves the mount (≠404).
    expect(await status("/v1/admin/pms/housekeeping/tasks")).not.toBe(404)
    expect(await status("/v1/admin/pms/housekeeping/room-status?propertyId=p")).not.toBe(404)
    expect(await status("/v1/admin/pms/housekeeping/maintenance-blocks")).not.toBe(404)
    expect(
      await status("/v1/admin/pms/housekeeping/generate?propertyId=p&date=2026-07-01", "POST"),
    ).not.toBe(404)
  })

  it("mounts multi-prefix lazyRoutes families (catalog-booking, media, settings, payment-link)", async () => {
    expect(await status("/v1/admin/catalog/orders")).not.toBe(404)
    expect(await status("/v1/admin/media/anything")).not.toBe(404)
    expect(await status("/v1/public/operator-profile")).not.toBe(404)
    expect(await status("/v1/public/payment-link-config")).not.toBe(404)
  })

  it("mounts the channels module admin + public webhook (Phase 6)", async () => {
    // Auto-discovered deployment-local module (src/modules/channels).
    // Reached routes hit the stub db and 5xx; that still proves the mount (≠404).
    expect(await status("/v1/admin/pms/channels/reservations")).not.toBe(404)
    expect(await status("/v1/admin/pms/channels/ari-events")).not.toBe(404)
    // The inbound webhook is anonymous (customer actor) — it is reached and
    // rejected 401 by the shared-secret gate (secret unset in this env), proving
    // the public mount resolves rather than 404s.
    expect(await status("/v1/public/pms/channels/mock/webhook", "POST")).not.toBe(404)
  })

  it("mounts the public catalog booking surface a Voyant Connect supplier exposes", async () => {
    // PLAN §4.7 outbound-Connect verification: the PMS's owned accommodation
    // inventory is already searchable/bookable over /v1/public/catalog (the
    // accommodations booking engine) — the surface a Connect adapter would front.
    expect(await status("/v1/public/catalog/quote", "POST")).not.toBe(404)
    expect(await status("/v1/public/catalog/book", "POST")).not.toBe(404)
  })
})
