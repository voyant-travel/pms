/**
 * Deployment-local admin extension for the ARI (availability, rates &
 * inventory) authoring surface. Auto-discovered by `adminExtensionsFromGlob`
 * (see `src/lib/admin-extensions.tsx`): its nav group and page routes compose
 * into the admin shell without a framework edit, and the page routes are
 * grafted into the TanStack route tree at runtime by `src/router.tsx`.
 *
 * The pages are the UI half of the `pms/ari` module (`src/modules/ari`), which
 * serves the CRUD + calendar APIs at `/v1/admin/pms/ari/*`. Pages are lazy so
 * they land in their own chunk instead of the workspace-chrome bundle.
 */

import { adminRoutePageModule, defineAdminExtension } from "@voyant-travel/admin"
import { BedDouble, CalendarRange, LayoutGrid, Tags, UtensilsCrossed } from "lucide-react"

import { ariMessages } from "@/components/ari/ari-messages"

const ROUTES = {
  roomTypes: "/ari/room-types",
  mealPlans: "/ari/meal-plans",
  ratePlans: "/ari/rate-plans",
  calendar: "/ari/calendar",
} as const

export default defineAdminExtension({
  id: "ari",
  navigation: [
    {
      order: 40,
      items: [
        {
          id: "ari",
          title: ariMessages.section,
          url: ROUTES.roomTypes,
          icon: LayoutGrid,
          items: [
            {
              id: "ari-room-types",
              title: ariMessages.nav.roomTypes,
              url: ROUTES.roomTypes,
              icon: BedDouble,
            },
            {
              id: "ari-meal-plans",
              title: ariMessages.nav.mealPlans,
              url: ROUTES.mealPlans,
              icon: UtensilsCrossed,
            },
            {
              id: "ari-rate-plans",
              title: ariMessages.nav.ratePlans,
              url: ROUTES.ratePlans,
              icon: Tags,
            },
            {
              id: "ari-calendar",
              title: ariMessages.nav.calendar,
              url: ROUTES.calendar,
              icon: CalendarRange,
            },
          ],
        },
      ],
    },
  ],
  routes: [
    {
      id: "ari-room-types",
      path: ROUTES.roomTypes,
      title: ariMessages.nav.roomTypes,
      page: () =>
        import("@/components/ari/room-types-page").then((m) =>
          adminRoutePageModule(m.RoomTypesPage),
        ),
    },
    {
      id: "ari-meal-plans",
      path: ROUTES.mealPlans,
      title: ariMessages.nav.mealPlans,
      page: () =>
        import("@/components/ari/meal-plans-page").then((m) =>
          adminRoutePageModule(m.MealPlansPage),
        ),
    },
    {
      id: "ari-rate-plans",
      path: ROUTES.ratePlans,
      title: ariMessages.nav.ratePlans,
      page: () =>
        import("@/components/ari/rate-plans-page").then((m) =>
          adminRoutePageModule(m.RatePlansPage),
        ),
    },
    {
      id: "ari-calendar",
      path: ROUTES.calendar,
      title: ariMessages.nav.calendar,
      page: () =>
        import("@/components/ari/calendar-page").then((m) => adminRoutePageModule(m.CalendarPage)),
    },
  ],
})
