import { useQuery } from "@tanstack/react-query"
import { createContext, type ReactNode, useContext } from "react"

import { type CurrentUser, getCurrentUserQueryOptions } from "@/lib/current-user"

type UserContextValue = {
  user: CurrentUser | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<unknown>
}

const UserContext = createContext<UserContextValue | undefined>(undefined)

export function UserProvider({
  children,
  initialUser,
}: {
  children: ReactNode
  initialUser?: CurrentUser | null
}) {
  const {
    data: user,
    isPending,
    isFetching,
    error,
    refetch,
  } = useQuery(getCurrentUserQueryOptions(initialUser))

  const isLoading = isPending || (isFetching && user === undefined)

  return (
    <UserContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error: error ? error : null,
        refetch,
      }}
    >
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error("useUser must be used within UserProvider")
  }
  return context
}
