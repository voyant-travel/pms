/**
 * Deployment-local admin extension for the Front Desk surface. Auto-discovered
 * by `adminExtensionsFromGlob` (see `src/lib/admin-extensions.tsx`): its nav
 * group and page routes compose into the admin shell without a framework edit,
 * upgrade-safe, and the page routes are grafted into the TanStack route tree at
 * runtime by `src/router.tsx`.
 *
 * The pages are the UI half of the `pms/front-desk` and `pms/units` modules
 * (`src/modules/front-desk`, `src/modules/units`), which serve the tape-chart /
 * boards / units + assignments APIs at `/v1/admin/pms/front-desk/*` and
 * `/v1/admin/pms/units/*`. Pages are lazy so they land in their own chunk.
 */

import { adminRoutePageModule, defineAdminExtension } from "@voyant-travel/admin"
import { CalendarClock, DoorOpen, LayoutGrid, ListChecks } from "lucide-react"

import { frontDeskMessages } from "@/components/front-desk/front-desk-messages"

const ROUTES = {
  tapeChart: "/front-desk/tape-chart",
  boards: "/front-desk/boards",
  units: "/front-desk/units",
} as const

export default defineAdminExtension({
  id: "front-desk",
  navigation: [
    {
      order: 30,
      items: [
        {
          id: "front-desk",
          title: frontDeskMessages.section,
          url: ROUTES.tapeChart,
          icon: LayoutGrid,
          items: [
            {
              id: "front-desk-tape-chart",
              title: frontDeskMessages.nav.tapeChart,
              url: ROUTES.tapeChart,
              icon: CalendarClock,
            },
            {
              id: "front-desk-boards",
              title: frontDeskMessages.nav.boards,
              url: ROUTES.boards,
              icon: DoorOpen,
            },
            {
              id: "front-desk-units",
              title: frontDeskMessages.nav.units,
              url: ROUTES.units,
              icon: ListChecks,
            },
          ],
        },
      ],
    },
  ],
  routes: [
    {
      id: "front-desk-tape-chart",
      path: ROUTES.tapeChart,
      title: frontDeskMessages.nav.tapeChart,
      page: () =>
        import("@/components/front-desk/tape-chart-page").then((m) =>
          adminRoutePageModule(m.TapeChartPage),
        ),
    },
    {
      id: "front-desk-boards",
      path: ROUTES.boards,
      title: frontDeskMessages.nav.boards,
      page: () =>
        import("@/components/front-desk/boards-page").then((m) =>
          adminRoutePageModule(m.BoardsPage),
        ),
    },
    {
      id: "front-desk-units",
      path: ROUTES.units,
      title: frontDeskMessages.nav.units,
      page: () =>
        import("@/components/front-desk/units-page").then((m) => adminRoutePageModule(m.UnitsPage)),
    },
  ],
})
