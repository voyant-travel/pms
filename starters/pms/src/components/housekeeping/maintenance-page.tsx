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
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { formatDayRange } from "@/lib/format-date"
import { frontDeskKeys, listRoomUnits } from "../front-desk/front-desk-client"
import { todayIso } from "../front-desk/front-desk-dates"
import {
  cancelMaintenanceBlock,
  housekeepingKeys,
  listMaintenanceBlocks,
  type MaintenanceBlock,
  type MaintenanceMutationResult,
  resolveMaintenanceBlock,
} from "./housekeeping-client"
import { housekeepingMessages } from "./housekeeping-messages"
import { HousekeepingPageShell } from "./housekeeping-page-shell"
import { MaintenanceDialog } from "./maintenance-dialog"
import {
  type MaintenanceTimeline,
  sortMaintenanceRows,
  toMaintenanceRow,
} from "./maintenance-model"

const TIMELINE_VARIANT: Record<MaintenanceTimeline, "default" | "secondary" | "outline"> = {
  current: "default",
  upcoming: "secondary",
  past: "outline",
  closed: "outline",
}

function MaintenanceRowActions({ block, onEdit }: { block: MaintenanceBlock; onEdit: () => void }) {
  const m = housekeepingMessages.maintenance
  const queryClient = useQueryClient()

  const onDone = (result: MaintenanceMutationResult) => {
    toast.success(housekeepingMessages.common.savedToast)
    if (result.recomputedRoomTypeId) toast.info(m.recomputed)
    void queryClient.invalidateQueries({ queryKey: housekeepingKeys.all })
  }
  const onError = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : housekeepingMessages.common.loadFailed)

  const resolve = useMutation({
    mutationFn: () => resolveMaintenanceBlock(block.id),
    onSuccess: onDone,
    onError,
  })
  const cancel = useMutation({
    mutationFn: () => cancelMaintenanceBlock(block.id),
    onSuccess: onDone,
    onError,
  })
  const closed = block.status !== "active"

  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" disabled={closed} onClick={onEdit}>
        {housekeepingMessages.common.edit}
      </Button>
      <ConfirmActionButton
        buttonLabel={m.resolve}
        confirmLabel={m.resolve}
        title={m.resolveTitle}
        description={m.resolveBody}
        variant="outline"
        disabled={closed || resolve.isPending}
        onConfirm={async () => {
          await resolve.mutateAsync()
        }}
      />
      <ConfirmActionButton
        buttonLabel={m.cancel}
        confirmLabel={m.cancel}
        title={m.cancelTitle}
        description={m.cancelBody}
        variant="outline"
        confirmVariant="destructive"
        disabled={closed || cancel.isPending}
        onConfirm={async () => {
          await cancel.mutateAsync()
        }}
      />
    </div>
  )
}

function MaintenanceView({ propertyId }: { propertyId: string }) {
  const m = housekeepingMessages
  const today = todayIso()
  const [editing, setEditing] = useState<MaintenanceBlock | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const blocksQuery = useQuery({
    queryKey: housekeepingKeys.maintenance(propertyId),
    queryFn: () => listMaintenanceBlocks({ propertyId }),
  })
  const unitsQuery = useQuery({
    queryKey: frontDeskKeys.units(propertyId),
    queryFn: () => listRoomUnits({ propertyId }),
  })

  const units = unitsQuery.data?.data ?? []
  const unitLabel = useMemo(() => {
    const byId = new Map(units.map((u) => [u.id, u.unitNumber]))
    return (unitId: string) => byId.get(unitId) ?? unitId
  }, [units])

  const rows = useMemo(
    () =>
      sortMaintenanceRows((blocksQuery.data?.data ?? []).map((b) => toMaintenanceRow(b, today))),
    [blocksQuery.data, today],
  )

  if (blocksQuery.isError) {
    return <p className="text-destructive text-sm">{m.common.loadFailed}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          disabled={units.length === 0}
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="size-4" /> {m.maintenance.new}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.common.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.maintenance.colUnit}</TableHead>
              <TableHead>{m.maintenance.colRange}</TableHead>
              <TableHead className="text-right">{m.maintenance.colDays}</TableHead>
              <TableHead>{m.maintenance.colReason}</TableHead>
              <TableHead>{m.maintenance.colStatus}</TableHead>
              <TableHead>{m.maintenance.colDescription}</TableHead>
              <TableHead className="w-64" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ block, timeline, days }) => (
              <TableRow key={block.id}>
                <TableCell className="font-medium">{unitLabel(block.unitId)}</TableCell>
                <TableCell className="text-xs">
                  {formatDayRange(block.fromDate, block.toDate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{days}</TableCell>
                <TableCell className="text-muted-foreground">
                  {m.maintenance.reasonLabels[block.reason]}
                </TableCell>
                <TableCell>
                  <Badge variant={TIMELINE_VARIANT[timeline]}>
                    {block.status === "active"
                      ? m.maintenance.timeline[timeline]
                      : m.maintenance.statusLabels[block.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-48 truncate">
                  {block.description ?? m.common.none}
                </TableCell>
                <TableCell>
                  <MaintenanceRowActions
                    block={block}
                    onEdit={() => {
                      setEditing(block)
                      setDialogOpen(true)
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <MaintenanceDialog
        propertyId={propertyId}
        block={editing}
        units={units}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}

export function MaintenancePage() {
  return (
    <HousekeepingPageShell title={housekeepingMessages.maintenance.title}>
      {(propertyId) => <MaintenanceView propertyId={propertyId} />}
    </HousekeepingPageShell>
  )
}
