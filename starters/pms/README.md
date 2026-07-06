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

Prerequisites: Node `>=22`, `pnpm@9`, Docker. Install from the repo root:

```bash
pnpm install
```

The proven local boot sequence is: **Docker services → `.dev.vars` → migrate → dev**.

### Local services (Docker)

`compose.yaml` runs local Postgres 16 (with the `pg_trgm` + `unaccent`
extensions from `docker/postgres/init.sql`) and Typesense 28 for catalog search:

```bash
cd starters/pms
docker compose up -d          # waits for both to report healthy
```

| Service | Container | Host port | Notes |
| --- | --- | --- | --- |
| Postgres | `voyant-pms-postgres` | `54331` | db/user/pass all `voyant` |
| Typesense | `voyant-pms-typesense` | `8109` | api-key `voyant-dev-typesense-key` |

Both are namespaced `voyant-pms-*` so they don't collide with other local
Voyant checkouts. Tear down with `docker compose down` (add `-v` to also drop
the data volumes).

### Environment

Runtime secrets are provided to `wrangler dev` via `.dev.vars` (git-ignored).
Copy the template and fill it in:

```bash
cp starters/pms/.dev.vars.example starters/pms/.dev.vars
```

Minimum required for local boot (see `.dev.vars.example` + `env.d.ts` for the
full list and docs):

- `DATABASE_URL` — Postgres connection string. For the local Docker Postgres
  above: `postgres://voyant:voyant@localhost:54331/voyant`.
- `BETTER_AUTH_SECRET`, `SESSION_CLAIMS_SECRET`, `INTERNAL_API_KEY` — generate
  with `openssl rand -base64 32` / `openssl rand -hex 32`.
- `KMS_LOCAL_KEY` — base64 32-byte key (`openssl rand -base64 32`); required
  because `wrangler.jsonc` defaults `KMS_PROVIDER=local`.
- `TYPESENSE_HOST`, `TYPESENSE_ADMIN_API_KEY` — catalog/storefront search. For
  the local Docker Typesense: `http://localhost:8109` +
  `voyant-dev-typesense-key`. If unset, catalog search degrades to empty
  results (no 500).
- `VOYANT_API_KEY` — canonical email/SMS/verify/vault provider (see
  `src/lib/notifications.ts` to swap transports). A dummy value is fine for
  local boot, but with it outbound email/SMS **and email verification** fail
  (logged as `Invalid API token`), so a freshly signed-up admin cannot verify
  by email — see "First admin user" below for the local workaround.
- `CHANNEL_WEBHOOK_SECRET` — shared secret the inbound channel webhook
  (`/v1/public/pms/channels/:channel/webhook`) checks via the `x-channel-secret`
  header before the connector verifies + parses the payload.
- `STOREFRONT_SINGLE_PROPERTY_ID` (optional) — see "Single-property mode" below.

Auth mode is `local` (`VOYANT_ADMIN_AUTH_MODE=local` in `wrangler.jsonc`), so
Better Auth sign-up / sign-in / password reset work without the Voyant cloud
broker.

Non-secret vars (`APP_URL`, `DASH_BASE_URL`, auth mode, `EMAIL_FROM`) live in
`wrangler.jsonc` under `vars`. The `CACHE` / `RATE_LIMIT` KV namespace IDs and
the R2 bucket names in `wrangler.jsonc` are placeholders — replace them with real
Cloudflare resource IDs before deploying (not required for `pnpm dev`).

### Database migrations

Run migrations once the DB is up and `.dev.vars` is in place — **before** the
first `dev` boot:

```bash
pnpm --filter pms-admin db:migrate    # apply all migrations (package sources + deployment)
```

Migrations use the `@voyant-travel/framework-migrations` collector: each
schema-owning package ships its own migrations, applied deps-first, and this
deployment's `./migrations` (link tables + any local module schema) apply last.
A second run is a no-op (`No pending migrations.`).

### Run

```bash
pnpm --filter pms-admin dev    # Worker + SSR admin on http://localhost:3300
```

Quick smoke: `/` (admin shell → redirects to `/sign-in` when unauthenticated),
`/shop` (storefront), and `POST /api/v1/public/catalog/search` (JSON, empty
`hits` until you seed + reindex). The API is mounted under `/api` (matching
`APP_URL`).

### First admin user

Local auth has no seeded user — the first sign-up becomes the workspace super
admin. Register at `/sign-up`. Better Auth requires email verification, but the
verification email can't send with a dummy `VOYANT_API_KEY`, so for local dev
mark the user verified directly, then sign in:

```bash
docker exec voyant-pms-postgres \
  psql -U voyant -d voyant -c \
  "UPDATE \"user\" SET email_verified = true WHERE email = 'admin@pms.local';"
```

(Configure a real email transport in `src/lib/notifications.ts` to verify by
email instead.)

### Demo dataset

`seed:acme` builds a realistic multi-property demo for a fictitious hotel group,
**Acme Hotels** — three properties (Acme Grand Hotel · Bucharest 5★, Acme
Seaside Resort · Mamaia 4★, Acme City Apartments · Cluj-Napoca aparthotel) with
room types, meal plans, rate plans, daily rates + inventory (today−30 …
today+180), ~40 guest stays across the lifecycle, unit assignments, check-ins,
housekeeping tasks, maintenance blocks and folios (night-audited + one settled).

The seed writes through the PMS package services (`pms-ari`, `pms-units`,
`pms-front-desk`, `pms-housekeeping`, `pms-folios`) and the shared owned-stay
booking write path, so it doubles as an integration exercise of those services.
It is **idempotent** — each run TRUNCATEs the tables it owns and re-seeds a
clean dataset.

```bash
pnpm --filter pms-admin seed:acme   # seed the Acme Hotels demo dataset (alias: seed)
pnpm --filter pms-admin reindex     # (re)build Typesense collections so storefront search works
```

Catalog/storefront search reads from Typesense and returns empty results until
you run `reindex` after seeding.

### More DB commands

```bash
pnpm --filter pms-admin db:generate   # generate deployment migration from schema changes
pnpm --filter pms-admin db:check      # validate the migration journal (no drift)
pnpm --filter pms-admin db:push       # push aggregate schema (dev only)
pnpm --filter pms-admin db:studio     # drizzle studio
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
(excluded via `createVoyantApp({ exclude })`, ADR-0007). Two modules remain
composed by necessity: `trips` and `quotes` are standard framework modules
whose provider ports are mandatory in `FrameworkProviders`, so they cannot be
cleanly excluded today.

**Admin UI removal.** The tour-operator admin surfaces the base operator shell
still shipped — the **Catalog** browse group (all verticals, incl. the
accommodations browse: ARI is the PMS authoring surface for stays), **Products**,
**Trips**, and any residual **Flights** entries — are removed from both the
sidebar and the route tree. The removal is deployment-owned and hand-applied to
the committed generated artifacts (`admin.routes.generated.tsx`,
`admin.extensions.generated.ts`, `admin.destinations.generated.ts`) rather than
via `voyant admin generate`, because those files derive from `voyant.config.ts`
`modules`, which also drives schema discovery — dropping the modules there would
break the `db doctor` schema-drift gate. The catalog/trips/quotes MODULES stay
composed API-side (the storefront + booking engine depend on catalog), so only
UI surfaces were removed:

- Base-nav groups `catalog`, `flights`, and `products` are filtered out by the
  app-owned `OperatorWorkspaceShell`
  (`src/components/admin-shared/operator-workspace-shell.tsx`), which reproduces
  the packaged `AdminWorkspaceShell` and injects a curated `navItems`.
- The `catalog`, `inventory` (Products), and `trips` admin extension factories,
  routes, and destination resolvers are pruned from the generated modules.
- The `/bookings/compose` alias (a legacy forward to the removed trips composer)
  is dropped. A few destination keys still declared by kept packages
  (`catalog.browse`/`catalog.detail` from `catalog-react/admin`,
  `product.detail`/`trip.create` from `bookings-react/admin`) retain stub
  resolvers pointed at PMS booking pages so the kept booking-journey flow has no
  dead links; see `src/lib/admin-destinations.ts`.
- The operator no longer SSR-prefetches product aggregates on the dashboard. The
  packaged `DashboardPage` still renders a baked-in "Active products" KPI card
  that cannot be subsetted without ejecting the whole dashboard (out of scope).

The final hotel sidebar shows: Dashboard, the PMS domain sections (Rates &
Inventory/ARI incl. Pricing, Front Desk, Housekeeping, Folios, Channels) from
`src/admin/*`, plus the stay-relevant framework groups (Bookings, Availability,
Resources, Suppliers, People/Guests, Finance, Legal, Notifications, Channel sync,
Promotions, Quotes, Logs) and Settings.

`packages/plugin-catalog-demo` and `packages/realtime-react` are vendored
prebuilt (dist-only) demo packages carried from the blueprint so the app resolves
and typechecks. Both are removal candidates — see their READMEs.
