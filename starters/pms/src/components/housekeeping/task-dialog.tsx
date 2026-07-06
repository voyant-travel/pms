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
import { IsoDateField } from "../admin-shared/iso-date-field"
import { Field } from "../ari/ari-form"
import type { RoomUnit } from "../front-desk/front-desk-client"
import { createTask, housekeepingKeys, type TaskType } from "./housekeeping-client"
import { housekeepingMessages } from "./housekeeping-messages"

const TASK_TYPES: TaskType[] = ["clean", "inspect", "turndown", "deep_clean"]

interface FormState {
  unitId: string
  type: TaskType
  dueDate: string
  priority: string
  assigneeUserId: string
  notes: string
}

function initialForm(units: RoomUnit[], date: string): FormState {
  return {
    unitId: units[0]?.id ?? "",
    type: "clean",
    dueDate: date,
    priority: "0",
    assigneeUserId: "",
    notes: "",
  }
}

/** Create a manual housekeeping task against a unit (PLAN §4.3 board "New task"). */
export function TaskDialog({
  propertyId,
  units,
  date,
  open,
  onOpenChange,
}: {
  propertyId: string
  units: RoomUnit[]
  date: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const m = housekeepingMessages
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() => initialForm(units, date))

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const save = useMutation({
    mutationFn: () => {
      const priority = Number.parseInt(form.priority, 10)
      return createTask({
        unitId: form.unitId,
        propertyId,
        type: form.type,
        priority: Number.isFinite(priority) ? priority : 0,
        assigneeUserId: form.assigneeUserId.trim() || null,
        dueDate: form.dueDate || null,
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

  const canSave = form.unitId.length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(initialForm(units, date))
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.taskDialog.newTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label={m.taskDialog.unit} htmlFor="task-unit">
            <Select value={form.unitId} onValueChange={(v) => set("unitId", v ?? "")}>
              <SelectTrigger id="task-unit" className="w-full">
                <SelectValue placeholder={m.taskDialog.pickUnit} />
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
            <Field label={m.taskDialog.type} htmlFor="task-type">
              <Select
                value={form.type}
                onValueChange={(v) => set("type", (v ?? "clean") as TaskType)}
              >
                <SelectTrigger id="task-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {m.board.taskType[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <IsoDateField
              label={m.taskDialog.dueDate}
              value={form.dueDate}
              onChange={(v) => set("dueDate", v)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={m.taskDialog.priority} htmlFor="task-priority">
              <Input
                id="task-priority"
                type="number"
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
              />
            </Field>
            <Field label={m.taskDialog.assignee} htmlFor="task-assignee">
              <Input
                id="task-assignee"
                value={form.assigneeUserId}
                placeholder={m.taskDialog.assigneePlaceholder}
                onChange={(e) => set("assigneeUserId", e.target.value)}
              />
            </Field>
          </div>

          <Field label={m.taskDialog.notes} htmlFor="task-notes">
            <Textarea
              id="task-notes"
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
