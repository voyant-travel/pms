# `packages/`

Workspace packages for the PMS monorepo. Three kinds live here:

## `pms-*` — publishable PMS domain packages

The PMS-specific domain modules, graduated out of the deployment
(`starters/pms/src/modules/*`) into real workspace packages (PLAN §3.1 / §5.2).
Each is `@voyant-travel/pms-<domain>`, Apache-2.0, `publishConfig.access:
public`, built to `dist/` via `tsc` and consumed by `starters/pms` as
`workspace:*`.

| Package | Name | Owns | Depends on (pms) |
| --- | --- | --- | --- |
| `ari/` | `@voyant-travel/pms-ari` | ARI authoring over upstream accommodations tables (no schema of its own) | — |
| `units/` | `@voyant-travel/pms-units` | `pms_room_units`, `pms_unit_assignments`; serialized-inventory derivation | — |
| `housekeeping/` | `@voyant-travel/pms-housekeeping` | `pms_housekeeping_tasks`, `pms_unit_room_status`, `pms_maintenance_blocks` | `pms-units` |
| `front-desk/` | `@voyant-travel/pms-front-desk` | `pms_stay_ops`; tape chart + boards | `pms-units`, `pms-housekeeping` |
| `folios/` | `@voyant-travel/pms-folios` | `pms_folios`, `pms_folio_postings`, `pms_business_dates`; night audit | `pms-units` |
| `channels/` | `@voyant-travel/pms-channels` | `pms_channel_ari_events`, `pms_channel_reservations`; connector seam + ingest | — |

Dependency graph is acyclic: `units` is the leaf; `housekeeping`, `folios` and
`front-desk` build on it, and `front-desk` also uses `housekeeping` types.

**App boundary (channels).** The accommodation stay-booking write path
(`starters/pms/src/api/lib/persist-stay-booking.ts`) and the channel-connector
registry (`starters/pms/src/api/lib/channel-connectors.ts`) stay app-side. The
`pms-channels` module is built by `createChannelsModule({ getConnectors,
persistStayBooking })` in `starters/pms/src/api/composition.ts`, which injects both
— the package never imports app code.

**Schema packages** expose a `./schema` subpath (the Drizzle tables) so
cross-package consumers and the deployment's drizzle configs
(`starters/pms/drizzle*.config.ts`, globbing `../../packages/*/src/schema.ts`)
resolve the same table instances. Migrations for these tables stay in
`starters/pms/migrations/` (deployment sources, applied after the framework bundle
by the collector) — moving the schema files does not change their DDL, so no
migration is regenerated.

### Domain lifecycle

Prototype a new PMS domain as a deployment-local module in
`starters/pms/src/modules/<name>/` (auto-discovered by `modulesFromGlob`), then
graduate it into a `packages/<name>/` package here once its schema and routes
settle. See `starters/pms/src/modules/README.md`.

### Publishing (follow-up)

The `pms-*` packages are shaped for npm publishing (dist build, public
`publishConfig`, correct `repository.url`) but are not yet wired to a release
workflow. Add Changesets + a Trusted-Publisher OIDC release workflow (mirroring
the framework repo) when the first publish is desired.

## Repo tooling

- `eslint-config/` — `@repo/eslint-config` (shared ESLint flat config).
- `typescript-config/` — `@repo/typescript-config` (shared `tsconfig` bases;
  the `pms-*` packages extend `./base.json`).

## Vendored prebuilt demo deps

- `plugin-catalog-demo/` — `@voyant-travel/plugin-catalog-demo`
- `realtime-react/` — `@voyant-travel/realtime-react`

These are dist-only bundles carried over from the operator blueprint to satisfy
demo-data wiring. They have no `src/` and are candidates for removal once the
demo data is no longer needed.
