# Voyant PMS — Product & Architecture Plan

Status: draft v1 (2026-07-04)
Repo: `voyant-travel/pms`
License: Apache-2.0 (same as the Voyant framework)

## 1. What we are building

An open-source Property Management System for **hotels, apartments, aparthotels,
and property managers operating multiple properties**, built on top of the
published Voyant framework packages (`@voyant-travel/*`). It ships with:

- A **PMS admin** — property setup, rates & inventory (ARI), front desk
  (tape chart, check-in/check-out), housekeeping, maintenance, folios,
  night audit, guest CRM.
- A **direct-booking storefront** — guests search by dates + occupancy, see
  room types with rate plans, book, and pay online. Reuses the Voyant catalog
  booking engine end to end.
- (Later) **Channel connectivity** — inbound ARI sync with OTAs, and outbound
  distribution of PMS inventory to Voyant operators via Voyant Connect.

### What it is not

- Not a fork of `voyant-travel/voyant`. Everything shared is consumed as
  published npm packages; upgrades happen by bumping the framework BOM.
- Not a tour operator / DMC product. Packages, cruises, charters, flights,
  MICE stay out of the standard PMS composition.

## 2. Relationship to the Voyant framework repo

The framework repo drew an explicit boundary
(`voyant/docs/architecture/accommodation-resale-boundary.md`, lint-enforced by
`check-accommodation-resale-boundary.mjs`): **Voyant sells accommodation; it
does not operate it.** This repo is the sanctioned home for the operating half.

Division of responsibilities:

| Concern | Lives in | Notes |
| --- | --- | --- |
| ARI **schema** (room types, meal plans, rate plans, daily rates, daily inventory) | `voyant` — `@voyant-travel/accommodations` | `schema-inventory.ts`; already PMS-grade |
| ARI **read/quote path** (owned-stay search, quoting, booking-engine bridge) | `voyant` — `@voyant-travel/accommodations` | `service-owned-stays.ts`, `booking-engine/`, `draft-shape.ts` |
| ARI **authoring surface** (admin CRUD for room types / rate plans / inventory calendar) | **this repo**, initially | Grey zone by design. Revisit upstreaming into `accommodations` once the surface stabilizes — it arguably serves "sellable inventory" and would then benefit every Voyant deployment. |
| Physical property model (facilities, properties, property groups) | `voyant` — `@voyant-travel/operations` | Multi-property (chain / management company / portfolio) is already modeled |
| Booking core + extension-table pattern | `voyant` — `@voyant-travel/bookings` | `stay_booking_items` already carries check-in/out, pax, per-night rates |
| Room units, front desk, housekeeping, maintenance, folios, night audit, in-stay ops | **this repo** | Deliberately removed from / out of scope for the framework repo |
| Inbound channel management (OTA ARI sync) | **this repo** (plugins) | Framework repo stays "never OTA"; PMS needs it eventually |

Rule of thumb when something is ambiguous: if it exists so a *seller* can price
and book the inventory, it belongs upstream; if it exists so *staff* can run
the property, it belongs here.

### Reference implementation: the deleted hospitality package

The framework repo once contained `@voyantjs/hospitality` (+
`hospitality-react`), ~23k LOC covering room units, housekeeping tasks,
maintenance blocks, rate-plan inventory overrides, stays routes, and admin
hooks. It was deleted in commit `1c9eaa7b9` ("Remove legacy hospitality
packages", 2026-05-19) when the resale boundary was drawn.

Recover it as a design/code reference:

```sh
cd ../voyant && git show 1c9eaa7b9^:packages/hospitality/src/service.ts
git show 1c9eaa7b9^ --stat -- packages/hospitality packages/hospitality-react
```

It predates several framework refactors (package scope rename, react+ui merge,
extension-table bookings), so treat it as a domain-model reference, not a
copy-paste source.

## 3. Architecture

### 3.1 Deployment-as-config, PMS-as-modules

The PMS follows the framework's consolidated-deployments model
(`voyant/docs/architecture/consolidated-deployments-rfc.md`): one deployment
app assembles published modules plus local ones. The sibling `acme-travel`
repo is the proven blueprint for an external consumer.

```
pms/
  apps/
    pms/                 # the deployment (scaffolded via `voyant new pms`)
                         #   Cloudflare Worker: API + SSR admin + storefront
                         #   owns: composition.ts, providers, auth, wrangler,
                         #   drizzle configs, migrations, links, i18n hosts
  packages/
    front-desk/          # @voyant-travel/pms-front-desk
    units/               # @voyant-travel/pms-units
    housekeeping/        # @voyant-travel/pms-housekeeping
    folios/              # @voyant-travel/pms-folios
    pms-react/           # admin UI hooks/pages for the above (or per-package ./admin subpaths, matching the *-react convention upstream)
    plugins/
      channel-*/         # OTA channel connectors (later)
  docs/                  # this plan, ADRs, architecture notes
```

Lifecycle for each PMS domain: prototype as a **deployment-local module**
(`apps/pms/src/modules/<name>/` with `defineDeploymentModule`, auto-discovered
by `modulesFromGlob`), then graduate to a published package once the schema and
routes settle. Deployment-local schemas are auto-picked-up by the migration
collector, so prototyping is cheap.

### 3.2 What the deployment app consumes vs owns

Consumed from npm (version pinned via the `@voyant-travel/framework` BOM):

- `@voyant-travel/framework` — `createVoyantApp`, `frameworkComposition`,
  `FrameworkProviders`, capability graph, `exclude` subsetting (ADR-0007).
- `@voyant-travel/accommodations` (+ `-contracts`) — ARI schema, owned-stay
  search/quote, stay booking extension, room blocks, accommodation draft shape.
- `@voyant-travel/operations` — facilities, properties, property groups.
- `@voyant-travel/bookings` (+ `-contracts`, `bookings-react`) — booking core,
  state machine, travelers, BookingJourney wizard.
- `@voyant-travel/catalog` (+ `catalog-react`, `catalog-contracts`) — search,
  booking engine (`/quote`, `/book`, holds, drafts), availability calendar,
  browse/detail pages.
- `@voyant-travel/commerce` — pricing (price catalogs + RRULE seasons),
  sellability, checkout, markets.
- `@voyant-travel/allotments`, `@voyant-travel/inventory`,
  `@voyant-travel/crm`, `@voyant-travel/finance`,
  `@voyant-travel/transactions`, `@voyant-travel/storefront`,
  `@voyant-travel/storefront-sdk`, `@voyant-travel/admin`,
  `@voyant-travel/auth`, `@voyant-travel/db`, `@voyant-travel/hono`,
  `@voyant-travel/worker-runtime`, `@voyant-travel/framework-migrations`.
- Payment plugin(s): `@voyant-travel/plugin-netopia` initially (already
  provider-pluggable via `CardPaymentStarter`); add Stripe when we go
  international.

Owned by `apps/pms` (deployment surface, copied from the operator starter and
then diverged freely):

- `src/api/composition.ts` (providers container + local modules/extensions),
  `src/api/app.ts`, `src/api/runtime/*` adapters, `src/api/auth/handler.ts`
  (Better Auth), `src/entry.ts` / `src/hono-api-dispatch.ts` /
  `src/ssr-handler.ts` (lazy SSR split), cron jobs, subscribers, public paths.
- Admin shell: `src/routes/`, `src/router.tsx`, generated admin route files
  (`voyant admin generate --routes`), components, styles, i18n hosts.
- DB glue: `voyant.config.ts`, drizzle configs, `drizzle.*.generated.ts`,
  `src/links/*` (`defineLink` files), `migrations/`, migrate/seed scripts.
- `wrangler.jsonc`, `env.d.ts`, Vite/tsconfig/vitest configs.

Composition subsetting: use `createVoyantApp({ exclude })` to drop standard
modules the PMS doesn't need. The operator's deployment-local modules
(cruises, charters, mice, realtime-extras) simply don't get copied.

### 3.3 Extension seams used (no framework changes required)

- **Modules**: `defineDeploymentModule` / published module packages with
  `HonoModule`s mounted at `/v1/admin/pms/*` and `/v1/public/*`.
- **Booking extension tables**: PMS booking-side data (e.g. unit assignment,
  registration card, folio ref) goes in 1:1 tables keyed on
  `booking_item_id` / `booking_id`, exactly like upstream
  `stay_booking_items`. Never widen upstream tables.
- **Links**: cross-module associations via `defineLink` at the deployment;
  link tables emitted with `voyant db sync-links --emit-drizzle`.
- **Plugins**: payment processors, channel connectors, e-invoicing as
  `Plugin` bundles passed to `createVoyantApp({ plugins })`.
- **Migrations**: `@voyant-travel/framework-migrations` collector — package
  migrations deps-first, deployment migrations last, ledger-tracked.

### 3.4 Tenancy

Same model as the operator (framework ADR-0001): **tenancy at the deployment
boundary**, one deployment per customer (property group). No in-process tenant
scoping in packages. A property manager with 30 properties is ONE tenant —
multi-property is handled inside the deployment by
`property_groups`/`properties`, not by tenancy.

Self-serve SaaS packaging (per-tenant worker provisioning) is a
platform/voyant-cloud concern and out of scope for this repo.

## 4. Domain modules to build

### 4.1 `pms-units` — physical room inventory

The upstream `room_types.inventoryMode` enum already includes `serialized`,
but the units table was deleted with hospitality. Rebuild here:

- `room_units`: unit number/name, `roomTypeId` (loose typeid → link),
  `propertyId`, floor/wing, status (`available | occupied | out_of_order |
  out_of_service`), connecting-room refs, attributes.
- Derivation: for `serialized` room types, `room_type_daily_inventory`
  capacity is derived from active units minus maintenance blocks; for
  `pooled`, capacity stays hand-authored. A sync service keeps the upstream
  daily-inventory table authoritative so the owned-stay search/quote path in
  `accommodations` keeps working untouched.
- Unit assignment: extension table on `booking_items`
  (`pms_unit_assignments`: booking item ↔ unit, date range, assigned-by),
  with overlap guards.

### 4.2 `pms-front-desk` — daily operations

- **Tape chart**: rooms × dates grid (units on the serialized axis, room-type
  capacity rows for pooled), drag to assign/move, color by booking status.
  Reads `stay_booking_items` + unit assignments. This is the flagship admin
  screen.
- **Check-in / check-out**: operations over `stay_booking_items`
  (columns exist upstream; the workflows don't): registration, key/notes,
  early/late flags, no-show marking (`reserved | cancelled | no_show` status
  enum already exists), walk-in creation (drives the standard booking engine
  with an admin surface).
- **Arrivals / departures / in-house** boards; occupancy dashboard.

### 4.3 `pms-housekeeping` — housekeeping + maintenance

- `housekeeping_tasks`: unit, type (`clean | inspect | turndown | deep_clean`),
  status, assignee, due, checklist; auto-generation rules from
  departures/stayovers.
- Room status lifecycle (`dirty | clean | inspected`) attached to units,
  gating check-in.
- `maintenance_blocks`: unit + date range + reason → feeds the units→daily
  inventory derivation (out-of-order rooms reduce sellable capacity).

### 4.4 `pms-folios` — guest ledger + night audit

- `folios`: per stay (booking item) and house accounts; postings (room
  charges, extras, taxes, payments, transfers); split/route rules.
- Nightly room-charge posting = **night audit** job (cron): post room + tax
  per in-house stay, roll business date, emit the day's reports.
- Lean on `@voyant-travel/finance` + `transactions` for invoices/receipts and
  payment records — folios are the operational ledger; finance remains the
  fiscal one. Map folio settlement → finance invoice at checkout.
- E-invoicing per market via existing plugins (e.g. SmartBill for RO).

### 4.5 ARI authoring (admin surface over upstream schema)

Admin CRUD + calendar UIs over `@voyant-travel/accommodations` tables:

- Room types & bed configs, meal plans, rate plans (+ room-type joins),
  seasons via `commerce` price schedules.
- **Rates & availability calendar**: grid of room types × dates editing
  `rate_plan_daily_rates` (sell/cost/occupancy basis) and
  `room_type_daily_inventory` (capacity, closed), bulk operations
  (date range × weekday masks), min-stay/closed-to-arrival as sellability
  policies.
- Built as a PMS module (routes under `/v1/admin/pms/ari/*` writing to
  upstream tables via the accommodations service layer where it exists,
  direct drizzle where it doesn't). Candidate for upstreaming later — keep it
  cleanly separated from front-desk code so the extraction stays cheap.

### 4.6 Storefront (direct bookings)

Mostly a property-first reskin of what exists:

- The hotel flow is already first-class:
  `accommodations/src/draft-shape.ts` emits date-range + occupancy configure
  steps and a rooms step (room types × rate plans, per-night live pricing)
  rendered by the `BookingJourney` wizard. Public routes
  (`/v1/public/catalog/quote|book|holds`, checkout, guest sessions, payment
  links) all exist.
- Build: property-first search (dates + occupancy + destination →
  properties → room-type/rate-plan matrix), property detail page (gallery,
  amenities from `facility_features`, policies, availability calendar —
  `catalog-react` components), multi-room bookings, guest account portal
  (exists upstream as customer-portal).
- Single-property mode: a property manager's own domain pointing straight at
  one property's booking page (skip search). Multi-property mode: portfolio
  landing + search.
- Custom-branded storefronts later via `@voyant-travel/storefront-sdk`
  (headless client) — the packaged storefront is the batteries-included path.

### 4.7 Channel connectivity (later phases)

- **Inbound (OTA channel manager)**: plugins per channel (Booking.com,
  Airbnb, Expedia) or a channel-manager aggregator first (cheaper: one
  integration, many channels). Push ARI deltas out (rates/availability
  changes → channel), ingest reservations in (→ standard booking engine, so
  OTA bookings land as normal bookings with stay items). Event-driven off the
  outbox; idempotent by channel reservation ID.
- **Outbound (Voyant Connect synergy)**: expose PMS inventory as a Connect
  supplier source so any Voyant operator/DMC can resell it. Both sides
  already speak the same availability-search / StayOffer-shaped contracts, so
  this is an adapter over `service-owned-stays`-equivalent reads. Ship after
  the PMS core is stable; design nothing that blocks it.

## 5. Repo mechanics

### 5.1 Current scaffold vs target

The repo is currently a stock `create-turbo` scaffold. Deltas:

- **Replace `apps/web` and `apps/docs`** (placeholder Next.js apps) with
  `apps/pms`, generated by `voyant new pms` (the CLI clones the operator
  starter — TanStack Start + Cloudflare Worker — from a version-matched
  GitHub Releases tarball) and moved into `apps/`. The starter brings its own
  Vite/wrangler/drizzle setup; the docs site can come back later (framework
  docs conventions: `docs/` markdown + ADRs first).
- **Keep** `packages/typescript-config` and `packages/eslint-config`
  (align rules with upstream over time). `packages/ui` is upstream's job
  (`@voyant-travel/ui`); drop the scaffold one unless we accumulate
  PMS-specific primitives.
- Root `package.json`: bump `engines.node` to `>=22` (operator starter
  expectation) and align `packageManager` with the framework repo's pnpm
  major. Add `changesets` once the first `packages/*` module exists.
- pnpm `overrides` pinning the framework lockstep set, as in `acme-travel`
  (the BOM pins tested versions; overrides prevent accidental drift).

### 5.2 Conventions

- Package naming: `@voyant-travel/pms-<domain>` (e.g. `pms-front-desk`),
  published public with `publishConfig.access: public`, Apache-2.0,
  `repository.url` set exactly to `https://github.com/voyant-travel/pms.git`
  (no `git+` prefix — sigstore provenance rejects it).
- npm publishing via Trusted Publisher OIDC (`id-token: write` +
  `registry-url`), mirroring the framework repo's release workflow.
- Follow upstream package shape and guardrails: `parseJsonBody`/`parseQuery`
  in routes, thin routes, loose typeid columns + `defineLink` for
  cross-module refs, no in-process tenant scoping, schema-per-package with
  shipped migrations.
- TypeID prefixes for new tables: pick unused prefixes and keep a registry in
  this repo (upstream reserves its own in `schema-kit`); e.g. `runt`
  (room_units), `hkt` (housekeeping_tasks), `mblk` (maintenance_blocks),
  `folo` (folios), `fpst` (folio_postings), `unas` (unit assignments) —
  confirm against upstream's prefix list before first migration.
- Framework upgrades: bump `@voyant-travel/framework` (BOM), run
  `voyant upgrade` + collector migrations, fix typecheck fallout surfaced by
  the `FrameworkProviders` forcing function.
- Docs: `docs/adr/` for decisions, `docs/architecture/` for active rules,
  starting with this plan. Record the ARI-authoring grey-zone decision as
  ADR-0001 of this repo.

## 6. Roadmap

Phases are sequential-ish; each ends deployable.

> **Status (2026-07-05):** Phases 0–6 are code-complete on `main` and verified
> by typecheck/lint/unit tests/build. Deviations from the descriptions below:
> Phase 0 scaffolded by copying the acme-travel consumer blueprint (the CLI
> tarball was stale) and no dev deploy has happened yet (needs DB + Cloudflare
> resources — see apps/pms/README.md); trips/quotes could not be cleanly
> excluded (framework-mandatory ports) and remain composed; Phase 4 gating is
> warn-not-block by design; Phase 6 shipped the connector seam, mock
> connector, ledgers, ingest and docs — a real OTA connector, automatic ARI
> fan-out from bulk upserts, and the Connect provider surface are follow-ups
> (docs/architecture/connect-exposure.md). End-to-end runtime validation
> against a live database is the immediate next step.

**Phase 0 — Skeleton (repo bootstrap)**
`voyant new pms` → `apps/pms`; strip non-stay verticals via `exclude` +
omit operator-local modules; wire auth, DB, migrations; deploy to a dev
Cloudflare account. Done when: admin loads, a property + room type + rate plan
can be created via existing upstream APIs, migrations run via the collector.

**Phase 1 — ARI authoring**
Room types / bed configs / meal plans / rate plans CRUD + the rates &
availability calendar (4.5). Resurrect deleted `routes-inventory.ts` /
`hospitality-react` as reference. Done when: a property manager can fully
configure sellable inventory without touching the DB, and
`searchOwnedStays`/quote returns correct results from it.

**Phase 2 — Direct-booking storefront**
Property-first storefront (4.6) over the existing booking engine + payment
plugin. Done when: a guest books and pays for a stay end to end on a deployed
storefront; booking appears in admin with correct stay item + nightly rates.

**Phase 3 — Front desk + units**
`pms-units` (with derived serialized inventory), unit assignment, tape chart,
check-in/check-out, arrivals/departures boards, walk-ins, no-shows. Done when:
a front-desk agent runs a full day (arrivals → in-house → departures) in the
admin.

**Phase 4 — Housekeeping + maintenance**
Task generation, room status gating check-in, maintenance blocks reducing
sellable capacity. Done when: departures auto-create cleaning tasks and a
dirty room blocks check-in until inspected.

**Phase 5 — Folios + night audit**
Folio postings, extras, transfers, settlement → finance invoice, nightly
audit cron + business-date roll, daily reports (occupancy, ADR, RevPAR).
Done when: a stay's charges reconcile from check-in to a fiscal invoice.

**Phase 6 — Channels + Connect**
Inbound: one channel-manager/OTA connector with ARI push + reservation
ingest. Outbound: Connect supplier adapter exposing PMS inventory to Voyant
operators. Done when: an OTA reservation lands as a normal PMS booking, and a
voyant operator deployment can search/quote/book PMS inventory.

Phases 1–2 deliberately come before front desk: they produce a sellable,
demoable product (configure inventory → take direct bookings) on almost
entirely reused code, and they exercise the upstream seams early — surfacing
any needed upstream changes while they're cheap.

## 7. Risks & open questions

- **Upstream API gaps for authoring.** `accommodations` has schema + read
  path but few write services (authoring routes were deleted). We'll write to
  its tables from PMS modules; expect to upstream small service-layer PRs
  (e.g. daily-rate bulk upsert) rather than raw-drizzle everything.
- **Prefix/enum collisions.** New tables must not collide with upstream
  TypeID prefixes or reintroduce names the resale-boundary lint watches for
  upstream. Maintain our own prefix registry.
- **Serialized-inventory derivation correctness.** Units → daily inventory
  sync must stay consistent under concurrent assignment/maintenance edits;
  design it as an idempotent recompute per (roomType, date), not incremental
  counters.
- **Admin shell divergence.** The operator starter's admin shell is copied,
  not packaged; upstream shell improvements arrive via `voyant upgrade`
  regeneration for generated files only. Budget periodic manual diffing
  against the starter.
- **Folio vs finance overlap.** Keep folios operational and finance fiscal;
  decide the exact settlement mapping (one invoice per folio? per booking?)
  in a Phase-5 ADR before building.
- **Storefront package-tour residue.** `packages/storefront` public routes
  include tour-shaped endpoints (departures/itineraries). Excluding vs
  ignoring them in the PMS composition — decide in Phase 0 based on what
  `exclude` supports for that module.
- **Upstreaming trigger for ARI authoring.** Revisit after Phase 2: if other
  Voyant deployments want owned-ARI authoring, extract it into
  `accommodations` and delete here.

## 8. Pointers

- Consumer blueprint: `../acme-travel/apps/admin` (live external consumer of
  published packages; same file shape `apps/pms` will have).
- Operator starter (source of the deployment surface):
  `../voyant/starters/operator/`.
- Framework docs worth reading before Phase 0:
  `consolidated-deployments-rfc.md`, `custom-modules.md`,
  `migration-collector-d2.md`, `booking-journey-architecture.md`,
  `catalog-booking-engine.md`, `accommodation-resale-boundary.md`,
  `custom-storefront-sdk.md`, ADR-0001 (tenancy), ADR-0007 (subsetting) —
  all under `../voyant/docs/`.
- Deleted hospitality reference: `git show 1c9eaa7b9^:packages/hospitality/…`
  in the framework repo.
