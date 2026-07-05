# @voyant-travel/pms-front-desk

Daily front-desk operations for the Voyant PMS: the **tape chart**, the
**arrivals / departures / in-house** boards, and the **check-in / check-out /
no-show** workflows. It owns a thin operational overlay on the upstream stay
booking item (`pms_stay_ops`) and reads across the upstream
`stay_booking_items` + `booking_items` + `bookings` tables (plus local unit
assignments) to build its screens — it never widens upstream tables.

## Status

Pre-release. Part of the PMS package graduation (PLAN §4.2, Phase 3); shaped for
npm publishing but **not yet published**. Consume it as a workspace package.
Depends on `@voyant-travel/pms-units` and `@voyant-travel/pms-housekeeping`
(the latter for the check-in readiness seam).

## Install

```jsonc
"dependencies": {
  "@voyant-travel/pms-front-desk": "workspace:*"
}
```

## Registering the module

The default export is a `ModuleFactory` (via `defineDeploymentModule`). Register
it in the deployment composition; its module name `pms/front-desk` mounts admin
routes at `/v1/admin/pms/front-desk/*`.

```ts
import frontDeskModule from "@voyant-travel/pms-front-desk"

const pmsDomainModules = {
  "front-desk": frontDeskModule,
  // …other pms-* modules
}
```

## HTTP routes

All under `/v1/admin/pms/front-desk`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/tape-chart` | rooms × dates grid (units on the serialized axis, room-type rows for pooled) |
| GET | `/boards` | arrivals / departures / in-house boards for a date |
| POST | `/check-in` | check a stay in (readiness-gated, see below) |
| POST | `/check-out` | check a stay out |
| POST | `/no-show` | mark a no-show (mirrors onto the upstream reservation status) |

### Readiness-warning seam

Check-in accepts an injected `getUnitReadiness` lookup (supplied here by
`@voyant-travel/pms-housekeeping`) and **warns** — does not block — on a dirty
room or an active maintenance block for the assigned unit. Gating is
warn-not-block by design (PLAN §6, Phase 4).

## Schema

One deployment-local table (`./schema` subpath), migrated as a deployment
source after the framework bundle.

| Table | TypeID prefix | Notes |
| --- | --- | --- |
| `pms_stay_ops` | `stop` | 1:1 operational overlay on `stay_booking_items` (loose `booking_item_id`, UNIQUE); ops lifecycle `expected → checked_in → checked_out` (+ mirrored `no_show`), check-in/out timestamps + actor, registration-card fields |

The upstream row keeps the reservation facts; this row keeps the operational
lifecycle. It is the extension-table pattern (PLAN §3.3).

## Key exports

- `default` — the `pms/front-desk` module factory.
- `assembleTapeChart` + the `TapeChart*` / `UnassignedArrival` types — the pure
  tape-chart assembler.
- `classifyBoards` + `BoardEntry` / `Boards` — the pure arrivals/departures/
  in-house classifier.
- `checkInBlockedReason`, `checkOutBlockedReason`, `CheckInOptions`, `OpsResult`,
  `UnitReadinessInfo`, `UnitReadinessLookup` — the check-in/out guards + readiness
  seam types.
- `StayContext`, `StayPicture`, `AssignmentContext` read types, the `StayOpsRow`
  row type, and the validation schemas.

## Testing

```bash
pnpm --filter @voyant-travel/pms-front-desk test
```

## License

Apache-2.0.
