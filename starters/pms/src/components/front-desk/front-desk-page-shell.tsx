"use client"

/**
 * Common chrome for the Front Desk pages: a titled header with the shared
 * property selector (reused from the ARI surface, so the selected property
 * follows the operator across Rates & Inventory and Front Desk) plus optional
 * header controls, then the page body once a property is chosen. Centralizes the
 * "no property / none exist" states so each page renders against a guaranteed id.
 */

import type { ReactNode } from "react"

import { PropertySelector, usePropertyOptions, useSelectedProperty } from "../ari/property-selector"
import { frontDeskMessages } from "./front-desk-messages"

export function FrontDeskPageShell({
  title,
  controls,
  children,
}: {
  title: string
  /** Rendered on the right of the header, next to the selector. Receives the property id. */
  controls?: (propertyId: string) => ReactNode
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
        <div className="flex flex-wrap items-center gap-3">
          <PropertySelector
            value={propertyId}
            onChange={setPropertyId}
            options={options}
            isLoading={isLoading}
          />
          {activeId && controls ? controls(activeId) : null}
        </div>
      </div>

      {!isLoading && options && options.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No properties found. Create a property first.
        </p>
      ) : activeId ? (
        children(activeId)
      ) : (
        <p className="text-muted-foreground text-sm">{frontDeskMessages.common.none}</p>
      )}
    </div>
  )
}
