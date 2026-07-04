/**
 * Deployment-local admin extension for the Folios surface. Auto-discovered by
 * `adminExtensionsFromGlob` (see `src/lib/admin-extensions.tsx`): its nav group
 * and page routes compose into the admin shell without a framework edit,
 * upgrade-safe, and the page routes are grafted into the TanStack route tree at
 * runtime by `src/router.tsx`.
 *
 * The pages are the UI half of the `pms/folios` module (`src/modules/folios`),
 * which serves the guest-ledger / night-audit / daily-report APIs at
 * `/v1/admin/pms/folios/*`. Pages are lazy so they land in their own chunk instead
 * of the workspace-chrome bundle.
 */

import { adminRoutePageModule, defineAdminExtension } from "@voyant-travel/admin"
import { BookOpen, MoonStar, ReceiptText, TrendingUp } from "lucide-react"

import { foliosMessages } from "@/components/folios/folios-messages"

const ROUTES = {
  folios: "/folios/folios",
  nightAudit: "/folios/night-audit",
  reports: "/folios/reports",
} as const

export default defineAdminExtension({
  id: "folios",
  navigation: [
    {
      order: 45,
      items: [
        {
          id: "folios",
          title: foliosMessages.section,
          url: ROUTES.folios,
          icon: ReceiptText,
          items: [
            {
              id: "folios-list",
              title: foliosMessages.nav.folios,
              url: ROUTES.folios,
              icon: BookOpen,
            },
            {
              id: "folios-night-audit",
              title: foliosMessages.nav.nightAudit,
              url: ROUTES.nightAudit,
              icon: MoonStar,
            },
            {
              id: "folios-reports",
              title: foliosMessages.nav.reports,
              url: ROUTES.reports,
              icon: TrendingUp,
            },
          ],
        },
      ],
    },
  ],
  routes: [
    {
      id: "folios-list",
      path: ROUTES.folios,
      title: foliosMessages.nav.folios,
      page: () =>
        import("@/components/folios/folios-page").then((m) => adminRoutePageModule(m.FoliosPage)),
    },
    {
      id: "folios-night-audit",
      path: ROUTES.nightAudit,
      title: foliosMessages.nav.nightAudit,
      page: () =>
        import("@/components/folios/night-audit-page").then((m) =>
          adminRoutePageModule(m.NightAuditPage),
        ),
    },
    {
      id: "folios-reports",
      path: ROUTES.reports,
      title: foliosMessages.nav.reports,
      page: () =>
        import("@/components/folios/reports-page").then((m) => adminRoutePageModule(m.ReportsPage)),
    },
  ],
})
