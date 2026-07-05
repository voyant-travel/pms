"use client"

import { useQuery } from "@tanstack/react-query"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { Input } from "@voyant-travel/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { Plus } from "lucide-react"
import { useState } from "react"
import { FolioDetail } from "./folio-detail"
import {
  FOLIO_STATUSES,
  type Folio,
  type FolioStatus,
  foliosKeys,
  listFolios,
} from "./folios-client"
import { foliosMessages } from "./folios-messages"
import { formatMoney } from "./folios-model"
import { FoliosPageShell } from "./folios-page-shell"
import { NewHouseFolioDialog } from "./new-house-folio-dialog"

const STATUS_VARIANT: Record<FolioStatus, "default" | "secondary" | "outline" | "destructive"> = {
  open: "default",
  settled: "secondary",
  closed: "outline",
  voided: "destructive",
}

const ALL = "__all__"

function FolioTable({ propertyId, onOpen }: { propertyId: string; onOpen: (id: string) => void }) {
  const m = foliosMessages
  const [status, setStatus] = useState<FolioStatus | "">("")
  const [bookingId, setBookingId] = useState("")
  const [newHouseOpen, setNewHouseOpen] = useState(false)

  const query = useQuery({
    queryKey: foliosKeys.list(propertyId, status, bookingId),
    queryFn: () =>
      listFolios({
        propertyId,
        status: status || undefined,
        bookingId: bookingId.trim() || undefined,
      }),
  })
  const folios: Folio[] = query.data?.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={status || ALL}
          onValueChange={(v) => setStatus(v === ALL ? "" : (v as FolioStatus))}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={m.list.filterStatus} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{m.list.filterAll}</SelectItem>
            {FOLIO_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {m.list.status[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-64"
          value={bookingId}
          onChange={(e) => setBookingId(e.target.value)}
          placeholder={m.list.searchPlaceholder}
        />
        <div className="ml-auto">
          <Button size="sm" onClick={() => setNewHouseOpen(true)}>
            <Plus className="size-4" /> {m.list.newHouseFolio}
          </Button>
        </div>
      </div>

      {query.isError ? (
        <p className="text-destructive text-sm">{m.common.loadFailed}</p>
      ) : folios.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.list.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.list.colNumber}</TableHead>
              <TableHead>{m.list.colKind}</TableHead>
              <TableHead>{m.list.colGuest}</TableHead>
              <TableHead>{m.list.colStatus}</TableHead>
              <TableHead className="text-right">{m.list.colBalance}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {folios.map((folio) => (
              <TableRow key={folio.id} className="cursor-pointer" onClick={() => onOpen(folio.id)}>
                <TableCell className="font-mono font-medium">{folio.folioNumber}</TableCell>
                <TableCell>
                  <Badge variant="outline">{m.list.kind[folio.kind]}</Badge>
                </TableCell>
                <TableCell>{folio.guestName ?? m.common.none}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[folio.status]}>
                    {m.list.status[folio.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {folio.balanceCents === undefined
                    ? m.common.none
                    : formatMoney(folio.balanceCents, folio.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <NewHouseFolioDialog
        propertyId={propertyId}
        open={newHouseOpen}
        onOpenChange={setNewHouseOpen}
      />
    </div>
  )
}

function FoliosView({ propertyId }: { propertyId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  if (selectedId) {
    return <FolioDetail folioId={selectedId} onBack={() => setSelectedId(null)} />
  }
  return <FolioTable propertyId={propertyId} onOpen={setSelectedId} />
}

export function FoliosPage() {
  return (
    <FoliosPageShell title={foliosMessages.list.title}>
      {(propertyId) => <FoliosView propertyId={propertyId} />}
    </FoliosPageShell>
  )
}
