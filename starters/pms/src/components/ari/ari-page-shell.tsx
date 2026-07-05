"use client"

/**
 * Common chrome for the ARI pages: a titled header with the shared property
 * selector and an optional primary action, then the page body. Centralizes the
 * "no property selected / no properties exist" states so each page renders its
 * table against a guaranteed `propertyId`.
 */

import type { ReactNode } from "react"

import { ariMessages } from "./ari-messages"
import { PropertySelector, usePropertyOptions, useSelectedProperty } from "./property-selector"

export function AriPageShell({
  title,
  actions,
  children,
}: {
  title: string
  /** Rendered on the right of the header (e.g. a "New…" button). Receives the property id. */
  actions?: (propertyId: string) => ReactNode
  /** Rendered once a property is selected. */
  children: (propertyId: string) => ReactNode
}) {
  const [propertyId, setPropertyId] = useSelectedProperty()
  const { data: options, isLoading } = usePropertyOptions()
  const activeId = propertyId && options?.some((o) => o.id === propertyId) ? propertyId : ""

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="flex items-center gap-3">
          <PropertySelector
            value={propertyId}
            onChange={setPropertyId}
            options={options}
            isLoading={isLoading}
          />
          {activeId && actions ? actions(activeId) : null}
        </div>
      </div>

      {!isLoading && options && options.length === 0 ? (
        <p className="text-muted-foreground text-sm">{ariMessages.property.none}</p>
      ) : activeId ? (
        children(activeId)
      ) : (
        <p className="text-muted-foreground text-sm">{ariMessages.property.placeholder}</p>
      )}
    </div>
  )
}
