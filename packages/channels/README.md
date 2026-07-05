# @voyant-travel/pms-channels

Channel connectivity for the Voyant PMS — the **skeleton** phase. It ships the
provider-pluggable `ChannelConnector` seam, one reference `mock` connector, the
two persistence ledgers (outbound ARI events + inbound reservations), the
outbound ARI push worker, and the inbound reservation webhook + ingest path. It
is **not** a live OTA integration: a real Booking.com/Expedia connector is a
future `packages/plugins/channel-*` bundle.

## Status

Pre-release. Part of the PMS package graduation (PLAN §4.7, Phase 6); shaped for
npm publishing but **not yet published**. Consume it as a workspace package.
This is the connector seam + ledgers + ingest only — no live channel credentials
exist yet. Outbound Voyant Connect exposure is a separate follow-up; see
[docs/architecture/connect-exposure.md](../../docs/architecture/connect-exposure.md).

## Install

```jsonc
"dependencies": {
  "@voyant-travel/pms-channels": "workspace:*"
}
```

## Registering the module

Unlike the other PMS packages, `channels` exports a **factory that takes two
app-injected dependencies** — the connector registry and the accommodation
stay-booking write path — because both live app-side (the package never imports
app code). Build it with `createChannelsModule` in the deployment composition:

```ts
import { createChannelsModule } from "@voyant-travel/pms-channels"

const pmsDomainModules = {
  channels: createChannelsModule({
    getConnectors: getChannelConnectors,          // name → ChannelConnector registry
    persistStayBooking,                           // app-owned owned-stay write path
  }),
  // …other pms-* modules
}
```

The module name `pms/channels` mounts admin routes at `/v1/admin/pms/channels/*`
and the inbound webhook at `/v1/public/pms/channels/*`. The public surface is
declared `anonymous` (an OTA POSTs it with no session) and is authenticated
in-band by the `x-channel-secret` shared-secret header, checked against
`CHANNEL_WEBHOOK_SECRET`, then by the connector's optional signature check.

## HTTP routes

Admin, under `/v1/admin/pms/channels`:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/reservations` | inbound reservation ledger |
| POST | `/reservations/:id/retry-ingest` | retry a failed reservation ingest |
| GET | `/ari-events` | outbound ARI push ledger |
| POST | `/ari/enqueue` | enqueue an ARI delta for a channel |
| POST | `/ari/process` | process pending ARI events (push via connectors) |

Public, under `/v1/public/pms/channels`:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/:channel/webhook` | inbound reservation webhook (shared-secret gated) |

The outbound push worker (`processPendingAriEvents`) is also driven by the
deployment's `channel-ari-push` cron.

## Schema

Two deployment-local ledger tables (`./schema` subpath), migrated as deployment
sources after the framework bundle. Cross-module refs are loose typeid columns.

| Table | TypeID prefix | Notes |
| --- | --- | --- |
| `pms_channel_ari_events` | `chae` | outbound ARI push ledger; status `pending`/`pushed`/`failed`/`skipped`, attempt counter, idempotent `dedupe_key` |
| `pms_channel_reservations` | `chrz` | inbound ledger; status `received`/`ingested`/`failed`/`ignored`, idempotent per `(channel, channelReservationId)`, carries the created `booking_id` after ingest |

## Key exports

- `createChannelsModule(deps)` — the module factory (takes `getConnectors` +
  `persistStayBooking`).
- `ChannelConnector`, `ChannelConnectorRegistry`, `AriDelta`,
  `InboundReservation`, `PushResult`, `WebhookRequest`, `resolveConnector` — the
  connector seam.
- `createMockConnector` — the reference connector for tests/demos.
- Outbound: `enqueueAriDelta`, `processPendingAriEvents`, `listAriEvents`,
  `buildAriDedupeKey`, retry state helpers (`nextEventState`,
  `MAX_ARI_PUSH_ATTEMPTS`).
- Inbound: `receiveReservation`, `ingestReservation`, `retryReservationIngest`,
  `validateInboundReservation`, `PersistStayBookingFn`, the reservation-status
  helpers, and `checkWebhookSecret` / `CHANNEL_WEBHOOK_SECRET_HEADER`.
- Row types and the validation schemas.

## Testing

```bash
pnpm --filter @voyant-travel/pms-channels test
```

## License

Apache-2.0.
