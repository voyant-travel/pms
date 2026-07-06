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
import { Switch } from "@voyant-travel/ui/components/switch"
import { Textarea } from "@voyant-travel/ui/components/textarea"
import { useState } from "react"
import { toast } from "sonner"

import type { PropertyOption } from "../ari/ari-client"
import { Field } from "../ari/ari-form"
import {
  createStaff,
  housekeepingKeys,
  STAFF_ROLES,
  type Staff,
  type StaffRole,
  updateStaff,
} from "./housekeeping-client"
import { housekeepingMessages } from "./housekeeping-messages"

const ALL_PROPERTIES = "__all__"

interface FormState {
  name: string
  role: StaffRole
  propertyId: string
  active: boolean
  notes: string
}

function toForm(staff: Staff | null): FormState {
  return {
    name: staff?.name ?? "",
    role: staff?.role ?? "housekeeper",
    propertyId: staff?.propertyId ?? "",
    active: staff?.active ?? true,
    notes: staff?.notes ?? "",
  }
}

/** Create / edit a non-login staff member (the assignee pool for tasks). */
export function StaffDialog({
  staff,
  properties,
  open,
  onOpenChange,
}: {
  staff: Staff | null
  properties: PropertyOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const m = housekeepingMessages
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() => toForm(staff))

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const save = useMutation({
    mutationFn: () => {
      const propertyId = form.propertyId || null
      if (staff) {
        return updateStaff(staff.id, {
          name: form.name.trim(),
          role: form.role,
          propertyId,
          active: form.active,
          notes: form.notes.trim() || null,
        })
      }
      return createStaff({
        name: form.name.trim(),
        role: form.role,
        propertyId,
        notes: form.notes.trim() || null,
      })
    },
    onSuccess: () => {
      toast.success(m.common.savedToast)
      void queryClient.invalidateQueries({ queryKey: housekeepingKeys.all })
      onOpenChange(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : m.common.loadFailed),
  })

  const canSave = form.name.trim().length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(toForm(staff))
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{staff ? m.staff.editTitle : m.staff.newTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label={m.staff.name} htmlFor="staff-name">
            <Input
              id="staff-name"
              value={form.name}
              placeholder={m.staff.namePlaceholder}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={m.staff.role} htmlFor="staff-role">
              <Select
                value={form.role}
                onValueChange={(v) => set("role", (v ?? "housekeeper") as StaffRole)}
              >
                <SelectTrigger id="staff-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {m.staff.roleLabels[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={m.staff.property} htmlFor="staff-property">
              <Select
                value={form.propertyId || ALL_PROPERTIES}
                onValueChange={(v) => set("propertyId", v === ALL_PROPERTIES ? "" : (v ?? ""))}
              >
                <SelectTrigger id="staff-property" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_PROPERTIES}>{m.staff.allProperties}</SelectItem>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {staff ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm font-medium">{m.staff.active}</span>
              <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
            </div>
          ) : null}

          <Field label={m.staff.notes} htmlFor="staff-notes">
            <Textarea
              id="staff-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
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
