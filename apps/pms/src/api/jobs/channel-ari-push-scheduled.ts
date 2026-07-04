/**
 * Outbound channel ARI push — Cloudflare Workers cron entrypoint (PLAN §4.7).
 *
 * Drains pending `pms_channel_ari_events` through the deployment's registered
 * channel connectors with attempt counting (idempotent + retry-safe). In this
 * skeleton the only registered connector is `mock`, so a real run is a no-op until
 * a live OTA connector is added to `channel-connectors.ts`.
 */

import { processPendingAriEvents } from "../../modules/channels/service-ari"
import { getChannelConnectors } from "../lib/channel-connectors"
import { withDbFromEnv } from "../lib/db"

export { CHANNEL_ARI_PUSH_CRON } from "../../scheduled-crons"

export async function runScheduledChannelAriPush(
  _event: ScheduledController,
  env: CloudflareBindings,
): Promise<import("../../modules/channels/service-ari").ProcessAriResult> {
  return withDbFromEnv(env, async (db) => processPendingAriEvents(db, getChannelConnectors()))
}
