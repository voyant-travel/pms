/**
 * Charter admin/public route mounting for the operator starter.
 *
 * The `@voyant-travel/charters` package ships `chartersAdminRoutes` /
 * `chartersPublicRoutes` but does not mount them — a deployment opts in. The
 * operator is the only deployment that surfaces charters (it's operator-local,
 * not part of the framework standard set), so we mount it here (voyant#2191).
 *
 * Unlike cruises, charters does NOT need a `SourceAdapterRegistry` injected into
 * the Hono context: external charter providers resolve through the package's
 * process-global adapter registry (`resolveCharterAdapter` /
 * `listCharterAdapters` in `@voyant-travel/charters/adapters`), populated at app
 * startup via `registerCharterAdapter`. With no adapter registered the public
 * routes serve local charters and return `adapter_not_registered` (501) for
 * external keys — a clean degrade, never a crash. So the route bundles mount
 * directly, no wrapper middleware required.
 *
 * `chartersPublicRoutes` is an `OpenAPIHono` (its handlers are authored via
 * `createRoute(...).openapi(...)`), so the build-time `mergeLazyOpenApiPaths`
 * replay (voyant#2114/#2197) reads its `.openapi()` registry directly off the
 * lazy loader and the routes surface in the operator storefront spec.
 *
 * The package routes are mounted at `/v1/admin/charters` and
 * `/v1/public/charters` by the framework (module name → prefix).
 */

import { chartersPublicRoutes } from "@voyant-travel/charters/public-routes"
import { chartersAdminRoutes } from "@voyant-travel/charters/routes"

export function createCharterAdminRoutes() {
  return chartersAdminRoutes
}

export function createCharterPublicRoutes() {
  return chartersPublicRoutes
}
