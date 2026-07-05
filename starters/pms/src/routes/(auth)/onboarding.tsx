import { createFileRoute, redirect } from "@tanstack/react-router"
import { getCurrentUser } from "@/lib/current-user"

export const Route = createFileRoute("/(auth)/onboarding")({
  loader: async ({ location }) => {
    const user = await getCurrentUser()

    if (!user) {
      throw redirect({
        to: "/sign-in",
        search: { next: location.href },
      })
    }

    throw redirect({ to: "/" })
  },
  component: LegacyOnboardingRedirect,
})

function LegacyOnboardingRedirect() {
  return null
}
