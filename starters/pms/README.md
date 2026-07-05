# Voyant PMS — Admin Deployment (`starters/pms`)

The PMS deployment app: a single Cloudflare Worker serving the `/v1/*` API, the
SSR admin dashboard, and the direct-booking storefront. It consumes the published
`@voyant-travel/*` framework packages and composes them via `createVoyantApp`
(see `src/api/app.ts` + `src/api/composition.ts`).

This app was scaffolded from the Voyant operator starter as Phase 0 of
`docs/PLAN.md`, then extended through Phases 1–6. See the "Vertical scope" note below for what is kept vs.
deferred.

## PMS domains

The six PMS domains have graduated out of this app into published workspace
packages (`packages/*`), registered explicitly in `src/api/composition.ts` and
surfaced as admin sections (`src/admin/*`, `src/components/*`):

| Admin section | Package | Admin API |
| --- | --- | --- |
| Rates & Inventory (ARI) | `@voyant-travel/pms-ari` | `/v1/admin/pms/ari/*` |
| Units | `@voyant-travel/pms-units` | `/v1/admin/pms/units/*` |
| Front Desk | `@voyant-travel/pms-front-desk` | `/v1/admin/pms/front-desk/*` |
| Housekeeping | `@voyant-travel/pms-housekeeping` | `/v1/admin/pms/housekeeping/*` |
| Folios | `@voyant-travel/pms-folios` | `/v1/admin/pms/folios/*` |
| Channels | `@voyant-travel/pms-channels` | `/v1/admin/pms/channels/*` (+ `/v1/public/pms/channels/*`) |

The admin UI stays app-side (thin-host pattern), importing types from the
packages above.

## Stack

- **Runtime**: Cloudflare Workers (Vite + `@cloudflare/vite-plugin`)
- **Framework**: TanStack Start + React 19, `@voyant-travel/framework`
- **DB**: Neon Postgres via the serverless HTTP driver (one secret,
  `DATABASE_URL`; no Hyperdrive binding required)
- **Auth**: Better Auth (`@voyant-travel/auth`)
- **Worker name**: `voyant-pms` (`wrangler.jsonc`)

## Local setup

Prerequisites: Node `>=22`, `pnpm@9`. Install from the repo root:

```bash
pnpm install
```

### Environment

Runtime secrets are provided to `wrangler dev` via `.dev.vars` (git-ignored).
Copy the template and fill it in:

```bash
cp starters/pms/.dev.vars.example starters/pms/.dev.vars
```

Minimum required for local boot (see `.dev.vars.example` + `env.d.ts` for the
full list and docs):

- `DATABASE_URL` — Postgres connection string (Neon or local Postgres).
- `BETTER_AUTH_SECRET`, `SESSION_CLAIMS_SECRET`, `INTERNAL_API_KEY` — generate
  with `openssl rand -base64 32` / `openssl rand -hex 32`.
- `VOYANT_API_KEY` — canonical email/SMS/verify/vault provider (see
  `src/lib/notifications.ts` to swap transports).
- `CHANNEL_WEBHOOK_SECRET` — shared secret the inbound channel webhook
  (`/v1/public/pms/channels/:channel/webhook`) checks via the `x-channel-secret`
  header before the connector verifies + parses the payload.
- `STOREFRONT_SINGLE_PROPERTY_ID` (optional) — see "Single-property mode" below.

Non-secret vars (`APP_URL`, `DASH_BASE_URL`, auth mode, `EMAIL_FROM`) live in
`wrangler.jsonc` under `vars`. The `CACHE` / `RATE_LIMIT` KV namespace IDs and
the R2 bucket names in `wrangler.jsonc` are placeholders — replace them with real
Cloudflare resource IDs before deploying (not required for `pnpm dev`).

### Run

```bash
pnpm --filter pms-admin dev    # Worker + SSR admin on http://localhost:3300
```

### Database migrations

Migrations use the `@voyant-travel/framework-migrations` collector: each
schema-owning package ships its own migrations, applied deps-first, and this
deployment's `./migrations` (link tables + any local module schema) apply last.

```bash
pnpm --filter pms-admin db:generate   # generate deployment migration from schema changes
pnpm --filter pms-admin db:migrate    # apply all migrations (package sources + deployment)
pnpm --filter pms-admin db:push       # push aggregate schema (dev only)
pnpm --filter pms-admin seed          # seed baseline data
```

`DATABASE_URL` must be set (via `.dev.vars`, `.env`, or the environment) for any
`db:*` command.

## Scheduled jobs (crons)

Cron triggers are declared in `wrangler.jsonc`; the single `scheduled` handler in
`src/entry.ts` dispatches on `event.cron` to the matching job in
`src/api/jobs/*`. Alongside the inherited framework reconcilers (channel-push,
draft reaper, promotions boundary, event-outbox drain), the PMS adds three:

| Cron | Job | What it does |
| --- | --- | --- |
| `0 6 * * *` | housekeeping generate | auto-creates cleaning/inspection tasks from the day's departures/stayovers (idempotent) |
| `0 2 * * *` | night audit | posts nightly room + tax charges per in-house stay, rolls the business date, emits the day's KPIs |
| `3,18,33,48 * * * *` | channel ARI push | processes pending outbound ARI events via registered channel connectors |

## Storefront (direct bookings)

The `(storefront)` route group is the property-first, direct-booking surface
(Phase 2). It reuses the upstream catalog booking engine end to end.

- `/shop` — landing + property search: destination + check-in/check-out +
  occupancy (adults / children / rooms). Results are accommodation **properties**
  served by `useCatalogSearch` restricted to the `accommodations` vertical
  (`projection: "storefront-card"`, `surface: "public"`). Occupancy + dates live
  in URL search state (`staySearchSchema`) and flow into the detail link.
- `/shop/products/accommodations/$id` — property detail: gallery, amenities,
  policies, and a booking.com-style rooms table (room type × applicable rate
  plans). Selecting a room+rate drives a live quote; **Book** navigates to the
  journey with dates/occupancy/room/rate prefilled.
- `/shop/book/accommodations/$id` — the `BookingJourney` wizard (Configure step
  hidden; upstream). `/shop/confirmation/$bookingId` — post-payment landing.

Pure view-model helpers (`src/components/storefront/*.ts`) are unit-tested so the
flow is validated without a live catalog: `stay-search` (URL codec, nights,
booking-search builder), `rooms-matrix` (room × rate-plan fan-out), and
`property-card-model` (search → card mapping).

### Single-property mode

Set `STOREFRONT_SINGLE_PROPERTY_ID` (Cloudflare `vars` / `.dev.vars`) to an
accommodation property id. The `/shop` loader then redirects straight to that
property's detail page and the portfolio search never renders — a property
manager pointing their own domain at one hotel. Leave it unset for
multi-property mode (portfolio landing + search). The value is read server-side
via `getStorefrontConfig` (`src/lib/storefront-config.ts`).

## Verify

```bash
pnpm --filter pms-admin typecheck     # tsc server + client configs
pnpm --filter pms-admin lint          # biome check (root biome.json)
pnpm --filter pms-admin test          # vitest
```

## Vertical scope

The PMS keeps the stay-relevant framework modules (accommodations, operations,
bookings, catalog, commerce, crm, finance, transactions, storefront, auth) plus
the standard admin shell.

Tour-shaped verticals inherited from the operator blueprint were stripped:
cruises, charters, and mice (deployment-local wiring deleted) and flights
(excluded via `createVoyantApp({ exclude })`, ADR-0007). Two remain composed by
necessity: `trips` and `quotes` are standard framework modules whose provider
ports are mandatory in `FrameworkProviders`, so they cannot be cleanly excluded
today; they carry no PMS UI. The upstream catalog admin surface also still
contributes empty `/catalog/cruises` browse routes (owned by
`@voyant-travel/catalog-react`, not removable via config). See `docs/PLAN.md`
§6 status note.

`packages/plugin-catalog-demo` and `packages/realtime-react` are vendored
prebuilt (dist-only) demo packages carried from the blueprint so the app resolves
and typechecks. Both are removal candidates — see their READMEs.
