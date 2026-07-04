# Exposing this PMS as a Voyant Connect supplier

Status: draft (2026-07-05) — PLAN §4.7 (outbound Voyant Connect)
Scope: how a Voyant operator can resell this PMS's inventory today, what the
`connect-sdk` SourceAdapter path would add, and what's missing.

## The PMS is already a full Voyant deployment

`apps/pms` is a standard Voyant composition, so its **owned accommodation
inventory is already searchable and bookable over the public catalog surface** —
no channel code required. The accommodations booking engine mounts on both the
admin and public legs (`@voyant-travel/catalog/booking-engine`), so these public
routes exist and resolve in this deployment (asserted by
`src/api/operator-route-mounting.test.ts` → "mounts the public catalog booking
surface a Voyant Connect supplier exposes"):

| Method | Path | Purpose |
| --- | --- | --- |
| GET  | `/v1/public/catalog/search` (+ `/slots`) | search availability / calendar |
| POST | `/v1/public/catalog/quote` | price a specific stay (room type × rate plan × dates) |
| POST | `/v1/public/catalog/holds/place` · `/release` | optional hold |
| PUT/GET/DELETE | `/v1/public/catalog/drafts/:id` | booking draft lifecycle |
| POST | `/v1/public/catalog/book` | create the booking |

Owned stays are priced/validated by `service-owned-stays` (`quoteOwnedStay`,
`searchOwnedStays`) over the upstream ARI schema this repo authors (PLAN §4.5).
The same programmatic path is what the inbound channel ingest reuses
(`src/modules/channels/service-ingest.ts` → `persistStayBooking`).

## Consuming it today: public catalog + API key

A Voyant operator (or any HTTP client) can resell PMS inventory now by calling the
public catalog surface directly:

1. **Search / quote** — `POST /v1/public/catalog/quote` with the room type, rate
   plan, dates and occupancy → per-night sell rates + total.
2. **Book** — `POST /v1/public/catalog/book` against the returned quote → a real
   PMS booking with a stay item and nightly rates.

Auth is the deployment's standard public-actor model (session or API key at the
deployment boundary; ADR-0001 tenancy). This is a direct, point-to-point
integration: the consumer is bespoke-wired to this PMS's endpoints and schema.

## What the Voyant Connect SourceAdapter path adds

Voyant Connect normalizes this from a bespoke integration into **one supplier
source among many** inside an operator's catalog/booking plane. The relevant
contracts live across the two sibling repos (READ-ONLY reference):

- **`connect-sdk`** (OSS, sibling repo): the consumer client
  `@voyant-travel/connect-sdk`, the catalog adapter `@voyant-travel/connect-adapter`
  (`createVoyantConnectSourceAdapter`), the provider-author SDK
  `@voyant-travel/connect-provider-sdk` (`defineConnectProvider`), and the wiring
  plugin `@voyant-travel/plugin-voyant-connect`. It owns the **adapter**, not the API.
- **`voyant` / voyant-cloud** (proprietary): the Connect **data plane / API**
  (`/connect/v1/...` behind `api.voyant.travel`) **and** the `SourceAdapter`
  contract itself (`@voyant-travel/catalog-contracts` → `@voyant-travel/catalog`).

### The `SourceAdapter` contract (consumer side)

`SourceAdapter` (`catalog-contracts/src/adapter/source-adapter.ts`) is what the
*operator* registers to consume a source. Only `kind` + `capabilities` are
required; each method is gated by a `supports*` capability flag:

- Discovery: `discover`, `freshnessCheck` → normalized `SearchDocument`s / catalog
  projections with stable provenance (`source_connection_id`, `seller.operator_id`).
- Live: `liveResolve` (fresh price/availability for a picked entity) and
  `searchAvailability` (inventory-space fan-out → `AvailabilityCandidate[]`) — the
  "quote" equivalents. There is no literal `quote`/`book` method.
- Booking forwarding: `reserve` (= book), `cancel`, `getReservation`,
  `listReservations`, routed back to the originating `connection_id` with an
  idempotency key and normalized statuses (`held|confirmed|ticketed|failed`).
- Content: `getContent` (versioned, supplier-agnostic).

On this PMS's own deployment, an operator *already* consumes Connect sources via
`@voyant-travel/plugin-voyant-connect` (`createVoyantConnectSources` +
`registerVoyantConnectSources`), wired in `scripts/lib/build-sync-source-registry.ts`
— that is the consumer half in action.

### What a PMS must expose to BE a supplier source

A supplier does **not** implement `SourceAdapter` (that's the consumer). It
exposes a **provider connector** that the Connect data plane fronts, then operators
consume it through `connect-adapter`. Concretely, becoming a Connect supplier
means:

1. A provider descriptor via `defineConnectProvider({ key, displayName, authModel,
   supportedDirections: ["inbound"], categoryCoverage, parseCredentials })`.
2. The hosted-worker vocabulary per vertical (`connect-provider-sdk/src/hosted-worker.ts`),
   for stays: `POST /stays/search`, `/stays/quote`, `/stays/lock`, `/stays/confirm`,
   `/stays/cancel`, `/stays/bookings/get`. Money is minor-units (`ConnectMoney`).
3. A discoverable catalog feed of accommodations that Connect syncs into
   `SearchDocument`s.

The PMS's existing public catalog endpoints map cleanly onto that vocabulary
(`quote → /stays/quote`, `holds → /stays/lock`, `book → /stays/confirm`), so the
adapter would be a thin translation over `service-owned-stays`-equivalent reads —
the StayOffer ↔ owned-stay-quote fit is already established.

## What's missing (to ship the adapter path)

- No `connect-provider` descriptor or `/stays/*` hosted-worker surface in this
  repo yet — only the direct public catalog surface exists.
- No published `connect-adapter` build wiring for THIS PMS as a source (the
  consumer plumbing here is for *inbound* Connect sources, not outbound exposure).
- Minor-unit `ConnectMoney` + `SearchDocument` projection of PMS accommodations is
  not emitted.
- Credential/connection registration against the proprietary Connect API
  (voyant-cloud) is out of scope for this repo.

None of the Phase-6 skeleton work blocks this: the inbound `ChannelConnector` seam
and the outbound Connect provider surface are independent, and the owned-stay
quote/book path both rely on is already the system of record.
