/**
 * Deployment-local admin extension for the Channels surface (PLAN §4.7, Phase 6).
 * Auto-discovered by `adminExtensionsFromGlob` (see `src/lib/admin-extensions.tsx`):
 * its nav group + page route compose into the admin shell without a framework edit.
 *
 * The page is the UI half of the `pms/channels` module (`src/modules/channels`),
 * which serves the ARI-push + inbound-reservation ledgers at
 * `/v1/admin/pms/channels/*`. Ordered after Folios (45) at 50, the last PMS group.
 */

import { adminRoutePageModule, defineAdminExtension } from "@voyant-travel/admin"
import { Radio } from "lucide-react"

import { channelsMessages } from "@/components/channels/channels-messages"

const ROUTES = {
  ledger: "/channels/ledger",
} as const

export default defineAdminExtension({
  id: "channels",
  navigation: [
    {
      order: 50,
      items: [
        {
          id: "channels",
          title: channelsMessages.section,
          url: ROUTES.ledger,
          icon: Radio,
          items: [
            {
              id: "channels-ledger",
              title: channelsMessages.nav.ledger,
              url: ROUTES.ledger,
              icon: Radio,
            },
          ],
        },
      ],
    },
  ],
  routes: [
    {
      id: "channels-ledger",
      path: ROUTES.ledger,
      title: channelsMessages.nav.ledger,
      page: () =>
        import("@/components/channels/channels-page").then((m) =>
          adminRoutePageModule(m.ChannelsLedgerPage),
        ),
    },
  ],
})
