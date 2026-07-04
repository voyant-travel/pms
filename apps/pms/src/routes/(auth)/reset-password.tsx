import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { ResetPasswordPage, type ResetPasswordPageMessages } from "@voyant-travel/auth-react/ui"
import { z } from "zod"
import { useAdminMessages } from "@/lib/admin-i18n"
import { cloudAuthStartHref, getBootstrapStatus, getCurrentUser } from "@/lib/current-user"

export const Route = createFileRoute("/(auth)/reset-password")({
  loader: async ({ location }) => {
    const [user, bootstrap] = await Promise.all([getCurrentUser(), getBootstrapStatus()])

    if (user) {
      throw redirect({ to: "/" })
    }

    if (bootstrap.authMode === "voyant-cloud") {
      throw redirect({ href: cloudAuthStartHref(location.href) })
    }

    return null
  },
  validateSearch: z.object({
    token: z.string().optional(),
  }),
  component: ResetPasswordRoute,
})

function ResetPasswordRoute() {
  const navigate = useNavigate()
  const { token } = Route.useSearch()
  const adminMessages = useAdminMessages().auth.resetPassword

  const messages: Partial<ResetPasswordPageMessages> = {
    title: adminMessages.title,
    description: adminMessages.description,
    newPasswordLabel: adminMessages.newPasswordLabel,
    confirmPasswordLabel: adminMessages.confirmPasswordLabel,
    submit: adminMessages.submit,
    submitting: adminMessages.submit,
    tokenRequired: adminMessages.missingResetToken,
    passwordsDoNotMatch: adminMessages.passwordsDoNotMatch,
    somethingWentWrong: adminMessages.somethingWentWrong,
    signIn: adminMessages.backToSignIn,
  }

  return (
    <ResetPasswordPage
      token={token}
      messages={messages}
      signInHref="/sign-in"
      onPasswordReset={() => {
        void navigate({ to: "/sign-in", search: { reset: "success" } })
      }}
      onNavigateToSignIn={() => {
        void navigate({ to: "/sign-in" })
      }}
    />
  )
}
