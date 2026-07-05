"use client"

/**
 * The single Channels admin page (PLAN §4.7 / Phase 6): two read-only ledgers in
 * tabs — inbound Reservations + outbound ARI events — with status badges and a
 * retry-ingest button on failed reservations. Deliberately small; mirrors the
 * folios/housekeeping page conventions.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@voyant-travel/ui/components/tabs"
import { useState } from "react"
import { toast } from "sonner"

import {
  type AriEventStatus,
  channelsKeys,
  listAriEvents,
  listReservations,
  type ReservationStatus,
  retryReservationIngest,
} from "./channels-client"
import { channelsMessages } from "./channels-messages"

type BadgeVariant = "default" | "secondary" | "outline" | "destructive"

const RESERVATION_VARIANT: Record<ReservationStatus, BadgeVariant> = {
  received: "default",
  ingested: "secondary",
  failed: "destructive",
  ignored: "outline",
}

const ARI_VARIANT: Record<AriEventStatus, BadgeVariant> = {
  pending: "default",
  pushed: "secondary",
  failed: "destructive",
  skipped: "outline",
}

function ReservationsTab() {
  const m = channelsMessages.reservations
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: channelsKeys.reservations("all"),
    queryFn: () => listReservations(),
  })
  const rows = query.data?.data ?? []

  const retry = useMutation({
    mutationFn: (id: string) => retryReservationIngest(id),
    onSuccess: (res) => {
      if (res.ingest && !res.ingest.ok)
        toast.error(res.ingest.reason ?? channelsMessages.common.loadFailed)
      else toast.success(channelsMessages.common.retried)
      void queryClient.invalidateQueries({ queryKey: channelsKeys.all })
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : channelsMessages.common.loadFailed),
  })

  if (query.isError)
    return <p className="text-destructive text-sm">{channelsMessages.common.loadFailed}</p>
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">{m.empty}</p>

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.colChannel}</TableHead>
          <TableHead>{m.colRef}</TableHead>
          <TableHead>{m.colStatus}</TableHead>
          <TableHead>{m.colBooking}</TableHead>
          <TableHead>{m.colError}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.channel}</TableCell>
            <TableCell className="font-mono">{row.channelReservationId}</TableCell>
            <TableCell>
              <Badge variant={RESERVATION_VARIANT[row.status]}>{m.status[row.status]}</Badge>
            </TableCell>
            <TableCell className="font-mono text-xs">
              {row.bookingId ?? channelsMessages.common.none}
            </TableCell>
            <TableCell className="text-muted-foreground max-w-64 truncate text-xs">
              {row.error ?? channelsMessages.common.none}
            </TableCell>
            <TableCell className="text-right">
              {row.status === "failed" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(row.id)}
                >
                  {channelsMessages.common.retry}
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function AriEventsTab() {
  const m = channelsMessages.ariEvents
  const query = useQuery({
    queryKey: channelsKeys.ariEvents("all"),
    queryFn: () => listAriEvents(),
  })
  const rows = query.data?.data ?? []

  if (query.isError)
    return <p className="text-destructive text-sm">{channelsMessages.common.loadFailed}</p>
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">{m.empty}</p>

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.colChannel}</TableHead>
          <TableHead>{m.colRoomType}</TableHead>
          <TableHead>{m.colRatePlan}</TableHead>
          <TableHead>{m.colStatus}</TableHead>
          <TableHead className="text-right">{m.colAttempts}</TableHead>
          <TableHead>{m.colError}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.channel}</TableCell>
            <TableCell className="font-mono text-xs">{row.roomTypeId}</TableCell>
            <TableCell className="font-mono text-xs">
              {row.ratePlanId ?? channelsMessages.common.none}
            </TableCell>
            <TableCell>
              <Badge variant={ARI_VARIANT[row.status]}>{m.status[row.status]}</Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.attempts}</TableCell>
            <TableCell className="text-muted-foreground max-w-64 truncate text-xs">
              {row.lastError ?? channelsMessages.common.none}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function ChannelsLedgerPage() {
  const [tab, setTab] = useState<"reservations" | "ariEvents">("reservations")
  const m = channelsMessages.page

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{m.title}</h1>
        <p className="text-muted-foreground max-w-3xl text-sm">{m.subtitle}</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "reservations" | "ariEvents")}>
        <TabsList>
          <TabsTrigger value="reservations">{m.tabs.reservations}</TabsTrigger>
          <TabsTrigger value="ariEvents">{m.tabs.ariEvents}</TabsTrigger>
        </TabsList>
        <TabsContent value="reservations" className="pt-4">
          <ReservationsTab />
        </TabsContent>
        <TabsContent value="ariEvents" className="pt-4">
          <AriEventsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
