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
    expect(await status("/v1/admin/definitely-not-mounted/x")).toBe(404)
  })

  it("mounts lazyAdminRoutes modules (mcp)", async () => {
    expect(await status("/v1/admin/mcp/manifest")).not.toBe(404)
  })

  it("does not mount the excluded flights module (stays-only PMS)", async () => {
    expect(await status("/v1/admin/flights/reference/airports")).toBe(404)
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
    expect(await status("/v1/public/charters")).toBe(404)
    expect(await status("/v1/admin/charters/products")).toBe(404)
    expect(await status("/v1/public/cruises")).toBe(404)
    expect(await status("/v1/admin/mice/programs")).toBe(404)
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

  it("mounts multi-prefix lazyRoutes families (catalog-booking, media, settings, payment-link)", async () => {
    expect(await status("/v1/admin/catalog/orders")).not.toBe(404)
    expect(await status("/v1/admin/media/anything")).not.toBe(404)
    expect(await status("/v1/public/operator-profile")).not.toBe(404)
    expect(await status("/v1/public/payment-link-config")).not.toBe(404)
  })
})
