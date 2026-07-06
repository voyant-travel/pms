"use client"

import { useQuery } from "@tanstack/react-query"
import type { BoardEntry, Boards } from "@voyant-travel/pms-front-desk"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { ConfirmActionButton } from "@voyant-travel/ui/components/confirm-action-button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@voyant-travel/ui/components/tabs"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"
import { IsoDateField } from "../admin-shared/iso-date-field"
import { ariKeys, listRoomTypes } from "../ari/ari-client"
import {
  type BoardTab,
  boardEntryView,
  checkInDisabledReason,
  checkOutDisabledReason,
  entriesForTab,
  noShowDisabledReason,
} from "./boards-model"
import { frontDeskKeys, getBoards, listRoomUnits } from "./front-desk-client"
import { addDaysIso, todayIso } from "./front-desk-dates"
import { frontDeskMessages } from "./front-desk-messages"
import { FrontDeskPageShell } from "./front-desk-page-shell"
import { useFrontDeskMutations } from "./use-front-desk-mutations"

const STATE_VARIANT = {
  reserved: "secondary",
  "in-house": "default",
  "checked-out": "outline",
  "no-show": "destructive",
} as const

function BoardActions({ tab, entry }: { tab: BoardTab; entry: BoardEntry }) {
  const m = frontDeskMessages.boards
  const { checkIn, checkOut, noShow } = useFrontDeskMutations()
  const pending = checkIn.isPending || checkOut.isPending || noShow.isPending

  if (tab === "arrivals") {
    const blockCheckIn = checkInDisabledReason(entry.opsStatus)
    const blockNoShow = noShowDisabledReason(entry.opsStatus)
    return (
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          disabled={pending || blockCheckIn !== null}
          title={blockCheckIn ?? undefined}
          onClick={() => checkIn.mutate({ bookingItemId: entry.bookingItemId })}
        >
          {m.checkIn}
        </Button>
        <ConfirmActionButton
          buttonLabel={m.noShow}
          title={m.noShowTitle}
          description={m.noShowBody}
          confirmLabel={m.noShowConfirm}
          variant="outline"
          confirmVariant="destructive"
          disabled={pending || blockNoShow !== null}
          onConfirm={async () => {
            await noShow.mutateAsync({ bookingItemId: entry.bookingItemId })
          }}
        />
      </div>
    )
  }
  if (tab === "departures") {
    const blockCheckOut = checkOutDisabledReason(entry.opsStatus)
    return (
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={pending || blockCheckOut !== null}
          title={blockCheckOut ?? undefined}
          onClick={() => checkOut.mutate({ bookingItemId: entry.bookingItemId })}
        >
          {m.checkOut}
        </Button>
      </div>
    )
  }
  return null
}

function BoardTable({
  tab,
  entries,
  unitLabel,
  roomTypeLabel,
}: {
  tab: BoardTab
  entries: BoardEntry[]
  unitLabel: (unitId: string | null) => string
  roomTypeLabel: (roomTypeId: string) => string
}) {
  const m = frontDeskMessages.boards
  if (entries.length === 0) {
    return <p className="text-muted-foreground py-6 text-sm">{m.empty}</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.colGuest}</TableHead>
          <TableHead>{m.colBooking}</TableHead>
          <TableHead>{m.colRoomType}</TableHead>
          <TableHead>{m.colUnit}</TableHead>
          <TableHead className="text-right">{m.colNights}</TableHead>
          <TableHead>{m.colPax}</TableHead>
          <TableHead>{m.colStatus}</TableHead>
          <TableHead className="w-44" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const view = boardEntryView(entry)
          return (
            <TableRow key={entry.bookingItemId}>
              <TableCell className="font-medium">
                {entry.guestName ?? frontDeskMessages.common.none}
              </TableCell>
              <TableCell className="font-mono text-xs">{entry.bookingNumber}</TableCell>
              <TableCell className="text-muted-foreground">
                {roomTypeLabel(entry.roomTypeId)}
              </TableCell>
              <TableCell className="text-muted-foreground">{unitLabel(entry.unitId)}</TableCell>
              <TableCell className="text-right tabular-nums">{view.nights}</TableCell>
              <TableCell className="text-muted-foreground tabular-nums">{view.pax}</TableCell>
              <TableCell>
                <Badge variant={STATE_VARIANT[view.stateTone]}>{view.stateLabel}</Badge>
              </TableCell>
              <TableCell>
                <BoardActions tab={tab} entry={entry} />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function BoardsView({ propertyId }: { propertyId: string }) {
  const m = frontDeskMessages.boards
  const [date, setDate] = useState<string>(() => todayIso())
  const [tab, setTab] = useState<BoardTab>("arrivals")

  const boardsQuery = useQuery({
    queryKey: frontDeskKeys.boards(propertyId, date),
    queryFn: () => getBoards(propertyId, date),
  })
  const unitsQuery = useQuery({
    queryKey: frontDeskKeys.units(propertyId),
    queryFn: () => listRoomUnits({ propertyId }),
  })
  const roomTypesQuery = useQuery({
    queryKey: ariKeys.roomTypes(propertyId),
    queryFn: () => listRoomTypes(propertyId),
  })

  const unitLabel = useMemo(() => {
    const byId = new Map((unitsQuery.data?.data ?? []).map((u) => [u.id, u.unitNumber]))
    return (unitId: string | null) =>
      unitId ? (byId.get(unitId) ?? unitId) : frontDeskMessages.common.unassigned
  }, [unitsQuery.data])
  const roomTypeLabel = useMemo(() => {
    const byId = new Map((roomTypesQuery.data?.data ?? []).map((rt) => [rt.id, rt.name]))
    return (roomTypeId: string) => byId.get(roomTypeId) ?? roomTypeId
  }, [roomTypesQuery.data])

  const boards: Boards | undefined = boardsQuery.data?.data
  const count = (t: BoardTab) => (boards ? entriesForTab(boards, t).length : 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={frontDeskMessages.common.prev}
          onClick={() => setDate((d) => addDaysIso(d, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <IsoDateField
          value={date}
          onChange={(v) => setDate(v || todayIso())}
          required
          className="w-40"
        />
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={frontDeskMessages.common.next}
          onClick={() => setDate((d) => addDaysIso(d, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDate(todayIso())}>
          {frontDeskMessages.common.today}
        </Button>
      </div>

      {boardsQuery.isError ? (
        <p className="text-destructive text-sm">{frontDeskMessages.common.loadFailed}</p>
      ) : boardsQuery.isLoading || !boards ? (
        <p className="text-muted-foreground text-sm">…</p>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as BoardTab)}>
          <TabsList>
            <TabsTrigger value="arrivals">
              {m.arrivals} ({count("arrivals")})
            </TabsTrigger>
            <TabsTrigger value="departures">
              {m.departures} ({count("departures")})
            </TabsTrigger>
            <TabsTrigger value="inHouse">
              {m.inHouse} ({count("inHouse")})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="arrivals">
            <BoardTable
              tab="arrivals"
              entries={boards.arrivals}
              unitLabel={unitLabel}
              roomTypeLabel={roomTypeLabel}
            />
          </TabsContent>
          <TabsContent value="departures">
            <BoardTable
              tab="departures"
              entries={boards.departures}
              unitLabel={unitLabel}
              roomTypeLabel={roomTypeLabel}
            />
          </TabsContent>
          <TabsContent value="inHouse">
            <BoardTable
              tab="inHouse"
              entries={boards.inHouse}
              unitLabel={unitLabel}
              roomTypeLabel={roomTypeLabel}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

export function BoardsPage() {
  return (
    <FrontDeskPageShell title={frontDeskMessages.boards.title}>
      {(propertyId) => <BoardsView propertyId={propertyId} />}
    </FrontDeskPageShell>
  )
}
