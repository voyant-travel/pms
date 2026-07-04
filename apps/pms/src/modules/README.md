# Custom deployment modules

Drop a custom module here to extend this deployment **without forking the
framework**. A module in `src/modules/<name>/` is auto-discovered and mounted —
no edit to any framework-owned file, and it survives `voyant upgrade`.

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
