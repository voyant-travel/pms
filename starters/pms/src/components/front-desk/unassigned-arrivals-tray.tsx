"use client"

import type { TapeChartGroup, UnassignedArrival } from "@voyant-travel/pms-front-desk"
import { Button } from "@voyant-travel/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { useState } from "react"
import { nightsBetween } from "./front-desk-dates"
import { frontDeskMessages } from "./front-desk-messages"
import { useFrontDeskMutations } from "./use-front-desk-mutations"

interface UnitOption {
  id: string
  unitNumber: string
  roomTypeName: string
}

/** A single arrival awaiting a unit. Units of its own room type are offered first. */
function ArrivalRow({
  arrival,
  matchingUnits,
}: {
  arrival: UnassignedArrival
  matchingUnits: UnitOption[]
}) {
  const m = frontDeskMessages.tapeChart
  const { assign } = useFrontDeskMutations()
  const [unitId, setUnitId] = useState<string>(matchingUnits[0]?.id ?? "")

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      <div className="flex flex-col">
        <span className="font-medium">{arrival.guestName ?? frontDeskMessages.common.none}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {arrival.checkInDate} → {arrival.checkOutDate} ·{" "}
          {nightsBetween(arrival.checkInDate, arrival.checkOutDate)} {m.nights.toLowerCase()}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Select value={unitId} onValueChange={(v) => setUnitId(v ?? "")}>
          <SelectTrigger className="min-w-44">
            <SelectValue placeholder={m.pickUnit} />
          </SelectTrigger>
          <SelectContent>
            {matchingUnits.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.unitNumber} · {u.roomTypeName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={assign.isPending || unitId === ""}
          onClick={() =>
            assign.mutate({
              bookingItemId: arrival.bookingItemId,
              unitId,
              fromDate: arrival.checkInDate,
              toDate: arrival.checkOutDate,
            })
          }
        >
          {m.assign}
        </Button>
      </div>
    </div>
  )
}

export function UnassignedArrivalsTray({
  arrivals,
  groups,
}: {
  arrivals: UnassignedArrival[]
  groups: TapeChartGroup[]
}) {
  const m = frontDeskMessages.tapeChart

  // Prefer units of the arrival's own room type; fall back to every unit so a
  // mismatch is still possible (the backend returns a warning, not an error).
  const allUnits: UnitOption[] = groups.flatMap((g) =>
    g.units.map((u) => ({ id: u.unitId, unitNumber: u.unitNumber, roomTypeName: g.roomTypeName })),
  )
  const unitsByRoomType = new Map<string, UnitOption[]>()
  for (const group of groups) {
    unitsByRoomType.set(
      group.roomTypeId,
      group.units.map((u) => ({
        id: u.unitId,
        unitNumber: u.unitNumber,
        roomTypeName: group.roomTypeName,
      })),
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-4">
      <div className="text-sm font-medium">
        {m.unassignedTray} ({arrivals.length})
      </div>
      {arrivals.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.unassignedEmpty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {arrivals.map((arrival) => {
            const matching = unitsByRoomType.get(arrival.roomTypeId)
            return (
              <ArrivalRow
                key={arrival.bookingItemId}
                arrival={arrival}
                matchingUnits={matching && matching.length > 0 ? matching : allUnits}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
