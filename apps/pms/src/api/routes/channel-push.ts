/**
 * Channel-push runtime wiring.
 *
 * Subscribes to the three source events (`booking.confirmed`,
 * `availability.slot.changed`, `product.content.changed`) and drains
 * the resulting durable-intent rows inline. The Cloudflare Workers
 * deployment is single-process per request, so we don't need the
 * separate workflow runtime — the inline drain runs within the same
 * isolate that emitted the event.
 *
 * The adapter registry is the same singleton the booking engine uses
 * (`getBookingEngineRegistry`), so a deployment with `CATALOG_DEMO_API_URL`
 * set automatically pushes back to the demo upstream's
 * `/push-booking|/push-availability|/push-content` endpoints. Real
 * channels register their adapters in `booking-engine-runtime.ts`
 * alongside the demo.
 *
 * Per docs/architecture/channel-push-architecture.md §10 (Phase D-G).
 */

import type { Extension } from "@voyant-travel/core"
import {
  createChannelPushAdminRoutes,
  processAvailabilityPushIntents,
  processBookingPush,
  processContentPushIntents,
  resolveAllotmentTargetsForSlot,
  resolveBookingPushTargets,
  resolveContentPushTargets,
  setChannelPushDeps,
  upsertAvailabilityIntent,
  upsertContentIntent,
  upsertPendingBookingLinks,
} from "@voyant-travel/distribution"
import type { VoyantDb } from "@voyant-travel/hono"
import type { HonoExtension } from "@voyant-travel/hono/module"
import type { HonoBundle } from "@voyant-travel/hono/plugin"
import type { NeonDatabase } from "drizzle-orm/neon-serverless"
import { Hono } from "hono"

import {
  type BookingEngineEnv,
  getBookingEngineRegistry,
  getBookingEngineRegistryFromContext,
} from "../lib/booking-engine-runtime"
import { withDbFromEnv } from "../lib/db"

interface BookingConfirmedPayload {
  bookingId: string
  bookingNumber?: string
  actorId?: string | null
}

interface AvailabilitySlotChangedPayload {
  slotId: string
  productId: string
  optionId: string | null
  startsAt: Date | string
  remainingPax: number | null
  unlimited: boolean
  source: string
}

interface ProductContentChangedPayload {
  id: string
  axis?: string
}

export const channelPushBundle: HonoBundle = {
  name: "channel-push",
  bootstrap: ({ bindings, eventBus }) => {
    const env = bindings as CloudflareBindings & BookingEngineEnv
    const registry = getBookingEngineRegistry(env)

    // Build deps from a per-call db client. Each subscriber wraps with
    // `withDbFromEnv` and feeds the db in here so the Pool is owned for
    // the duration of the subscriber call.
    function buildDeps(db: NeonDatabase) {
      return { db, registry }
    }

    eventBus.subscribe<BookingConfirmedPayload>("booking.confirmed", async ({ data }) => {
      try {
        await withDbFromEnv(env, async (db) => {
          const deps = buildDeps(db)
          const targets = await resolveBookingPushTargets(deps.db, data.bookingId)
          if (targets.length === 0) return
          await upsertPendingBookingLinks(deps.db, data.bookingId, targets)
          await processBookingPush({ bookingId: data.bookingId }, deps)
        })
      } catch (err) {
        console.error("[channel-push] booking.confirmed failed", {
          bookingId: data.bookingId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })

    eventBus.subscribe<AvailabilitySlotChangedPayload>(
      "availability.slot.changed",
      async ({ data }) => {
        try {
          await withDbFromEnv(env, async (db) => {
            const deps = buildDeps(db)
            const targets = await resolveAllotmentTargetsForSlot(deps.db, {
              slotId: data.slotId,
              productId: data.productId,
              optionId: data.optionId,
            })
            if (targets.length === 0) return

            const startsAt = data.startsAt instanceof Date ? data.startsAt : new Date(data.startsAt)
            for (const target of targets) {
              await upsertAvailabilityIntent(deps.db, {
                channelId: target.channelId,
                sourceConnectionId: target.sourceConnectionId,
                slotId: data.slotId,
                productId: data.productId,
                optionId: data.optionId,
                startsAt,
              })
            }

            // Drain per-channel inline — the inline path keeps latency
            // bounded for dev / single-isolate deployments. Production
            // deployments with the workflow runtime wired skip this and
            // let the scheduled `channel.availability.push` workflow drain.
            for (const target of targets) {
              await processAvailabilityPushIntents({ channelId: target.channelId, limit: 50 }, deps)
            }
          })
        } catch (err) {
          console.error("[channel-push] availability.slot.changed failed", {
            slotId: data.slotId,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      },
    )

    eventBus.subscribe<ProductContentChangedPayload>(
      "product.content.changed",
      async ({ data }) => {
        try {
          await withDbFromEnv(env, async (db) => {
            const deps = buildDeps(db)
            const targets = await resolveContentPushTargets(deps.db, data.id)
            if (targets.length === 0) return

            for (const target of targets) {
              await upsertContentIntent(deps.db, {
                channelId: target.channelId,
                sourceConnectionId: target.sourceConnectionId,
                productId: data.id,
              })
            }

            for (const target of targets) {
              await processContentPushIntents({ channelId: target.channelId, limit: 50 }, deps)
            }
          })
        } catch (err) {
          console.error("[channel-push] product.content.changed failed", {
            productId: data.id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      },
    )
  },
}

const channelPushExtensionDef: Extension = {
  name: "channel-push",
  module: "distribution",
}

/**
 * Channel-push admin API as a composed distribution extension.
 *
 * `createApp` mounts the extension's `adminRoutes` at
 * `/v1/admin/distribution` (the target module), so the package routes
 * keep their existing absolute paths. The operator dashboard's "channel
 * sync" view consumes these endpoints.
 *
 * The per-request middleware wires `setChannelPushDeps` from the
 * request-scoped Pool the `dbFromEnvForApp` middleware installs on
 * `c.var.db`, plus the operator's booking-engine registry, so the admin
 * routes' push/reconcile triggers resolve deps via
 * `getChannelPushDepsOrThrow`. It is scoped to this extension's own
 * routes (mirroring the former additionalRoutes mount, which only ever
 * wrapped the channel-push routes — the distribution module routes do
 * not read channel-push deps).
 *
 * Replaces the former `mountChannelPushAdminRoutes(...)` additionalRoutes
 * hop; see docs/architecture/api-route-ownership-and-composition.md.
 * Per docs/architecture/channel-push-architecture.md §9 + §14.5.
 */
export function createChannelPushExtension(): HonoExtension {
  const adminRoutes = new Hono<{ Variables: { db: VoyantDb } }>()
  adminRoutes.use("*", async (c, next) => {
    setChannelPushDeps({
      db: c.get("db") as NeonDatabase,
      registry: getBookingEngineRegistryFromContext(c),
    })
    await next()
  })
  adminRoutes.route("/", createChannelPushAdminRoutes())
  return { extension: channelPushExtensionDef, adminRoutes }
}
