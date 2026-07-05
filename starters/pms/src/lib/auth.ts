"use client"

import { apiKeyClient } from "@better-auth/api-key/client"
import { useNavigate } from "@tanstack/react-router"
import { emailOTPClient, organizationClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import { useCallback } from "react"

import { getApiUrl } from "./env"

export const authClient = createAuthClient({
  baseURL: `${getApiUrl()}/auth`,
  plugins: [apiKeyClient(), organizationClient(), emailOTPClient()],
  fetchOptions: {
    credentials: "include",
  },
})

export function useSignOut() {
  const navigate = useNavigate()

  return useCallback(
    async (options?: { redirectTo?: string }) => {
      await authClient.signOut()

      void navigate({
        to: options?.redirectTo ?? "/sign-in",
      })
    },
    [navigate],
  )
}
