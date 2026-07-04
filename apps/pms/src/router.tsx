import {
  type AdminRouterContext,
  attachAdminExtensionRoutes,
  buildAdminExtensionRoutes,
  createAdminRouter,
} from "@voyant-travel/admin/app"

import {
  type AdminExtensionRoutesByFullPath,
  type AdminExtensionRoutesById,
  type AdminExtensionRoutesByTo,
  adminExtensionRoutes,
} from "./admin.routes.generated"
import { discoveredAdminExtensions } from "./lib/admin-extensions"
import { getApiUrl } from "./lib/env"
import { operatorFetcher } from "./lib/voyant-fetcher"
import { Route as workspaceRoute } from "./routes/_workspace/route"
import { type FileRouteTypes, routeTree } from "./routeTree.gen"

export type RouterContext = AdminRouterContext

/**
 * File-route types merged with the code-assembled extension routes
 * (packaged-admin RFC §4.8): package-delivered pages have no route files, so
 * their typed-link entries come from `admin.routes.generated.tsx` and are
 * stamped onto the tree via `_addFileTypes` — `Link`/`navigate` stay fully
 * typed for file routes AND extension routes alike.
 *
 * Extension routes REPLACE file routes on key conflicts (Omit before the
 * intersection), mirroring `attachAdminExtensionRoutes`' replace-by-path
 * graft semantics — e.g. the pathless workspace layout claims `/` in the
 * generated file types, but at runtime `/` is the core extension's
 * dashboard route.
 */
type MergeRouteTypeMaps<TFileMap, TExtensionMap> = Omit<TFileMap, keyof TExtensionMap> &
  TExtensionMap

export interface OperatorFileRouteTypes {
  fileRoutesByFullPath: MergeRouteTypeMaps<
    FileRouteTypes["fileRoutesByFullPath"],
    AdminExtensionRoutesByFullPath
  >
  fullPaths: FileRouteTypes["fullPaths"] | keyof AdminExtensionRoutesByFullPath
  fileRoutesByTo: MergeRouteTypeMaps<FileRouteTypes["fileRoutesByTo"], AdminExtensionRoutesByTo>
  to: FileRouteTypes["to"] | keyof AdminExtensionRoutesByTo
  fileRoutesById: MergeRouteTypeMaps<FileRouteTypes["fileRoutesById"], AdminExtensionRoutesById>
  id: FileRouteTypes["id"] | keyof AdminExtensionRoutesById
}

// Page routes contributed by deployment-local `src/admin/*` extensions — built
// at runtime (the generator never scanned them) and grafted alongside the
// generated routes. Reachable via plain string navigation only (no typed-link
// map entries). Empty until a deployment adds a custom admin page.
const discoveredAdminRoutes = buildAdminExtensionRoutes(
  discoveredAdminExtensions,
  () => workspaceRoute,
  () => ({ baseUrl: getApiUrl(), fetcher: operatorFetcher }),
)

const operatorRouteTree = attachAdminExtensionRoutes(routeTree, workspaceRoute, [
  ...adminExtensionRoutes,
  ...discoveredAdminRoutes,
])._addFileTypes<OperatorFileRouteTypes>()

export function getRouter() {
  return createAdminRouter({ routeTree: operatorRouteTree })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
