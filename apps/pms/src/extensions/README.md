# Custom deployment extensions

Drop a `HonoExtension` here to add **custom routes to an existing module's
surface** without forking — e.g. a `/v1/admin/bookings/notes` endpoint on the
standard `bookings` module. A directory under `src/extensions/<name>/` is
auto-discovered and mounted; it survives `voyant upgrade`.

An extension differs from a [custom module](../modules/README.md): a module is a
*new* domain (its own `/v1/.../{name}` surface), while an extension *attaches to
an existing module* (`extension.module`) and mounts under that module's path.

## index.ts — mounting

Default-export via `defineDeploymentExtension` (a ready `HonoExtension` or a
factory receiving the deployment's capabilities):

```ts
import { defineDeploymentExtension } from "@voyant-travel/framework"
import { bookingNotesRoutes } from "./routes.js"

export default defineDeploymentExtension({
  extension: { name: "booking-notes", module: "bookings" },
  adminRoutes: bookingNotesRoutes, // → /v1/admin/bookings/*
  // publicRoutes / lazyAdminRoutes / lazyPublicRoutes also supported
})
```

`extension.module` is the **target** module the routes attach to;
`extension.name` is this extension's own identifier. The directory name is the
composition key.

## schema.ts — migrations (optional)

If the extension owns tables, define them in `src/extensions/<name>/schema.ts` —
they are picked up by the deployment drizzle config and migrated as a deployment
source (after the framework bundle), exactly like custom-module schema:

```sh
pnpm db:generate:deployment   # emit into migrations/
pnpm db:migrate               # collector applies it
```

Reference framework tables with plain `text()` id columns + `defineLink`, not
hard cross-module FKs.

See `docs/architecture/custom-modules.md` for the full guide.
