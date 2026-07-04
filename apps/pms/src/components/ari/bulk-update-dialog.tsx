"use client"

/**
 * Bulk rates/availability editor. One operation spanning a date range with an
 * optional ISO weekday mask (Mon=1..Sun=7) drives the module's two bulk PUT
 * endpoints; the server expands the range + mask to concrete days and upserts
 * atomically, so this dialog stays a thin form over a single operation.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@voyant-travel/ui/components/button"
import { Checkbox } from "@voyant-travel/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@voyant-travel/ui/components/dialog"
import { Input } from "@voyant-travel/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { useState } from "react"
import { toast } from "sonner"

import type { CalendarGrid } from "../../modules/ari"
import { ariKeys, bulkUpsertInventory, bulkUpsertRates } from "./ari-client"
import { Field, SwitchRow } from "./ari-form"
import { ariMessages } from "./ari-messages"
import { inputToCents } from "./calendar-grid-model"

const WEEKDAYS: { iso: number; label: string }[] = [
  { iso: 1, label: "Mon" },
  { iso: 2, label: "Tue" },
  { iso: 3, label: "Wed" },
  { iso: 4, label: "Thu" },
  { iso: 5, label: "Fri" },
  { iso: 6, label: "Sat" },
  { iso: 7, label: "Sun" },
]

type Target = "rates" | "inventory"

export function BulkUpdateDialog({
  propertyId,
  grid,
  open,
  onOpenChange,
}: {
  propertyId: string
  grid: CalendarGrid
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const m = ariMessages.calendar.bulk
  const queryClient = useQueryClient()

  const [target, setTarget] = useState<Target>("rates")
  const [roomTypeId, setRoomTypeId] = useState(grid.roomTypes[0]?.id ?? "")
  const [ratePlanId, setRatePlanId] = useState("")
  const [from, setFrom] = useState(grid.from)
  const [to, setTo] = useState(grid.to)
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [sellPrice, setSellPrice] = useState("")
  const [capacity, setCapacity] = useState("")
  const [closed, setClosed] = useState(false)

  const roomType = grid.roomTypes.find((rt) => rt.id === roomTypeId)
  const attachedRatePlans = grid.ratePlans.filter((rp) => roomType?.ratePlanIds.includes(rp.id))
  const activeRatePlan =
    attachedRatePlans.find((rp) => rp.id === ratePlanId) ?? attachedRatePlans[0]

  const toggleWeekday = (iso: number) =>
    setWeekdays((prev) =>
      prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso].sort(),
    )

  const apply = useMutation({
    mutationFn: async () => {
      const mask = weekdays.length > 0 && weekdays.length < 7 ? weekdays : undefined
      if (target === "rates") {
        const cents = inputToCents(sellPrice)
        if (!activeRatePlan || cents == null) throw new Error("Enter a sell price")
        return bulkUpsertRates([
          {
            ratePlanId: activeRatePlan.id,
            roomTypeId,
            from,
            to,
            weekdays: mask,
            sellCurrency: activeRatePlan.currencyCode,
            sellAmountCents: cents,
          },
        ])
      }
      const cap = Number(capacity)
      if (!Number.isFinite(cap) || cap < 0) throw new Error("Enter a capacity")
      return bulkUpsertInventory([{ roomTypeId, from, to, weekdays: mask, capacity: cap, closed }])
    },
    onSuccess: (res) => {
      toast.success(m.applied(res?.data.upserted ?? 0))
      void queryClient.invalidateQueries({ queryKey: ariKeys.all })
      void queryClient.invalidateQueries({
        queryKey: ariKeys.calendar(propertyId, grid.from, grid.to),
      })
      onOpenChange(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label={m.target} htmlFor="bulk-target">
            <Select value={target} onValueChange={(v) => setTarget((v ?? "rates") as Target)}>
              <SelectTrigger id="bulk-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rates">{m.rates}</SelectItem>
                <SelectItem value="inventory">{m.inventory}</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label={m.roomType} htmlFor="bulk-room-type">
            <Select value={roomTypeId} onValueChange={(v) => setRoomTypeId(v ?? "")}>
              <SelectTrigger id="bulk-room-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {grid.roomTypes.map((rt) => (
                  <SelectItem key={rt.id} value={rt.id}>
                    {rt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {target === "rates" ? (
            <Field label={m.ratePlan} htmlFor="bulk-rate-plan">
              <Select
                value={activeRatePlan?.id ?? ""}
                onValueChange={(v) => setRatePlanId(v ?? "")}
              >
                <SelectTrigger id="bulk-rate-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {attachedRatePlans.map((rp) => (
                    <SelectItem key={rp.id} value={rp.id}>
                      {rp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label={m.from} htmlFor="bulk-from">
              <Input
                id="bulk-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label={m.to} htmlFor="bulk-to">
              <Input id="bulk-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm">{m.weekdays}</span>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <div
                  key={d.iso}
                  className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm"
                >
                  <Checkbox
                    id={`bulk-wd-${d.iso}`}
                    checked={weekdays.includes(d.iso)}
                    onCheckedChange={() => toggleWeekday(d.iso)}
                  />
                  <label htmlFor={`bulk-wd-${d.iso}`}>{d.label}</label>
                </div>
              ))}
            </div>
            <span className="text-muted-foreground text-xs">{m.allDays}</span>
          </div>

          {target === "rates" ? (
            <Field
              label={`${m.sellPrice} (${activeRatePlan?.currencyCode ?? ""})`}
              htmlFor="bulk-price"
            >
              <Input
                id="bulk-price"
                type="number"
                min={0}
                step="0.01"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
              />
            </Field>
          ) : (
            <div className="flex flex-col gap-3">
              <Field label={m.capacity} htmlFor="bulk-capacity">
                <Input
                  id="bulk-capacity"
                  type="number"
                  min={0}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                />
              </Field>
              <SwitchRow id="bulk-closed" label={m.closed} checked={closed} onChange={setClosed} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {ariMessages.common.cancel}
          </Button>
          <Button onClick={() => apply.mutate()} disabled={apply.isPending || !roomTypeId}>
            {m.apply}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
