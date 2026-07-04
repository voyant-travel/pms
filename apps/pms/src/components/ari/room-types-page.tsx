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
import { Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ariKeys, deleteRoomType, listRoomTypes, type RoomType } from "./ari-client"
import { INVENTORY_MODE_OPTIONS } from "./ari-constants"
import { ariMessages } from "./ari-messages"
import { AriPageShell } from "./ari-page-shell"
import { RoomTypeDialog } from "./room-type-dialog"

const modeLabel = (mode: string): string =>
  INVENTORY_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? mode

function occupancy(rt: RoomType): string {
  const std = rt.standardOccupancy ?? null
  const max = rt.maxOccupancy ?? null
  if (std && max) return `${std} / ${max}`
  if (max) return `${max}`
  if (rt.maxAdults) return `${rt.maxAdults} adults`
  return "—"
}

function RoomTypesTable({ propertyId }: { propertyId: string }) {
  const m = ariMessages
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<RoomType | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ariKeys.roomTypes(propertyId),
    queryFn: () => listRoomTypes(propertyId),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteRoomType(id),
    onSuccess: () => {
      toast.success(m.common.deletedToast)
      void queryClient.invalidateQueries({ queryKey: ariKeys.roomTypes(propertyId) })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : m.common.loadFailed),
  })

  if (isError) return <p className="text-destructive text-sm">{m.common.loadFailed}</p>
  if (isLoading) return <p className="text-muted-foreground text-sm">…</p>

  const roomTypes = data?.data ?? []

  return (
    <>
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="size-4" /> {m.roomTypes.new}
        </Button>
      </div>

      {roomTypes.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.common.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.common.code}</TableHead>
              <TableHead>{m.common.name}</TableHead>
              <TableHead>{m.roomTypes.inventoryMode}</TableHead>
              <TableHead>{m.roomTypes.occupancy}</TableHead>
              <TableHead />
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {roomTypes.map((rt) => (
              <TableRow key={rt.id}>
                <TableCell className="font-mono text-xs">{rt.code ?? "—"}</TableCell>
                <TableCell className="font-medium">{rt.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {modeLabel(rt.inventoryMode)}
                </TableCell>
                <TableCell className="text-muted-foreground">{occupancy(rt)}</TableCell>
                <TableCell>
                  {rt.active === false ? <Badge variant="secondary">Inactive</Badge> : null}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(rt)
                        setDialogOpen(true)
                      }}
                    >
                      {m.common.edit}
                    </Button>
                    <ConfirmActionButton
                      buttonLabel={m.common.delete}
                      confirmLabel={m.common.deleteConfirm}
                      title={m.roomTypes.deleteRoomTypeTitle}
                      description={m.roomTypes.deleteRoomTypeBody}
                      variant="outline"
                      confirmVariant="destructive"
                      onConfirm={async () => {
                        await remove.mutateAsync(rt.id)
                      }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <RoomTypeDialog
        propertyId={propertyId}
        roomType={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}

export function RoomTypesPage() {
  return (
    <AriPageShell title={ariMessages.roomTypes.title}>
      {(propertyId) => <RoomTypesTable propertyId={propertyId} />}
    </AriPageShell>
  )
}
