# @voyant-travel/pms-units

Physical room inventory for the Voyant PMS: individual room **units** and their
**assignments** to stays. It owns the units the framework's
`@voyant-travel/accommodations` package deliberately leaves out (units were
removed when the accommodation-resale boundary was drawn), and it derives the
upstream `room_type_daily_inventory` capacity for `serialized` room types from
the count of active, available units — keeping the owned-stay search/quote path
authoritative and untouched.

## Status

Pre-release. Part of the PMS package graduation (PLAN §4.1, Phase 3); shaped for
npm publishing but **not yet published**. Consume it as a workspace package.
`units` is the leaf of the PMS dependency graph — `housekeeping`, `folios`, and
`front-desk` build on it.

## Install

```jsonc
"dependencies": {
  "@voyant-travel/pms-units": "workspace:*"
}
```

## Registering the module

The default export is a `ModuleFactory` (via `defineDeploymentModule`). Register
it in the deployment composition; its module name `pms/units` mounts admin
routes at `/v1/admin/pms/units/*`.

```ts
import unitsModule from "@voyant-travel/pms-units"

const pmsDomainModules = {
  units: unitsModule,
  // …other pms-* modules
}
```

## HTTP routes

All under `/v1/admin/pms/units`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/units` | list / create room units |
| GET/PATCH/DELETE | `/units/:id` | fetch / update / delete a unit |
| POST | `/room-types/:roomTypeId/recompute-inventory` | recompute serialized daily capacity over a range |
| GET/POST | `/assignments` | list / create unit assignments (overlap-guarded) |
| PATCH/DELETE | `/assignments/:id` | move / remove an assignment |
| GET | `/units/:unitId/assignments` | assignments for one unit |

Assignments use half-open date ranges (`[from, to)`) and are guarded against
overlapping the same unit.

## Schema

Two deployment-local tables (`./schema` subpath), migrated as deployment sources
after the framework bundle. Cross-module refs are loose typeid text columns; the
only real FK is intra-module.

| Table | TypeID prefix | Notes |
| --- | --- | --- |
| `pms_room_units` | `runt` | one physical sellable room; status `available`/`out_of_order`/`out_of_service`, loose refs to property + room type, connecting-unit self-ref |
| `pms_unit_assignments` | `unas` | booking item ↔ unit over a date range; `unit_id` FK → `pms_room_units.id` (cascade) |

Occupancy is **not** stored on the unit — it is derived from assignments at read
time.

### Serialized-inventory derivation

`recomputeDailyInventory` writes `room_type_daily_inventory.capacity` as a single
atomic, idempotent `INSERT … ON CONFLICT DO UPDATE` per `(roomType, date)` — the
sellable capacity is the count of active, available units minus any blocked on
the day. Blocking is a pluggable hook: `recomputeDailyInventory` accepts
`blockedUnitIdsByDate` (date → set of unit ids), which the housekeeping module
supplies from active maintenance blocks. Pooled/virtual room types are never
touched (capacity stays hand-authored via the ARI calendar). Only `capacity` is
derived; `closed` stays an ARI authoring concern.

## Key exports

- `default` — the `pms/units` module factory.
- `computeDailyCapacities`, `buildInventoryRowsFromCapacities`, `isSellableUnit`,
  `recomputeDailyInventory`, `recomputeInventoryForRoomTypeChange`,
  `DEFAULT_DERIVATION_HORIZON_DAYS`, `BlockedUnitIdsByDate` — the derivation core.
- `filterOverlapping`, `AssignmentResult`, `DateInterval` — assignment overlap
  helpers.
- Date helpers (`addDays`, `expandDates`, `formatIsoDate`, `parseIsoDate`,
  `rangesOverlap`, `MAX_RANGE_DAYS`), row types (`RoomUnitRow`,
  `UnitAssignmentRow`), and the validation schemas.

## Testing

```bash
pnpm --filter @voyant-travel/pms-units test
```

## License

Apache-2.0.
