# @voyant-travel/pms-ari

ARI (availability, rates & inventory) authoring for the Voyant PMS. This module
is the admin surface a property manager uses to configure sellable inventory:
room types and bed configs, meal plans, rate plans (with room-type joins), and
the rates & availability calendar. It writes to the upstream
`@voyant-travel/accommodations` tables — the same schema the framework's
owned-stay search/quote path reads — so authored inventory is immediately
sellable. It owns **no schema of its own**.

## Status

Pre-release. Part of the PMS package graduation (PLAN §4.5, Phase 1); shaped for
npm publishing but **not yet published**. Consume it as a workspace package.
This module is a candidate for upstreaming into `@voyant-travel/accommodations`
once the authoring surface stabilizes.

## Install

Workspace usage today (npm publish is a follow-up):

```jsonc
// package.json
"dependencies": {
  "@voyant-travel/pms-ari": "workspace:*"
}
```

## Registering the module

The default export is a `ModuleFactory` (via `defineDeploymentModule`). Register
it in the deployment composition (`apps/pms/src/api/composition.ts`); its module
name `pms/ari` mounts the admin routes at `/v1/admin/pms/ari/*`.

```ts
import ariModule from "@voyant-travel/pms-ari"

const pmsDomainModules = {
  ari: ariModule,
  // …other pms-* modules
}
```

## HTTP routes

All under `/v1/admin/pms/ari`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/room-types` | list / create room types |
| GET/PATCH/DELETE | `/room-types/:id` | fetch / update / delete a room type |
| GET/POST | `/room-types/:roomTypeId/bed-configs` | list / create bed configs |
| PATCH/DELETE | `/bed-configs/:id` | update / delete a bed config |
| GET/POST | `/meal-plans` | list / create meal plans |
| GET/PATCH/DELETE | `/meal-plans/:id` | fetch / update / delete a meal plan |
| GET/POST | `/rate-plans` | list / create rate plans |
| GET/PATCH/DELETE | `/rate-plans/:id` | fetch / update / delete a rate plan |
| GET/POST | `/rate-plans/:ratePlanId/room-types` | list / attach room-type joins |
| DELETE | `/rate-plan-room-types/:id` | detach a room-type join |
| GET | `/calendar` | rates & availability grid (`propertyId`, `from`, `to`) |
| PUT | `/calendar/rates` | bulk upsert `rate_plan_daily_rates` |
| PUT | `/calendar/inventory` | bulk upsert `room_type_daily_inventory` |

The two bulk calendar endpoints accept up to 200 operations, each spanning a
date range with an optional ISO-weekday mask (1 = Monday … 7 = Sunday), so a
whole season × weekday pattern is one request.

## Schema

None. Every table this module writes to is owned upstream by
`@voyant-travel/accommodations` and already in the framework migration bundle:
`room_types`, `room_type_bed_configs`, `meal_plans`, `rate_plans`,
`rate_plan_room_types`, `rate_plan_daily_rates`, `room_type_daily_inventory`.

## Key exports

- `default` — the `pms/ari` module factory.
- `expandDates`, `isoWeekday`, `MAX_RANGE_DAYS` — date-mask helpers for the bulk
  range/weekday expansion.
- `assembleCalendar`, `buildRateRows`, `buildInventoryRows` + the `Calendar*`
  types — the pure calendar-grid assembler (unit-testable without a db).
- All request/response validation schemas and inferred input types (re-exported
  from `./validation.js`) so the admin UI can share the parsed shapes.

## Testing

```bash
pnpm --filter @voyant-travel/pms-ari test
```

## License

Apache-2.0.
