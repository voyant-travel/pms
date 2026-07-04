"use client"

import { useQuery } from "@tanstack/react-query"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { Wrench } from "lucide-react"
import { useMemo } from "react"

import {
  mergeRoomStatus,
  type RoomStatusCell,
  roomStatusDisabledReason,
} from "./housekeeping-board-model"
import {
  housekeepingKeys,
  listMaintenanceBlocks,
  listRoomStatus,
  type RoomStatus,
} from "./housekeeping-client"
import { housekeepingMessages } from "./housekeeping-messages"
import { useHousekeepingMutations } from "./use-housekeeping-mutations"

/** Tailwind tint per housekeeping status (dirty=red, clean=green, inspected=blue). */
const STATUS_CLASS: Record<RoomStatus, string> = {
  dirty: "border-transparent bg-red-500 text-white",
  clean: "border-transparent bg-green-600 text-white",
  inspected: "border-transparent bg-blue-600 text-white",
}

const SET_ACTIONS: { status: RoomStatus; label: string }[] = [
  { status: "dirty", label: housekeepingMessages.board.setDirty },
  { status: "clean", label: housekeepingMessages.board.setClean },
  { status: "inspected", label: housekeepingMessages.board.setInspected },
]

function statusLabel(status: RoomStatus | null): string {
  return status
    ? housekeepingMessages.board.roomStatus[status]
    : housekeepingMessages.board.roomStatus.untouched
}

function UnitCell({ cell }: { cell: RoomStatusCell }) {
  const { roomStatus } = useHousekeepingMutations()
  const pending = roomStatus.isPending

  return (
    <div className="flex w-40 flex-col gap-1.5 rounded-md border p-2.5 text-sm">
      <div className="flex items-center justify-between gap-1.5">
        <span className="font-medium">{cell.unitNumber}</span>
        {cell.underMaintenance ? (
          <Wrench
            className="text-amber-600 size-3.5"
            aria-label={housekeepingMessages.board.maintenance}
          />
        ) : null}
      </div>
      <Badge className={cell.roomStatus ? STATUS_CLASS[cell.roomStatus] : ""} variant="outline">
        {statusLabel(cell.roomStatus)}
      </Badge>
      <div className="flex gap-1">
        {SET_ACTIONS.map(({ status, label }) => {
          const disabledReason = roomStatusDisabledReason(cell.roomStatus, status)
          const disabled = pending || cell.roomStatus === status || disabledReason !== null
          return (
            <Button
              key={status}
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-xs"
              disabled={disabled}
              title={disabledReason ?? undefined}
              onClick={() => roomStatus.mutate({ unitId: cell.unitId, status })}
            >
              {label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

/** Room-status grid: every unit with its housekeeping status + maintenance overlay. */
export function RoomStatusStrip({ propertyId, date }: { propertyId: string; date: string }) {
  const m = housekeepingMessages.board

  const roomStatusQuery = useQuery({
    queryKey: housekeepingKeys.roomStatus(propertyId),
    queryFn: () => listRoomStatus(propertyId),
  })
  const blocksQuery = useQuery({
    queryKey: housekeepingKeys.maintenance(propertyId),
    queryFn: () => listMaintenanceBlocks({ propertyId }),
  })

  const cells = useMemo(
    () => mergeRoomStatus(roomStatusQuery.data?.data ?? [], blocksQuery.data?.data ?? [], date),
    [roomStatusQuery.data, blocksQuery.data, date],
  )

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{m.roomStatusPanel}</h2>
      {roomStatusQuery.isError ? (
        <p className="text-destructive text-sm">{housekeepingMessages.common.loadFailed}</p>
      ) : cells.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.roomStatusEmpty}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {cells.map((cell) => (
            <UnitCell key={cell.unitId} cell={cell} />
          ))}
        </div>
      )}
    </div>
  )
}
