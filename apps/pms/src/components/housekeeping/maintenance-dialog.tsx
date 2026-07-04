"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@voyant-travel/ui/components/button"
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
import { Textarea } from "@voyant-travel/ui/components/textarea"
import { useState } from "react"
import { toast } from "sonner"
import { Field } from "../ari/ari-form"
import type { RoomUnit } from "../front-desk/front-desk-client"
import { todayIso } from "../front-desk/front-desk-dates"
import {
  createMaintenanceBlock,
  housekeepingKeys,
  type MaintenanceBlock,
  type MaintenanceMutationResult,
  type MaintenanceReason,
  updateMaintenanceBlock,
} from "./housekeeping-client"
import { housekeepingMessages } from "./housekeeping-messages"

const REASONS: MaintenanceReason[] = ["maintenance", "renovation", "deep_clean", "other"]

interface FormState {
  unitId: string
  fromDate: string
  toDate: string
  reason: MaintenanceReason
  description: string
}

function toForm(block: MaintenanceBlock | null, units: RoomUnit[]): FormState {
  const today = todayIso()
  return {
    unitId: block?.unitId ?? units[0]?.id ?? "",
    fromDate: block?.fromDate ?? today,
    toDate: block?.toDate ?? today,
    reason: block?.reason ?? "maintenance",
    description: block?.description ?? "",
  }
}

/** Create / edit a maintenance block (PLAN §4.3). Edit keeps the unit fixed. */
export function MaintenanceDialog({
  propertyId,
  block,
  units,
  open,
  onOpenChange,
}: {
  propertyId: string
  block: MaintenanceBlock | null
  units: RoomUnit[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const m = housekeepingMessages
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() => toForm(block, units))

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const onDone = (result: MaintenanceMutationResult) => {
    toast.success(m.common.savedToast)
    if (result.recomputedRoomTypeId) toast.info(m.maintenance.recomputed)
    void queryClient.invalidateQueries({ queryKey: housekeepingKeys.all })
    onOpenChange(false)
  }

  const save = useMutation({
    mutationFn: () => {
      if (block) {
        return updateMaintenanceBlock(block.id, {
          fromDate: form.fromDate,
          toDate: form.toDate,
          reason: form.reason,
          description: form.description.trim() || null,
        })
      }
      return createMaintenanceBlock({
        unitId: form.unitId,
        propertyId,
        fromDate: form.fromDate,
        toDate: form.toDate,
        reason: form.reason,
        description: form.description.trim() || null,
      })
    },
    onSuccess: onDone,
    onError: (err) => toast.error(err instanceof Error ? err.message : m.common.loadFailed),
  })

  const canSave =
    form.unitId.length > 0 &&
    form.fromDate.length > 0 &&
    form.toDate.length > 0 &&
    form.toDate >= form.fromDate

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(toForm(block, units))
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{block ? m.maintenance.editTitle : m.maintenance.newTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label={m.maintenance.unit} htmlFor="block-unit">
            <Select
              value={form.unitId}
              onValueChange={(v) => set("unitId", v ?? "")}
              disabled={block !== null}
            >
              <SelectTrigger id="block-unit">
                <SelectValue placeholder={m.maintenance.pickUnit} />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.unitNumber}
                    {unit.name ? ` · ${unit.name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={m.maintenance.fromDate} htmlFor="block-from">
              <Input
                id="block-from"
                type="date"
                value={form.fromDate}
                onChange={(e) => set("fromDate", e.target.value)}
              />
            </Field>
            <Field label={m.maintenance.toDate} htmlFor="block-to">
              <Input
                id="block-to"
                type="date"
                value={form.toDate}
                onChange={(e) => set("toDate", e.target.value)}
              />
            </Field>
          </div>

          <Field label={m.maintenance.reason} htmlFor="block-reason">
            <Select
              value={form.reason}
              onValueChange={(v) => set("reason", (v ?? "maintenance") as MaintenanceReason)}
            >
              <SelectTrigger id="block-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {m.maintenance.reasonLabels[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label={m.maintenance.description} htmlFor="block-description">
            <Textarea
              id="block-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {m.common.cancel}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !canSave}>
            {m.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
