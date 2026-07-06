"use client"

/**
 * Front-desk panel: the day's top-5 arrivals and departures for the business
 * date. Each row shows the guest, room type, and either the assigned room
 * number or an "Assign" link into the tape chart. A "view all" link goes to the
 * front-desk boards.
 */

import type { BoardEntry } from "@voyant-travel/pms-front-desk"
import { dashboardMessages as M } from "./dashboard-messages"
import { type FrontDeskRow, topFrontDeskRows } from "./dashboard-model"
import { EmptyLine, ErrorLine, PanelCard, PanelLink, SkeletonRows } from "./dashboard-ui"
import { useBoards, useRoomTypeNames, useUnitNumbers } from "./use-dashboard-data"

const BOARDS_HREF = "/front-desk/boards"
const TAPE_CHART_HREF = "/front-desk/tape-chart"

function FrontDeskList({ rows, emptyLabel }: { rows: FrontDeskRow[]; emptyLabel: string }) {
  if (rows.length === 0) return <EmptyLine>{emptyLabel}</EmptyLine>
  return (
    <ul className="divide-border divide-y">
      {rows.map((row) => (
        <li key={row.bookingItemId} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{row.guestName}</div>
            <div className="text-muted-foreground truncate text-xs">{row.roomTypeName}</div>
          </div>
          {row.unitNumber ? (
            <span className="text-sm tabular-nums whitespace-nowrap">
              {M.frontDesk.unit(row.unitNumber)}
            </span>
          ) : (
            <a
              href={TAPE_CHART_HREF}
              className="text-primary text-xs font-medium whitespace-nowrap underline-offset-4 hover:underline"
            >
              {M.frontDesk.assign}
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}

export function FrontDeskPanel({ propertyId, date }: { propertyId: string; date: string }) {
  const boardsQuery = useBoards(propertyId, date)
  const roomTypeNames = useRoomTypeNames(propertyId)
  const unitNumbers = useUnitNumbers(propertyId)

  const boards = boardsQuery.data?.data
  const names = roomTypeNames.data ?? new Map<string, string>()
  const units = unitNumbers.data ?? new Map<string, string>()

  const arrivals: BoardEntry[] = boards?.arrivals ?? []
  const departures: BoardEntry[] = boards?.departures ?? []

  return (
    <PanelCard
      title={M.frontDesk.title}
      action={<PanelLink href={BOARDS_HREF}>{M.frontDesk.viewBoards}</PanelLink>}
    >
      {boardsQuery.isError ? (
        <ErrorLine>{M.common.loadFailed}</ErrorLine>
      ) : boardsQuery.isLoading ? (
        <SkeletonRows rows={5} />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
              {M.frontDesk.arrivals}
            </div>
            <FrontDeskList
              rows={topFrontDeskRows(arrivals, names, units)}
              emptyLabel={M.frontDesk.noArrivals}
            />
          </div>
          <div>
            <div className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
              {M.frontDesk.departures}
            </div>
            <FrontDeskList
              rows={topFrontDeskRows(departures, names, units)}
              emptyLabel={M.frontDesk.noDepartures}
            />
          </div>
        </div>
      )}
    </PanelCard>
  )
}
