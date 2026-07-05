"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
import { Plus, RefreshCw } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ariKeys, listRoomTypes, type RoomType } from "../ari/ari-client"
import {
  deleteRoomUnit,
  frontDeskKeys,
  listRoomUnits,
  type RoomUnit,
  type RoomUnitStatus,
  recomputeInventory,
} from "./front-desk-client"
import { addDaysIso, todayIso } from "./front-desk-dates"
import { frontDeskMessages } from "./front-desk-messages"
import { FrontDeskPageShell } from "./front-desk-page-shell"
import { UnitDialog } from "./unit-dialog"

const STATUS_VARIANT: Record<RoomUnitStatus, "secondary" | "destructive" | "outline"> = {
  available: "secondary",
  out_of_order: "destructive",
  out_of_service: "outline",
}

/** Per-room-type recompute button (serialized types only). */
function RecomputeButton({ roomType }: { roomType: RoomType }) {
  const m = frontDeskMessages
  const recompute = useMutation({
    mutationFn: () => {
      const from = todayIso()
      return recomputeInventory(roomType.id, { from, to: addDaysIso(from, 30) })
    },
    onSuccess: ({ data }) => {
      if (!data.serialized) toast.info(m.units.recomputePooled)
      else toast.success(m.units.recomputeDone(data.upserted, data.dates))
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : m.common.loadFailed),
  })
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={recompute.isPending}
      onClick={() => recompute.mutate()}
    >
      <RefreshCw className="size-3.5" /> {roomType.name}
    </Button>
  )
}

function UnitsTable({ propertyId }: { propertyId: string }) {
  const m = frontDeskMessages
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<RoomUnit | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const roomTypesQuery = useQuery({
    queryKey: ariKeys.roomTypes(propertyId),
    queryFn: () => listRoomTypes(propertyId),
  })
  const unitsQuery = useQuery({
    queryKey: frontDeskKeys.units(propertyId),
    queryFn: () => listRoomUnits({ propertyId }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteRoomUnit(id),
    onSuccess: () => {
      toast.success(m.common.deletedToast)
      void queryClient.invalidateQueries({ queryKey: frontDeskKeys.units(propertyId) })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : m.common.loadFailed),
  })

  if (unitsQuery.isError) return <p className="text-destructive text-sm">{m.common.loadFailed}</p>
  if (unitsQuery.isLoading) return <p className="text-muted-foreground text-sm">…</p>

  const roomTypes = roomTypesQuery.data?.data ?? []
  const nameByRoomType = new Map(roomTypes.map((rt) => [rt.id, rt.name]))
  const serializedTypes = roomTypes.filter((rt) => rt.inventoryMode === "serialized")
  const units = unitsQuery.data?.data ?? []

  const location = (unit: RoomUnit): string => {
    const parts = [unit.floor, unit.wing].filter(Boolean)
    return parts.length ? parts.join(" / ") : m.common.none
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button
          disabled={roomTypes.length === 0}
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="size-4" /> {m.units.new}
        </Button>
      </div>

      {units.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.common.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.units.colUnit}</TableHead>
              <TableHead>{m.units.colRoomType}</TableHead>
              <TableHead>{m.units.colLocation}</TableHead>
              <TableHead>{m.units.colStatus}</TableHead>
              <TableHead />
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell className="font-medium">
                  {unit.unitNumber}
                  {unit.name ? (
                    <span className="text-muted-foreground ml-1 font-normal">{unit.name}</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {nameByRoomType.get(unit.roomTypeId) ?? unit.roomTypeId}
                </TableCell>
                <TableCell className="text-muted-foreground">{location(unit)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[unit.status]}>
                    {m.units.statusLabels[unit.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {unit.active === false ? <Badge variant="outline">Inactive</Badge> : null}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(unit)
                        setDialogOpen(true)
                      }}
                    >
                      {m.common.edit}
                    </Button>
                    <ConfirmActionButton
                      buttonLabel={m.common.delete}
                      confirmLabel={m.common.delete}
                      title={m.units.deleteTitle}
                      description={m.units.deleteBody}
                      variant="outline"
                      confirmVariant="destructive"
                      onConfirm={async () => {
                        await remove.mutateAsync(unit.id)
                      }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {serializedTypes.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border p-4">
          <div className="text-sm font-medium">{m.units.recomputeGroup}</div>
          <div className="flex flex-wrap gap-2">
            {serializedTypes.map((rt) => (
              <RecomputeButton key={rt.id} roomType={rt} />
            ))}
          </div>
        </div>
      ) : null}

      <UnitDialog
        propertyId={propertyId}
        unit={editing}
        roomTypes={roomTypes}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}

export function UnitsPage() {
  return (
    <FrontDeskPageShell title={frontDeskMessages.units.title}>
      {(propertyId) => <UnitsTable propertyId={propertyId} />}
    </FrontDeskPageShell>
  )
}
