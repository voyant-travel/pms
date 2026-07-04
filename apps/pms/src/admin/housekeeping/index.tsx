/**
 * Deployment-local admin extension for the Housekeeping surface. Auto-discovered
 * by `adminExtensionsFromGlob` (see `src/lib/admin-extensions.tsx`): its nav group
 * and page routes compose into the admin shell without a framework edit,
 * upgrade-safe, and the page routes are grafted into the TanStack route tree at
 * runtime by `src/router.tsx`.
 *
 * The pages are the UI half of the `pms/housekeeping` module
 * (`src/modules/housekeeping`), which serves the tasks / room-status / generation /
 * maintenance-block APIs at `/v1/admin/pms/housekeeping/*`. Pages are lazy so they
 * land in their own chunk instead of the workspace-chrome bundle.
 */

import { adminRoutePageModule, defineAdminExtension } from "@voyant-travel/admin"
import { LayoutGrid, SprayCan, Wrench } from "lucide-react"

import { housekeepingMessages } from "@/components/housekeeping/housekeeping-messages"

const ROUTES = {
  board: "/housekeeping/board",
  maintenance: "/housekeeping/maintenance",
} as const

export default defineAdminExtension({
  id: "housekeeping",
  navigation: [
    {
      order: 35,
      items: [
        {
          id: "housekeeping",
          title: housekeepingMessages.section,
          url: ROUTES.board,
          icon: SprayCan,
          items: [
            {
              id: "housekeeping-board",
              title: housekeepingMessages.nav.board,
              url: ROUTES.board,
              icon: LayoutGrid,
            },
            {
              id: "housekeeping-maintenance",
              title: housekeepingMessages.nav.maintenance,
              url: ROUTES.maintenance,
              icon: Wrench,
            },
          ],
        },
      ],
    },
  ],
  routes: [
    {
      id: "housekeeping-board",
      path: ROUTES.board,
      title: housekeepingMessages.nav.board,
      page: () =>
        import("@/components/housekeeping/board-page").then((m) =>
          adminRoutePageModule(m.HousekeepingBoardPage),
        ),
    },
    {
      id: "housekeeping-maintenance",
      path: ROUTES.maintenance,
      title: housekeepingMessages.nav.maintenance,
      page: () =>
        import("@/components/housekeeping/maintenance-page").then((m) =>
          adminRoutePageModule(m.MaintenancePage),
        ),
    },
  ],
})
