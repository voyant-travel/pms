import { createFileRoute, Outlet } from "@tanstack/react-router"

import { SiteFooter } from "@/components/storefront/site/site-footer"
import { SiteHeader } from "@/components/storefront/site/site-header"
import { StorefrontMessagesProvider } from "@/lib/storefront-i18n"

/**
 * `(storefront)` — the customer-facing Acme Hotels website inside the
 * operator starter. No auth gate; no workspace chrome. The `.acme-site`
 * root scopes the hotel-group brand tokens (warm paper, brass accent,
 * serif display) declared in `styles.css` so they never leak into the
 * operator admin shell.
 *
 * A production deployment would lift this group + the storefront
 * components into a separate starter; the seam is intentionally small
 * so the move is mechanical.
 */
export const Route = createFileRoute("/(storefront)")({
  component: StorefrontLayout,
})

function StorefrontLayout(): React.ReactElement {
  return (
    <StorefrontMessagesProvider>
      <div className="acme-site flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1">
          <Outlet />
        </main>
        <SiteFooter />
      </div>
    </StorefrontMessagesProvider>
  )
}
