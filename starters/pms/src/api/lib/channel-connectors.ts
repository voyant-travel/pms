/**
 * The deployment's channel-connector registry (PLAN §4.7, Phase 6) — the
 * composition point where one connector is registered per channel (name →
 * connector). Process-local + memoized per isolate, mirroring
 * `booking-engine-runtime.ts`.
 *
 * This skeleton registers only the reference `mock` connector. A real deployment
 * adds live OTA connectors here (Booking.com, Expedia, a channel-manager
 * aggregator) — typically as `packages/plugins/channel-*` bundles — without
 * touching the `channels` module's routes or services.
 */

import { type ChannelConnectorRegistry, createMockConnector } from "@voyant-travel/pms-channels"

let _registry: ChannelConnectorRegistry | undefined

/** Build (once per isolate) the channel-connector registry. */
export function getChannelConnectors(): ChannelConnectorRegistry {
  if (!_registry) {
    const mock = createMockConnector()
    _registry = { [mock.name]: mock }
  }
  return _registry
}
