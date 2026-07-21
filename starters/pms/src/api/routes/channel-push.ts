import type { Extension } from "@voyant-travel/core"
import { createChannelPushAdminRoutes, setChannelPushDeps } from "@voyant-travel/distribution"
import type { VoyantDb } from "@voyant-travel/hono"
import type { HonoExtension } from "@voyant-travel/hono/module"
import type { NeonDatabase } from "drizzle-orm/neon-serverless"
import { Hono } from "hono"

import { getBookingEngineRegistryFromContext } from "../lib/booking-engine-runtime"

const channelPushExtensionDef: Extension = {
  name: "channel-push",
  module: "distribution",
}

/**
 * Deployment adapter for the Distribution package's channel-push admin API.
 * Subscribers, durable intent processing, and reconciliation jobs are owned by
 * the package graph; PMS supplies only its database and connector registry.
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
