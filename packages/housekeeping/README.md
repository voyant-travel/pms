# @voyant-travel/pms-housekeeping

Housekeeping and maintenance for the Voyant PMS: housekeeping **tasks**
(auto-generated from the day's departures/stayovers), the per-unit **room-status
lifecycle** (dirty → clean → inspected), and **maintenance blocks** that take a
unit out of service and reduce derived sellable capacity. It also exposes the
readiness lookup the front-desk check-in uses to warn on not-ready units.

## Status

Pre-release. Part of the PMS package graduation (PLAN §4.3, Phase 4); shaped for
npm publishing but **not yet published**. Consume it as a workspace package.
Depends on `@voyant-travel/pms-units` (the dependency direction is
housekeeping → units, never the reverse).

## Install

```jsonc
"dependencies": {
  "@voyant-travel/pms-housekeeping": "workspace:*"
}
```

## Registering the module

The default export is a `ModuleFactory` (via `defineDeploymentModule`). Register
it in the deployment composition; its module name `pms/housekeeping` mounts admin
routes at `/v1/admin/pms/housekeeping/*`.

```ts
import housekeepingModule from "@voyant-travel/pms-housekeeping"

const pmsDomainModules = {
  housekeeping: housekeepingModule,
  // …other pms-* modules
}
```

## HTTP routes

All under `/v1/admin/pms/housekeeping`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/tasks` | list / create housekeeping tasks |
| GET/PATCH/DELETE | `/tasks/:id` | fetch / update / delete a task |
| POST | `/tasks/:id/status` | advance task status (open → in_progress → done/skipped) |
| GET/POST | `/room-status` | list / set per-unit room status |
| POST | `/generate` | auto-generate tasks for a property + date |
| GET | `/readiness` | unit-readiness lookup (front-desk check-in seam) |
| GET/POST | `/maintenance-blocks` | list / create maintenance blocks |
| GET/PATCH | `/maintenance-blocks/:id` | fetch / update a block |
| POST | `/maintenance-blocks/:id/resolve` · `/cancel` | resolve / cancel a block |

### Task auto-generation

`generateTasksForDate` plans cleaning/inspection tasks from the day's departures
and stayovers and writes them idempotently: each auto task carries a
deterministic `sourceKey` (e.g. `dep:<unit>:<date>`) with a UNIQUE index, so
re-running the same day dedupes via `ON CONFLICT DO NOTHING` and never
double-creates. It runs nightly via the deployment's
`housekeeping-generate` cron and on demand via `POST /generate`.

### Maintenance → inventory

`buildBlockedUnitIdsByDate` turns active maintenance blocks into the
`blockedUnitIdsByDate` map the units module's serialized-inventory derivation
consumes, so an out-of-service room reduces sellable capacity.

## Schema

Three deployment-local tables (`./schema` subpath), migrated as deployment
sources after the framework bundle. All cross-module refs are loose typeid
columns; no intra-module FKs.

| Table | TypeID prefix | Notes |
| --- | --- | --- |
| `pms_housekeeping_tasks` | `hkt` | task type (`clean`/`inspect`/`turndown`/`deep_clean`), status, assignee, due date, `source` + idempotent `source_key` |
| `pms_unit_room_status` | `hkrs` | one row per unit; housekeeping lifecycle `dirty`/`clean`/`inspected` |
| `pms_maintenance_blocks` | `mblk` | unit out of service over an inclusive date range; only `active` blocks reduce capacity |

## Key exports

- `default` — the `pms/housekeeping` module factory.
- `planGeneratedTasks`, `buildSourceKey`, `generateTasksForDate`,
  `loadGenerationInput` — task generation.
- `buildBlockedUnitIdsByDate`, `windowCoversDate`, `MaintenanceWindow` —
  maintenance → inventory feed.
- `getUnitReadiness` (+ `UnitReadinessLookup`) — the front-desk check-in seam.
- Room-status readers, the transition guards
  (`assessUnitReadiness`, `roomStatusTransitionBlockedReason`,
  `taskStatusTransitionBlockedReason`, `roomStatusForCompletedTask`), the row
  types, and the validation schemas.

## Testing

```bash
pnpm --filter @voyant-travel/pms-housekeeping test
```

## License

Apache-2.0.
