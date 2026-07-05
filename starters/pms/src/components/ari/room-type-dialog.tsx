"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { InsertRoomTypeInput } from "@voyant-travel/pms-ari"
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
import { ariKeys, createRoomType, type RoomType, updateRoomType } from "./ari-client"
import { INVENTORY_MODE_OPTIONS } from "./ari-constants"
import { Field, SwitchRow } from "./ari-form"
import { ariMessages } from "./ari-messages"
import { BedConfigsEditor } from "./bed-configs-editor"

type InventoryMode = NonNullable<InsertRoomTypeInput["inventoryMode"]>

interface FormState {
  code: string
  name: string
  description: string
  inventoryMode: InventoryMode
  maxAdults: string
  maxChildren: string
  standardOccupancy: string
  maxOccupancy: string
  bedroomCount: string
  bathroomCount: string
  areaValue: string
  areaUnit: string
  active: boolean
}

const numStr = (n: number | null | undefined): string => (n == null ? "" : String(n))
const numOrNull = (s: string): number | null => {
  const t = s.trim()
  if (t === "") return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function toForm(rt: RoomType | null): FormState {
  return {
    code: rt?.code ?? "",
    name: rt?.name ?? "",
    description: rt?.description ?? "",
    inventoryMode: rt?.inventoryMode ?? "pooled",
    maxAdults: numStr(rt?.maxAdults),
    maxChildren: numStr(rt?.maxChildren),
    standardOccupancy: numStr(rt?.standardOccupancy),
    maxOccupancy: numStr(rt?.maxOccupancy),
    bedroomCount: numStr(rt?.bedroomCount),
    bathroomCount: numStr(rt?.bathroomCount),
    areaValue: numStr(rt?.areaValue),
    areaUnit: rt?.areaUnit ?? "",
    active: rt?.active ?? true,
  }
}

export function RoomTypeDialog({
  propertyId,
  roomType,
  open,
  onOpenChange,
}: {
  propertyId: string
  roomType: RoomType | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const m = ariMessages
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() => toForm(roomType))

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim() || null,
        name: form.name.trim(),
        description: form.description || null,
        inventoryMode: form.inventoryMode,
        maxAdults: numOrNull(form.maxAdults),
        maxChildren: numOrNull(form.maxChildren),
        standardOccupancy: numOrNull(form.standardOccupancy),
        maxOccupancy: numOrNull(form.maxOccupancy),
        bedroomCount: numOrNull(form.bedroomCount),
        bathroomCount: numOrNull(form.bathroomCount),
        areaValue: numOrNull(form.areaValue),
        areaUnit: form.areaUnit.trim() || null,
        active: form.active,
      }
      if (roomType) return updateRoomType(roomType.id, payload)
      return createRoomType({ ...payload, propertyId })
    },
    onSuccess: () => {
      toast.success(m.common.savedToast)
      void queryClient.invalidateQueries({ queryKey: ariKeys.roomTypes(propertyId) })
      onOpenChange(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : m.common.loadFailed),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(toForm(roomType))
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{roomType ? m.roomTypes.editTitle : m.roomTypes.new}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={m.common.code} htmlFor="rt-code">
              <Input id="rt-code" value={form.code} onChange={(e) => set("code", e.target.value)} />
            </Field>
            <Field label={m.roomTypes.inventoryMode} htmlFor="rt-inv">
              <Select
                value={form.inventoryMode}
                onValueChange={(v) => set("inventoryMode", (v ?? "pooled") as InventoryMode)}
              >
                <SelectTrigger id="rt-inv">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVENTORY_MODE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label={m.common.name} htmlFor="rt-name">
            <Input id="rt-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label={m.common.description} htmlFor="rt-desc">
            <Textarea
              id="rt-desc"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>

          <fieldset className="grid grid-cols-2 gap-3 rounded-md border p-3 md:grid-cols-4">
            <legend className="px-1 text-xs font-medium">{m.roomTypes.occupancy}</legend>
            <Field label={m.roomTypes.maxAdults} htmlFor="rt-adults">
              <Input
                id="rt-adults"
                type="number"
                min={0}
                value={form.maxAdults}
                onChange={(e) => set("maxAdults", e.target.value)}
              />
            </Field>
            <Field label={m.roomTypes.maxChildren} htmlFor="rt-children">
              <Input
                id="rt-children"
                type="number"
                min={0}
                value={form.maxChildren}
                onChange={(e) => set("maxChildren", e.target.value)}
              />
            </Field>
            <Field label={m.roomTypes.standardOccupancy} htmlFor="rt-std">
              <Input
                id="rt-std"
                type="number"
                min={0}
                value={form.standardOccupancy}
                onChange={(e) => set("standardOccupancy", e.target.value)}
              />
            </Field>
            <Field label={m.roomTypes.maxOccupancy} htmlFor="rt-max">
              <Input
                id="rt-max"
                type="number"
                min={0}
                value={form.maxOccupancy}
                onChange={(e) => set("maxOccupancy", e.target.value)}
              />
            </Field>
          </fieldset>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label={m.roomTypes.bedrooms} htmlFor="rt-bed">
              <Input
                id="rt-bed"
                type="number"
                min={0}
                value={form.bedroomCount}
                onChange={(e) => set("bedroomCount", e.target.value)}
              />
            </Field>
            <Field label={m.roomTypes.bathrooms} htmlFor="rt-bath">
              <Input
                id="rt-bath"
                type="number"
                min={0}
                value={form.bathroomCount}
                onChange={(e) => set("bathroomCount", e.target.value)}
              />
            </Field>
            <Field label={m.roomTypes.area} htmlFor="rt-area">
              <Input
                id="rt-area"
                type="number"
                min={0}
                value={form.areaValue}
                onChange={(e) => set("areaValue", e.target.value)}
              />
            </Field>
            <Field label={m.roomTypes.areaUnit} htmlFor="rt-area-unit">
              <Input
                id="rt-area-unit"
                placeholder="m²"
                value={form.areaUnit}
                onChange={(e) => set("areaUnit", e.target.value)}
              />
            </Field>
          </div>

          <SwitchRow
            id="rt-active"
            label={m.common.active}
            checked={form.active}
            onChange={(v) => set("active", v)}
          />

          {roomType ? (
            <div className="border-t pt-4">
              <BedConfigsEditor roomTypeId={roomType.id} />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {m.common.cancel}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>
            {m.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
