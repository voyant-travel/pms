import { createMcpHonoApp } from "@voyant-travel/mcp"
import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { tripsService } from "@voyant-travel/trips"
import { type TripsToolServices, tripsTools } from "@voyant-travel/trips/tools"
import type { Context, Hono } from "hono"

import { DEFAULT_SLICES } from "../lib/catalog-runtime"
import { createOperatorTripsRoutesOptions } from "./trips-runtime"

type OperatorToolContext = ToolContext & { trips: TripsToolServices }

const registry = createToolRegistry()
registry.registerAll(tripsTools)

/** Build the deployment MCP admin routes wired with this deployment's tools. */
export function buildMcpAdminRoutes(): Hono {
  return createMcpHonoApp({
    registry,
    buildContext: buildToolContext,
    serverInfo: {
      name: "voyant-operator",
      version: "0.0.0",
    },
  })
}

function buildToolContext(c: Context): OperatorToolContext {
  const env = c.env as CloudflareBindings & { TENANT_ID?: string }
  const actor = (c.var.actor ?? "staff") as ToolContext["actor"]
  const audience = (c.var.audience ?? actor) as ToolContext["audience"]
  const locale = DEFAULT_SLICES[0]?.locale ?? "en-GB"
  return {
    db: c.var.db,
    actor,
    audience,
    tenantId: env.TENANT_ID ?? "default",
    resolverScope: { locale, audience, market: "default", actor },
    trips: {
      createTrip: (input) => tripsService.createTrip(c.var.db, input),
      addComponent: (input) => tripsService.addComponent(c.var.db, input),
      removeComponent: (componentId) => tripsService.removeComponent(c.var.db, componentId),
      priceTrip: async (input) => {
        const options = createOperatorTripsRoutesOptions()
        const deps = await resolveDeps(c, options.priceTripDeps)
        if (!deps) throw new Error("Trips price dependencies are not configured")
        return tripsService.priceTrip(c.var.db, input, deps)
      },
      reserveTrip: async (input) => {
        const options = createOperatorTripsRoutesOptions()
        const deps = await resolveDeps(c, options.reserveTripDeps)
        if (!deps) throw new Error("Trips reserve dependencies are not configured")
        return tripsService.reserveTrip(c.var.db, input, deps)
      },
    },
  }
}

function resolveDeps<T>(
  c: Context,
  deps: T | ((c: Context) => T | Promise<T | undefined> | undefined) | undefined,
) {
  if (typeof deps !== "function") return deps
  return (deps as (c: Context) => T | Promise<T | undefined> | undefined)(c)
}
