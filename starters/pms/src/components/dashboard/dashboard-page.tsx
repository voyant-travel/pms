"use client"

/**
 * The hotel Dashboard — the property-scoped daily overview that replaces the
 * packaged tour-operator dashboard at the `/` workspace index route.
 *
 * A Mews/Cloudbeds-style single-property daily picture: a KPI tile strip over
 * front-desk, housekeeping, revenue and recent-reservations panels, all scoped
 * to the property chosen in the shared selector (reused from the ARI surface, so
 * the selection follows the operator across Rates & Inventory, Front Desk and
 * here) and pinned to that property's business date. All data comes from the
 * existing PMS reads; every panel owns its own loading, empty and error states.
 *
 * Staff-facing copy uses the Reservations register throughout.
 */

import { Skeleton } from "@voyant-travel/ui/components/skeleton"

import { PropertySelector, usePropertyOptions, useSelectedProperty } from "../ari/property-selector"
import { todayIso } from "../front-desk/front-desk-dates"
import { dashboardMessages as M } from "./dashboard-messages"
import { FrontDeskPanel } from "./front-desk-panel"
import { HousekeepingPanel } from "./housekeeping-panel"
import { KpiStrip } from "./kpi-strip"
import { RecentReservationsPanel } from "./recent-reservations-panel"
import { RevenuePanel } from "./revenue-panel"
import { useBusinessDate } from "./use-dashboard-data"

/** Readable business-date label, e.g. `Mon, 06 Jul 2026` (UTC, no TZ shift). */
function formatBusinessDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

function BusinessDateChip({ propertyId }: { propertyId: string }) {
  const query = useBusinessDate(propertyId)
  const businessDate = query.data?.data?.currentDate

  return (
    <div className="border-border bg-muted/40 flex items-center gap-2 rounded-md border px-3 py-1.5">
      <span className="text-muted-foreground text-xs font-medium">{M.businessDate}</span>
      {query.isLoading ? (
        <Skeleton className="h-4 w-28" />
      ) : (
        <span className="text-sm font-semibold tabular-nums">
          {formatBusinessDate(businessDate ?? todayIso())}
        </span>
      )}
    </div>
  )
}

function DashboardBody({ propertyId }: { propertyId: string }) {
  const bizQuery = useBusinessDate(propertyId)
  const businessDate = bizQuery.data?.data?.currentDate ?? null
  // Hold the date empty while the business date resolves so the panels show
  // skeletons rather than fetching against a guessed date and then refetching.
  const date = businessDate ?? (bizQuery.isLoading ? "" : todayIso())

  return (
    <div className="flex flex-col gap-6">
      <KpiStrip propertyId={propertyId} date={date} />

      <div className="grid gap-6 xl:grid-cols-3">
        <FrontDeskPanel propertyId={propertyId} date={date} />
        <HousekeepingPanel propertyId={propertyId} date={date} />
        <RevenuePanel propertyId={propertyId} date={date} />
        <div className="xl:col-span-3">
          <RecentReservationsPanel />
        </div>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const [propertyId, setPropertyId] = useSelectedProperty()
  const { data: options, isLoading } = usePropertyOptions()
  const activeId = propertyId && options?.some((o) => o.id === propertyId) ? propertyId : ""

  const noProperties = !isLoading && options && options.length === 0

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{M.title}</h1>
          <p className="text-muted-foreground text-sm">{M.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {activeId ? <BusinessDateChip propertyId={activeId} /> : null}
          <PropertySelector
            value={propertyId}
            onChange={setPropertyId}
            options={options}
            isLoading={isLoading}
          />
        </div>
      </div>

      {noProperties ? (
        <p className="text-muted-foreground text-sm">{M.common.noProperties}</p>
      ) : activeId ? (
        <DashboardBody propertyId={activeId} />
      ) : (
        <p className="text-muted-foreground text-sm">{M.common.none}</p>
      )}
    </div>
  )
}
