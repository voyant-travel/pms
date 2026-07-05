/**
 * `pms-channels` — channel connectivity (PLAN §4.7, Phase 6).
 *
 * This is the SKELETON phase: no live OTA credentials exist, so the module ships
 * the provider-pluggable seam (`connector.ts` — `ChannelConnector`), one reference
 * `mock` connector (`mock-connector.ts`), two persistence ledgers (`schema.ts` —
 * `pms_channel_ari_events` outbound + `pms_channel_reservations` inbound), the
 * outbound ARI push worker, and the inbound reservation webhook + ingest path. It
 * is NOT a real Booking.com integration — a live connector is a future
 * `packages/plugins/channel-*` bundle registered in
 * `src/api/lib/channel-connectors.ts`.
 *
 * Composed EXPLICITLY by the deployment (`src/api/composition.ts`) via
 * {@link createChannelsModule}, which takes the deployment-injected connector
 * registry + stay-booking write path. The module name `pms/channels` mounts admin
 * routes at `/v1/admin/pms/channels/*`. The public webhook mounts at
 * `/v1/public/pms/channels/*` and is declared `anonymous` (ADR-0008) because an
 * OTA POSTs it with no session — it is authenticated in-band by the
 * `x-channel-secret` shared secret (`CHANNEL_WEBHOOK_SECRET`).
 *
 * Pure helpers + the connector seam are re-exported for the admin UI half, the
 * cron job, and the deployment connector registry.
 */

import { defineDeploymentModule } from "@voyant-travel/framework"

import {
  type ChannelsRouteDeps,
  createChannelsAdminRoutes,
  createChannelsPublicRoutes,
} from "./routes.js"

/**
 * Build the `pms/channels` module with the deployment's injected dependencies.
 * Returns a `ModuleFactory` (via `defineDeploymentModule`) the deployment
 * registers in its composition registry under the key `channels`.
 */
export function createChannelsModule(deps: ChannelsRouteDeps) {
  return defineDeploymentModule({
    module: { name: "pms/channels" },
    adminRoutes: createChannelsAdminRoutes(deps),
    publicRoutes: createChannelsPublicRoutes(deps),
    // The whole public mount is the inbound webhook — reachable without a session,
    // authenticated in-band by the shared-secret header.
    anonymous: true,
  })
}

export {
  type AriDelta,
  type AriDeltaDate,
  type ChannelConnector,
  type ChannelConnectorRegistry,
  type InboundReservation,
  type PushResult,
  resolveConnector,
  type WebhookRequest,
} from "./connector.js"
export type { ChannelsDb } from "./db.js"
export { ariDateRange, buildAriDedupeKey } from "./dedupe.js"
export {
  createMockConnector,
  type MockChannelConnector,
  type MockConnectorOptions,
} from "./mock-connector.js"
export {
  type ChannelReservationStatus,
  initialLedgerStatus,
  type ReservationValidation,
  shouldAttemptIngest,
  splitGuestName,
  validateInboundReservation,
} from "./normalize.js"
export {
  type AriEventState,
  type AriEventStatus,
  MAX_ARI_PUSH_ATTEMPTS,
  nextEventState,
  stateForThrow,
} from "./retry.js"
export {
  type ChannelsRouteDeps,
  createChannelsAdminRoutes,
  createChannelsPublicRoutes,
} from "./routes.js"
export type { ChannelAriEventRow, ChannelReservationRow } from "./schema.js"
export {
  enqueueAriDelta,
  listAriEvents,
  type ProcessAriResult,
  processPendingAriEvents,
} from "./service-ari.js"
export {
  type IngestOutcome,
  ingestReservation,
  type PersistStayBookingFn,
  type PersistStayBookingResult,
} from "./service-ingest.js"
export {
  findReservation,
  getReservation,
  listReservations,
  markReservationFailed,
  markReservationIngested,
  type ReceiveResult,
  receiveReservation,
  retryReservationIngest,
} from "./service-reservations.js"
export * from "./validation.js"
export {
  CHANNEL_WEBHOOK_SECRET_HEADER,
  checkWebhookSecret,
  type WebhookSecretCheck,
} from "./webhook.js"
