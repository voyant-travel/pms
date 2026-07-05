# Voyant PMS

An open-source Property Management System for hotels, apartments, aparthotels,
and property managers operating multiple properties — built on the
[Voyant](https://github.com/voyant-travel/voyant) travel framework. One
Cloudflare Worker deployment serves the staff admin, the `/v1/*` API, and a
direct-booking storefront for guests.

The division of labor with the framework is deliberate: **the framework sells
stays; the PMS operates them.** Voyant's published packages provide the ARI
schema (room types, rate plans, daily rates and inventory), the catalog booking
engine, bookings, payments, CRM, and finance. This repo adds the operating
layer on top: front desk, housekeeping, folios, night audit, and channel
connectivity. See [docs/PLAN.md](docs/PLAN.md) for the full architecture plan.

## Features

- **Rates & inventory (ARI)** — room types, bed configurations, meal plans,
  rate plans, and a rates & availability calendar with bulk range/weekday
  updates. Authored inventory is immediately searchable and bookable through
  the framework's owned-stay quote path.
- **Front desk** — tape chart (units × dates), arrivals/departures/in-house
  boards, check-in/check-out, no-shows, and unit assignment with overlap
  guards. Serialized room types derive their sellable capacity from actual
  units, minus maintenance blocks.
- **Housekeeping & maintenance** — auto-generated cleaning/turndown tasks from
  the day's departures and stayovers (idempotent, cron-driven), a
  dirty/clean/inspected room-status lifecycle that warns at check-in, and
  maintenance blocks that reduce sellable inventory.
- **Folios & night audit** — an immutable posting ledger per stay (plus house
  accounts), void/transfer via reversal postings, a nightly audit that posts
  room charges and rolls the business date, settlement into a fiscal invoice,
  and daily occupancy / ADR / RevPAR reports.
- **Direct-booking storefront** — property-first search (dates + occupancy),
  a booking.com-style room × rate table on the property page, and the
  framework's booking journey and payment flow end to end. A single-property
  mode turns the storefront into one hotel's booking site.
- **Channel connectivity (skeleton)** — a provider-pluggable
  `ChannelConnector` seam with outbound ARI push and inbound reservation
  ingest ledgers, plus a reference mock connector. Live OTA connectors are the
  next step; see
  [docs/architecture/connect-exposure.md](docs/architecture/connect-exposure.md)
  for how Voyant operators can consume PMS inventory.

## Repository layout

```
starters/
  pms/            the deployment starter: Cloudflare Worker (admin + API +
                  storefront), composition, auth, migrations, crons —
                  see starters/pms/README.md
packages/
  ari/            @voyant-travel/pms-ari          ARI authoring (writes upstream tables)
  units/          @voyant-travel/pms-units        room units + assignments + derived inventory
  front-desk/     @voyant-travel/pms-front-desk   tape chart, boards, check-in/out
  housekeeping/   @voyant-travel/pms-housekeeping tasks, room status, maintenance
  folios/         @voyant-travel/pms-folios       folio ledger, night audit, reports
  channels/       @voyant-travel/pms-channels     connector seam, ARI push, ingest
  eslint-config/  typescript-config/              repo tooling
docs/             plan, ADRs, architecture notes
```

Each domain package is a Voyant module: it owns its routes, services,
validation, and (where applicable) schema, and registers into the deployment
through `createVoyantApp` composition. The admin UI lives app-side as a thin
host, importing types from the packages.

## Getting started

Prerequisites: Node `>= 22`, pnpm 9.

```bash
pnpm install
pnpm build        # builds packages, then the app
pnpm typecheck
pnpm test
```

To run the app locally (needs a Postgres `DATABASE_URL` and a few generated
secrets), follow [starters/pms/README.md](starters/pms/README.md):

```bash
cp starters/pms/.dev.vars.example starters/pms/.dev.vars   # fill in
pnpm --filter pms-admin db:migrate
pnpm --filter pms-admin dev                         # http://localhost:3300
```

Deploying requires real Cloudflare resources (KV namespaces, R2 buckets) in
place of the placeholders in `starters/pms/wrangler.jsonc`.

## Status

Pre-release. All six domains plus the storefront are code-complete and covered
by unit tests (pure domain logic, validation, composition, and route
mounting), and the repo's typecheck/lint/test/build lanes are green. Not yet
done:

- End-to-end runtime validation against a live database (the immediate next
  step).
- npm publishing of the `pms-*` packages — they are publish-shaped but
  consumed as workspace packages today; release wiring (changesets + trusted
  publishing) is a follow-up.
- Live OTA connectors and the outbound Voyant Connect provider surface (the
  seam and ledgers exist; see the channels package README).

## Contributing

Start with [docs/PLAN.md](docs/PLAN.md) (architecture, boundaries, roadmap)
and [docs/adr/](docs/adr/) for recorded decisions. Each package README
documents its routes, schema, and exports. Verification lanes: `pnpm
typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` from the repo root.

## License

[Apache-2.0](LICENSE)
