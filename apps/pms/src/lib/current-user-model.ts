export type CurrentUser = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  locale: string
  timezone: string | null
  // biome-ignore lint/complexity/noBannedTypes: UI prefs are opaque JSON blobs passed through app/server boundaries. -- owner: operator; existing suppression is intentional pending typed cleanup.
  uiPrefs: Record<string, {}> | null
  isSuperAdmin: boolean
  isSupportUser: boolean
  createdAt: string
  profilePictureUrl?: string | null
}

export type AuthMode = "local" | "voyant-cloud"
export type BootstrapStatus = { hasUsers: boolean; authMode?: AuthMode }
