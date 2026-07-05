import type { QueryClient } from "@tanstack/react-query"
import {
  type AdminChildProvider,
  OperatorAdminShellProvider,
} from "@voyant-travel/admin/providers/operator-admin-shell"
// Provider subpath on purpose: the availability main barrel re-exports the
// whole data layer (schemas pull `@voyant-travel/operations` validation), and
// this module evaluates with workspace chrome — the `/provider` entry is
// the lean context-only module.
import { VoyantAvailabilityProvider } from "@voyant-travel/operations-react/availability/provider"
import { TooltipProvider } from "@voyant-travel/ui/components/tooltip"
import type * as React from "react"
import { getApiUrl } from "@/lib/env"
import { operatorFetcher } from "@/lib/voyant-fetcher"
import { RealtimeLiveProvider } from "./realtime-live"

// VoyantAvailabilityProvider needs a baseUrl prop — wrap it once so it
// fits the child-only AdminChildProvider shape used by the admin shell.
const AvailabilityProvider: AdminChildProvider = ({ children }) => (
  <VoyantAvailabilityProvider baseUrl={getApiUrl()} fetcher={operatorFetcher}>
    {children}
  </VoyantAvailabilityProvider>
)

const appProviders = [
  TooltipProvider,
  AvailabilityProvider,
  RealtimeLiveProvider,
] satisfies readonly AdminChildProvider[]

export function Providers({
  children,
  queryClient,
}: {
  children: React.ReactNode
  queryClient: QueryClient
}) {
  return (
    <OperatorAdminShellProvider
      baseUrl={getApiUrl()}
      fetcher={operatorFetcher}
      queryClient={queryClient}
      providers={appProviders}
    >
      {children}
    </OperatorAdminShellProvider>
  )
}
