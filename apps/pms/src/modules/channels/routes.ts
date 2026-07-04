/**
 * Routes for the `pms-channels` module (PLAN §4.7, Phase 6).
 *
 * Two surfaces:
 *   - `channelsAdminRoutes` — staff surface mounted at `/v1/admin/pms/channels/*`
 *     (the two ledgers + manual ARI enqueue/process + reservation retry).
 *   - `channelsPublicRoutes` — the inbound webhook mounted at
 *     `/v1/public/pms/channels/*`. Declared `anonymous` on the module (ADR-0008):
 *     an OTA POSTs it with no session, so it authenticates via the
 *     `x-channel-secret` shared-secret header checked against
 *     `CHANNEL_WEBHOOK_SECRET`, then the channel's connector verifies + parses.
 *
 * Thin routes: parse via `parseJsonBody`/`parseQuery`, resolve the request db,
 * call the service, serialize.
 */

import type { VoyantDb, VoyantVariables } from "@voyant-travel/hono"
import { parseJsonBody, parseQuery } from "@voyant-travel/hono"
import { Hono } from "hono"
import { getChannelConnectors } from "../../api/lib/channel-connectors.js"
import { resolveConnector } from "./connector.js"
import type { ChannelsDb } from "./db.js"
import { enqueueAriDelta, listAriEvents, processPendingAriEvents } from "./service-ari.js"
import {
  listReservations,
  receiveReservation,
  retryReservationIngest,
} from "./service-reservations.js"
import {
  ariEventListQuerySchema,
  enqueueAriSchema,
  reservationListQuerySchema,
} from "./validation.js"
import { CHANNEL_WEBHOOK_SECRET_HEADER, checkWebhookSecret } from "./webhook.js"

type ChannelsEnv = { Bindings: CloudflareBindings; Variables: VoyantVariables }

const dbOf = (db: VoyantDb): ChannelsDb => db

export const channelsAdminRoutes = new Hono<ChannelsEnv>()
  // --- inbound reservation ledger --------------------------------------------
  .get("/reservations", async (c) =>
    c.json(await listReservations(dbOf(c.get("db")), parseQuery(c, reservationListQuerySchema))),
  )
  .post("/reservations/:id/retry-ingest", async (c) => {
    const result = await retryReservationIngest(dbOf(c.get("db")), c.req.param("id"), {
      userId: c.get("userId"),
    })
    return c.json({ data: result.row, ingest: result.ingest })
  })
  // --- outbound ARI push ledger ----------------------------------------------
  .get("/ari-events", async (c) =>
    c.json(await listAriEvents(dbOf(c.get("db")), parseQuery(c, ariEventListQuerySchema))),
  )
  .post("/ari/enqueue", async (c) => {
    const { channel, delta } = await parseJsonBody(c, enqueueAriSchema)
    return c.json({ data: await enqueueAriDelta(dbOf(c.get("db")), channel, delta) }, 201)
  })
  .post("/ari/process", async (c) =>
    c.json({ data: await processPendingAriEvents(dbOf(c.get("db")), getChannelConnectors()) }),
  )

export type ChannelsAdminRoutes = typeof channelsAdminRoutes

export const channelsPublicRoutes = new Hono<ChannelsEnv>().post("/:channel/webhook", async (c) => {
  const channel = c.req.param("channel")

  // 1. Shared-secret gate (the endpoint is anonymous by construction).
  const secretCheck = checkWebhookSecret(
    c.env.CHANNEL_WEBHOOK_SECRET,
    c.req.header(CHANNEL_WEBHOOK_SECRET_HEADER),
  )
  if (!secretCheck.ok) return c.json({ error: `webhook rejected: ${secretCheck.reason}` }, 401)

  // 2. Resolve the connector for this channel.
  const connector = resolveConnector(getChannelConnectors(), channel)
  if (!connector) return c.json({ error: `unknown channel "${channel}"` }, 404)

  // 3. Read the raw body and let the connector verify (provider signature) + parse.
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: "invalid JSON body" }, 400)
  }
  if (
    connector.verifyWebhook &&
    !connector.verifyWebhook({ headers: headerRecord(c.req.raw), body: payload })
  ) {
    return c.json({ error: "connector signature verification failed" }, 401)
  }
  const reservation = connector.parseReservation(payload)
  if (!reservation) return c.json({ error: "payload is not a recognized reservation" }, 422)

  // 4. Record + attempt ingest (idempotent by channel + channelReservationId).
  const result = await receiveReservation(dbOf(c.get("db")), reservation, {
    userId: c.get("userId"),
  })
  return c.json(
    {
      data: { id: result.row.id, status: result.row.status, bookingId: result.row.bookingId },
      ingest: result.ingest,
    },
    result.row.status === "failed" ? 202 : 201,
  )
})

export type ChannelsPublicRoutes = typeof channelsPublicRoutes

function headerRecord(req: Request): Record<string, string> {
  const out: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    out[key] = value
  })
  return out
}
