import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { AcceptInvitationPage } from "@voyant-travel/auth-react/ui"
import { z } from "zod"
import { cloudAuthStartHref, getBootstrapStatus, getCurrentUser } from "@/lib/current-user"

export const Route = createFileRoute("/(auth)/accept-invitation")({
  validateSearch: z.object({
    id: z.string(),
  }),
  loader: async ({ location }) => {
    const [user, bootstrap] = await Promise.all([getCurrentUser(), getBootstrapStatus()])

    if (bootstrap.authMode === "voyant-cloud") {
      throw redirect({ href: cloudAuthStartHref(location.href) })
    }

    if (!user) {
      throw redirect({
        to: "/sign-in",
        search: { next: location.href },
      })
    }

    return { user }
  },
  component: AcceptInvitationRoute,
})

function AcceptInvitationRoute() {
  const navigate = useNavigate()
  const { id } = Route.useSearch()

  return (
    <AcceptInvitationPage
      token={id}
      isAuthenticated
      continueHref="/"
      onContinue={() => {
        void navigate({ to: "/" })
      }}
    />
  )
}
