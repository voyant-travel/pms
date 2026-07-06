"use client"

import { useQuery } from "@tanstack/react-query"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@voyant-travel/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { useEffect, useState } from "react"

import { frontDeskKeys, listAssignmentsForBookingItem } from "./front-desk-client"
import { nightsBetween } from "./front-desk-dates"
import { frontDeskMessages } from "./front-desk-messages"
import { type StayBar, statusBarClass, stayStateLabel } from "./tape-chart-model"
import { useFrontDeskMutations } from "./use-front-desk-mutations"

/** A move target — every unit on the chart, labelled with its room type. */
export interface MoveTarget {
  id: string
  unitNumber: string
  roomTypeName: string
}

export function StayDetailDialog({
  stay,
  currentUnitId,
  moveTargets,
  open,
  onOpenChange,
}: {
  stay: StayBar | null
  currentUnitId: string | null
  moveTargets: MoveTarget[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const m = frontDeskMessages.tapeChart
  const { checkIn, checkOut, move } = useFrontDeskMutations()
  const [targetUnit, setTargetUnit] = useState<string>("")

  const stayKey = stay?.bookingItemId
  useEffect(() => {
    // Reset the move target whenever a different stay/unit is opened.
    void stayKey
    setTargetUnit(currentUnitId ?? "")
  }, [currentUnitId, stayKey])

  // Resolve the assignment id for this stay so a move can PATCH it.
  const assignmentQuery = useQuery({
    queryKey: stay
      ? frontDeskKeys.assignments(stay.bookingItemId)
      : ["front-desk", "assignments", "none"],
    queryFn: () => listAssignmentsForBookingItem(stay!.bookingItemId),
    enabled: open && stay !== null,
  })
  const assignmentId = assignmentQuery.data?.data[0]?.id ?? null

  if (!stay) return null

  const pending = checkIn.isPending || checkOut.isPending || move.isPending
  const canCheckIn = stay.opsStatus !== "checked_in" && stay.reservationStatus !== "no_show"
  const canCheckOut = stay.opsStatus === "checked_in"
  const canMove = assignmentId !== null && targetUnit !== "" && targetUnit !== currentUnitId

  const close = () => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{m.stayDetails}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <Row label={frontDeskMessages.common.guest}>
            <span className="font-medium">{stay.guestName ?? frontDeskMessages.common.none}</span>
          </Row>
          <Row label={m.dates}>
            <span className="tabular-nums">
              {stay.checkInDate} → {stay.checkOutDate}
            </span>
            <span className="text-muted-foreground ml-2">
              {nightsBetween(stay.checkInDate, stay.checkOutDate)} {m.nights.toLowerCase()}
            </span>
          </Row>
          <Row label={m.status}>
            <Badge
              variant="outline"
              className={statusBarClass(stay.reservationStatus, stay.opsStatus)}
            >
              {stayStateLabel(stay.reservationStatus, stay.opsStatus)}
            </Badge>
          </Row>

          <div className="border-t pt-3">
            <div className="text-muted-foreground mb-1.5 text-xs font-medium">{m.moveTo}</div>
            {assignmentId === null && assignmentQuery.isFetched ? (
              <p className="text-muted-foreground text-xs">{m.noAssignment}</p>
            ) : (
              <Select value={targetUnit} onValueChange={(v) => setTargetUnit(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m.pickUnit} />
                </SelectTrigger>
                <SelectContent>
                  {moveTargets.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.unitNumber} · {t.roomTypeName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={close}>
            {frontDeskMessages.common.close}
          </Button>
          <Button
            variant="outline"
            disabled={pending || !canMove}
            onClick={() =>
              assignmentId &&
              move.mutate({ id: assignmentId, input: { unitId: targetUnit } }, { onSuccess: close })
            }
          >
            {m.move}
          </Button>
          {canCheckOut ? (
            <Button
              disabled={pending}
              onClick={() =>
                checkOut.mutate({ bookingItemId: stay.bookingItemId }, { onSuccess: close })
              }
            >
              {m.checkOut}
            </Button>
          ) : (
            <Button
              disabled={pending || !canCheckIn}
              onClick={() =>
                checkIn.mutate({ bookingItemId: stay.bookingItemId }, { onSuccess: close })
              }
            >
              {m.checkIn}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}
