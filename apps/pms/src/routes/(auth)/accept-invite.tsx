import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { formatMessage } from "@voyant-travel/admin/lib/i18n"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@voyant-travel/ui/components"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { z } from "zod"
import { useAdminMessages } from "@/lib/admin-i18n"
import { api } from "@/lib/api-client"
import { authClient } from "@/lib/auth"

type InviteStatus =
  | { valid: true; email: string; expiresAt: string }
  | { valid: false; reason?: "not_found" | "redeemed" | "expired" }

export const Route = createFileRoute("/(auth)/accept-invite")({
  validateSearch: z.object({
    token: z.string().min(1),
  }),
  component: AcceptInvitePage,
})

function AcceptInvitePage() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const messages = useAdminMessages().auth.acceptInvite

  const inviteQuery = useQuery<InviteStatus>({
    queryKey: ["invitation", token],
    queryFn: async () => {
      try {
        return await api.get<InviteStatus>(`/v1/public/invitations/${encodeURIComponent(token)}`)
      } catch (error) {
        if (
          error instanceof Error &&
          "status" in error &&
          (error.status === 404 || error.status === 410)
        ) {
          return { valid: false } satisfies InviteStatus
        }
        throw error
      }
    },
    retry: false,
  })

  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  const redeem = useMutation({
    mutationFn: async () => {
      await api.post(`/v1/public/invitations/${encodeURIComponent(token)}/redeem`, {
        name,
        password,
      })
      // Account exists now — open a session via Better Auth.
      const result = await authClient.signIn.email({
        email: (inviteQuery.data as Extract<InviteStatus, { valid: true }>).email,
        password,
      })
      if (result.error) {
        throw new Error(result.error.message ?? messages.signInAfterRedeemFailed)
      }
    },
    onSuccess: () => void navigate({ to: "/" }),
    onError: (e) => setError(e instanceof Error ? e.message : messages.couldNotAcceptInvitation),
  })

  useEffect(() => {
    setError(null)
  }, [])

  if (inviteQuery.isPending) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (!inviteQuery.data?.valid) {
    const reason = inviteQuery.data && "reason" in inviteQuery.data ? inviteQuery.data.reason : null
    const message =
      reason === "redeemed"
        ? messages.invitationAlreadyUsed
        : reason === "expired"
          ? messages.invitationExpired
          : messages.invitationInvalid
    return (
      <Card>
        <CardHeader>
          <CardTitle>{messages.invitationUnavailableTitle}</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.title}</CardTitle>
        <CardDescription>
          {formatMessage(messages.description, { email: inviteQuery.data.email })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            redeem.mutate()
          }}
        >
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">{messages.fullNameLabel}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{messages.passwordLabel}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={redeem.isPending}>
            {redeem.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {messages.submit}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
