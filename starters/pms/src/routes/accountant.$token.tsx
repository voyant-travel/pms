import { createFileRoute } from "@tanstack/react-router"
import { AccountantPortal } from "@voyant-travel/finance-react/ui"

import { getApiUrl } from "@/lib/env"

/**
 * Public accountant portal. The customer's accountant arrives via a revocable
 * share link (`/accountant/:token`) minted from the Profitability page. No auth
 * — the token is the bearer credential, validated server-side per request.
 * Lives at the root (sibling of `_workspace`) so it skips the admin shell.
 */
export const Route = createFileRoute("/accountant/$token")({
  component: AccountantPortalRoute,
})

function AccountantPortalRoute() {
  const { token } = Route.useParams()
  return (
    <div className="min-h-screen bg-background">
      <AccountantPortal token={token} apiBaseUrl={getApiUrl()} />
    </div>
  )
}
