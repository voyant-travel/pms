import { useRouter, useRouterState } from "@tanstack/react-router"
import {
  AdminRouterLink,
  AdminWorkspacePendingFallback,
  type AdminWorkspaceShellProps,
  type AdminWorkspaceShellUser,
  defaultAdminWorkspaceUser,
} from "@voyant-travel/admin/app/workspace"
import { AdminWidgetSlotRenderer } from "@voyant-travel/admin/components/admin-widget-slot"
import { OperatorAdminBootstrapGate } from "@voyant-travel/admin/components/operator-admin-bootstrap-gate"
import { OperatorAdminWorkspaceLayout } from "@voyant-travel/admin/components/operator-admin-sidebar"
import {
  type AdminExtension,
  adminWorkspaceHeaderActionsSlot,
  resolveAdminWidgets,
} from "@voyant-travel/admin/extensions"
import { AdminNavigationProvider } from "@voyant-travel/admin/navigation/destinations"
import {
  createOperatorAdminNavigation,
  type OperatorAdminNavigationIcons,
} from "@voyant-travel/admin/navigation/operator-navigation"
import { AdminLocalePreferenceSync } from "@voyant-travel/admin/providers/locale-preferences"
import {
  getOperatorAdminMessageOverridesFromUiPrefs,
  type OperatorAdminMessages,
  OperatorAdminMessagesProvider,
  useOperatorAdminMessages,
} from "@voyant-travel/admin/providers/operator-admin-messages"
import { Fragment, useCallback, useMemo } from "react"

/**
 * Base operator nav groups the PMS deployment hides (tour-operator surfaces
 * that don't belong in a hotel PMS): the `catalog` group (tour catalog
 * authoring — the PMS authoring surface is ARI), `products` (generic product
 * authoring), and `flights` (the flights module is excluded API-side, so its
 * base-nav group is dead residue). Their admin routes + extension
 * registrations are pruned separately; this filter removes the leftover nav
 * entries the framework's base navigation still emits.
 *
 * The base nav is package-owned (`createOperatorAdminNavigation` in
 * `@voyant-travel/admin`) and the packaged `AdminWorkspaceShell` offers no
 * nav-override seam, so the deployment reproduces the shell composition here
 * and injects a curated `navItems`. Keep this in sync with the packaged shell
 * on `@voyant-travel/admin` upgrades. (Upstream follow-up: give
 * `AdminWorkspaceShell` a `navItems`/`hiddenNavIds` prop.)
 */
const HIDDEN_BASE_NAV_IDS = new Set(["catalog", "flights", "products"])

function usePmsBaseNavItems(
  icons: OperatorAdminNavigationIcons | undefined,
  messages: OperatorAdminMessages,
) {
  return useMemo(
    () =>
      createOperatorAdminNavigation({ icons, messages: messages.nav }).filter(
        (item) => !item.id || !HIDDEN_BASE_NAV_IDS.has(item.id),
      ),
    [icons, messages],
  )
}

/**
 * PMS-owned workspace shell. A faithful reproduction of the packaged
 * `AdminWorkspaceShell` (bootstrap gate → per-user message overrides → locale
 * sync → workspace layout with router-aware links) whose only deviation is a
 * curated base navigation that hides the tour-operator groups.
 */
export function OperatorWorkspaceShell<TUser extends AdminWorkspaceShellUser>({
  user,
  isUserLoading,
  extensions,
  icons,
  linkComponent = AdminRouterLink,
  destinations,
  headerSlot,
  headerSlotRight,
  onSignOut,
  mapUser = defaultAdminWorkspaceUser,
  children,
}: AdminWorkspaceShellProps<TUser>) {
  const messages = useOperatorAdminMessages()

  return (
    <OperatorAdminBootstrapGate
      user={user}
      isUserLoading={isUserLoading}
      loadingFallback={<AdminWorkspacePendingFallback label={messages.loading} />}
    >
      {({ user: loadedUser }) => (
        <OperatorAdminMessagesProvider
          overrides={getOperatorAdminMessageOverridesFromUiPrefs(loadedUser.uiPrefs)}
        >
          <AdminLocalePreferenceSync source={loadedUser} />
          <OperatorWorkspaceShellInner
            user={loadedUser}
            extensions={extensions}
            icons={icons}
            linkComponent={linkComponent}
            destinations={destinations}
            headerSlot={headerSlot}
            headerSlotRight={headerSlotRight}
            onSignOut={onSignOut}
            mapUser={mapUser}
          >
            {children}
          </OperatorWorkspaceShellInner>
        </OperatorAdminMessagesProvider>
      )}
    </OperatorAdminBootstrapGate>
  )
}

type OperatorWorkspaceShellInnerProps<TUser extends AdminWorkspaceShellUser> = {
  user: TUser
  extensions: AdminWorkspaceShellProps<TUser>["extensions"]
  icons: OperatorAdminNavigationIcons | undefined
  linkComponent: NonNullable<AdminWorkspaceShellProps<TUser>["linkComponent"]>
  destinations: AdminWorkspaceShellProps<TUser>["destinations"]
  headerSlot: AdminWorkspaceShellProps<TUser>["headerSlot"]
  headerSlotRight: AdminWorkspaceShellProps<TUser>["headerSlotRight"]
  onSignOut: AdminWorkspaceShellProps<TUser>["onSignOut"]
  mapUser: NonNullable<AdminWorkspaceShellProps<TUser>["mapUser"]>
  children: AdminWorkspaceShellProps<TUser>["children"]
}

function OperatorWorkspaceShellInner<TUser extends AdminWorkspaceShellUser>({
  user,
  extensions,
  icons,
  linkComponent,
  destinations,
  headerSlot,
  headerSlotRight,
  onSignOut,
  mapUser,
  children,
}: OperatorWorkspaceShellInnerProps<TUser>) {
  const router = useRouter()
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const messages = useOperatorAdminMessages()
  const resolvedExtensions = useMemo<ReadonlyArray<AdminExtension> | undefined>(
    () => (typeof extensions === "function" ? extensions(messages) : extensions),
    [extensions, messages],
  )
  const navItems = usePmsBaseNavItems(icons, messages)
  const hasHeaderActionWidgets = useMemo(
    () =>
      resolveAdminWidgets({
        slot: adminWorkspaceHeaderActionsSlot,
        extensions: resolvedExtensions,
      }).length > 0,
    [resolvedExtensions],
  )
  const hasHeaderSlotRight = headerSlotRight != null
  const navigateToHref = useCallback(
    (href: string, options?: { replace?: boolean }) => {
      void router.navigate({ href, replace: options?.replace })
    },
    [router],
  )

  const layout = (
    <OperatorAdminWorkspaceLayout
      currentPath={currentPath}
      extensions={resolvedExtensions}
      navItems={navItems}
      headerSlot={headerSlot}
      headerSlotRight={
        hasHeaderSlotRight || hasHeaderActionWidgets ? (
          <Fragment>
            {headerSlotRight}
            {hasHeaderActionWidgets ? (
              <AdminWidgetSlotRenderer
                extensions={resolvedExtensions}
                slot={adminWorkspaceHeaderActionsSlot}
              />
            ) : null}
          </Fragment>
        ) : undefined
      }
      icons={icons}
      linkComponent={linkComponent}
      onSignOut={onSignOut}
      user={mapUser(user)}
    >
      {children}
    </OperatorAdminWorkspaceLayout>
  )

  if (!destinations) {
    return layout
  }

  return (
    <AdminNavigationProvider resolvers={destinations} navigate={navigateToHref}>
      {layout}
    </AdminNavigationProvider>
  )
}
