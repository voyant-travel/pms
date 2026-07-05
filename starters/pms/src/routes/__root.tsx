import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet, useRouteContext } from "@tanstack/react-router"
import {
  AdminRootErrorBoundary,
  AdminRootShell,
  adminRootHead,
} from "@voyant-travel/admin/app/root"
import { Toaster } from "@voyant-travel/ui/components"

import { Providers } from "../components/providers"
import "../styles.css"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () =>
    adminRootHead({
      title: "Voyant",
      description: "Voyant operator workspace",
      faviconHref: "/favicon.png",
    }),
  // shellComponent is always SSR'd — renders the <html> document shell
  shellComponent: AdminRootShell,
  component: RootComponent,
  errorComponent: AdminRootErrorBoundary,
})

function RootComponent() {
  const queryClient = useRouteContext({
    from: "__root__",
    select: (context) => context.queryClient,
  })

  return (
    <Providers queryClient={queryClient}>
      <Outlet />
      <Toaster />
    </Providers>
  )
}
