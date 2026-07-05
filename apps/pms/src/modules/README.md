# Custom deployment modules (prototype stage)

Drop a custom module here to extend this deployment **without forking the
framework**. A module in `src/modules/<name>/` is auto-discovered and mounted —
no edit to any framework-owned file, and it survives `voyant upgrade`.

## Prototype here, graduate to `packages/*`

This directory is the **prototype** stage of a PMS domain's lifecycle. Once a
module's schema and routes settle, graduate it into a published workspace
package under `packages/<name>/` (`@voyant-travel/pms-<name>`) and register it
explicitly in `src/api/composition.ts`. The six original PMS domains (ari,
units, front-desk, housekeeping, folios, channels) have already graduated — this
directory is intentionally empty of modules now. See `packages/README.md` for
the graduated packages and the app/package boundary (e.g. how `pms-channels`
takes the app-side `persistStayBooking` write path via injection).

## Shape

```
src/modules/loyalty/
  index.ts     # default-exports the module (mounted automatically)
  schema.ts    # optional: Drizzle tables (migrated automatically)
  routes.ts    # your Hono routes
  service.ts   # your business logic
```

`voyant generate module loyalty --dir src/modules` scaffolds this for you.

## index.ts — mounting

Default-export the module via `defineDeploymentModule` (accepts a ready
`HonoModule` or a factory):

```ts
import { defineDeploymentModule } from "@voyant-travel/framework"
import { loyaltyRoutes } from "./routes.js"

export default defineDeploymentModule({
  module: { name: "loyalty" },
  adminRoutes: loyaltyRoutes, // → /v1/admin/loyalty/*
  // publicRoutes / lazyAdminRoutes / lazyPublicRoutes also supported
})
```

The directory name (`loyalty`) becomes the module's composition key. It mounts
through the same path as every standard module — `src/api/composition.ts` discovers
it with `import.meta.glob` (compiled to static imports at build time, so it works
on Cloudflare Workers).

## schema.ts — migrations

Define Drizzle tables as usual. They are a **deployment** migration source
(applied by the D.1 collector *after* the framework bundle), so a custom module
table can carry plain text id columns that reference framework tables — pair them
with `defineLink` in `src/links` rather than hard cross-module FKs.

Generate the migration into the deployment source (`migrations/`):

```sh
pnpm db:generate:deployment   # drizzle-kit generate for the deployment config
pnpm db:migrate               # collector applies bundle → deployment (incl. this)
```

See `docs/architecture/custom-modules.md` for the full guide.
