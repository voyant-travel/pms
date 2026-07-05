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

import type { RoomType } from "../ari/ari-client"
import { Field, SwitchRow } from "../ari/ari-form"
import {
  createRoomUnit,
  frontDeskKeys,
  type RoomUnit,
  type RoomUnitStatus,
  updateRoomUnit,
} from "./front-desk-client"
import { frontDeskMessages } from "./front-desk-messages"

const STATUS_ORDER: RoomUnitStatus[] = ["available", "out_of_order", "out_of_service"]

interface FormState {
  unitNumber: string
  name: string
  roomTypeId: string
  floor: string
  wing: string
  status: RoomUnitStatus
  notes: string
  active: boolean
}

function toForm(unit: RoomUnit | null, roomTypes: RoomType[]): FormState {
  return {
    unitNumber: unit?.unitNumber ?? "",
    name: unit?.name ?? "",
    roomTypeId: unit?.roomTypeId ?? roomTypes[0]?.id ?? "",
    floor: unit?.floor ?? "",
    wing: unit?.wing ?? "",
    status: unit?.status ?? "available",
    notes: unit?.notes ?? "",
    active: unit?.active ?? true,
  }
}

export function UnitDialog({
  propertyId,
  unit,
  roomTypes,
  open,
  onOpenChange,
}: {
  propertyId: string
  unit: RoomUnit | null
  roomTypes: RoomType[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const m = frontDeskMessages
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() => toForm(unit, roomTypes))

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        unitNumber: form.unitNumber.trim(),
        name: form.name.trim() || null,
        roomTypeId: form.roomTypeId,
        floor: form.floor.trim() || null,
        wing: form.wing.trim() || null,
        status: form.status,
        notes: form.notes.trim() || null,
        active: form.active,
      }
      if (unit) return updateRoomUnit(unit.id, payload)
      return createRoomUnit({ ...payload, propertyId })
    },
    onSuccess: () => {
      toast.success(m.common.savedToast)
      void queryClient.invalidateQueries({ queryKey: frontDeskKeys.units(propertyId) })
      onOpenChange(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : m.common.loadFailed),
  })

  const canSave = form.unitNumber.trim().length > 0 && form.roomTypeId.length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(toForm(unit, roomTypes))
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{unit ? m.units.editTitle : m.units.new}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={m.units.unitNumber} htmlFor="unit-number">
              <Input
                id="unit-number"
                value={form.unitNumber}
                onChange={(e) => set("unitNumber", e.target.value)}
              />
            </Field>
            <Field label={m.units.name} htmlFor="unit-name">
              <Input
                id="unit-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
          </div>

          <Field label={m.units.roomType} htmlFor="unit-room-type">
            <Select value={form.roomTypeId} onValueChange={(v) => set("roomTypeId", v ?? "")}>
              <SelectTrigger id="unit-room-type">
                <SelectValue placeholder={m.units.roomType} />
              </SelectTrigger>
              <SelectContent>
                {roomTypes.map((rt) => (
                  <SelectItem key={rt.id} value={rt.id}>
                    {rt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label={m.units.floor} htmlFor="unit-floor">
              <Input
                id="unit-floor"
                value={form.floor}
                onChange={(e) => set("floor", e.target.value)}
              />
            </Field>
            <Field label={m.units.wing} htmlFor="unit-wing">
              <Input
                id="unit-wing"
                value={form.wing}
                onChange={(e) => set("wing", e.target.value)}
              />
            </Field>
            <Field label={m.units.status} htmlFor="unit-status">
              <Select
                value={form.status}
                onValueChange={(v) => set("status", (v ?? "available") as RoomUnitStatus)}
              >
                <SelectTrigger id="unit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {m.units.statusLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label={m.units.notes} htmlFor="unit-notes">
            <Textarea
              id="unit-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>

          <SwitchRow
            id="unit-active"
            label={m.common.active}
            checked={form.active}
            onChange={(v) => set("active", v)}
          />
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
