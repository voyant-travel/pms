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
import { Textarea } from "@voyant-travel/ui/components/textarea"
import { useState } from "react"
import { toast } from "sonner"

import { ariKeys, createMealPlan, type MealPlan, updateMealPlan } from "./ari-client"
import { Field, SwitchRow } from "./ari-form"
import { ariMessages } from "./ari-messages"

interface FormState {
  code: string
  name: string
  description: string
  includesBreakfast: boolean
  includesLunch: boolean
  includesDinner: boolean
  includesDrinks: boolean
  active: boolean
}

function toForm(plan: MealPlan | null): FormState {
  return {
    code: plan?.code ?? "",
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    includesBreakfast: plan?.includesBreakfast ?? false,
    includesLunch: plan?.includesLunch ?? false,
    includesDinner: plan?.includesDinner ?? false,
    includesDrinks: plan?.includesDrinks ?? false,
    active: plan?.active ?? true,
  }
}

export function MealPlanDialog({
  propertyId,
  plan,
  open,
  onOpenChange,
}: {
  propertyId: string
  plan: MealPlan | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const m = ariMessages
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() => toForm(plan))

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, description: form.description || null }
      if (plan) return updateMealPlan(plan.id, payload)
      return createMealPlan({ ...payload, propertyId })
    },
    onSuccess: () => {
      toast.success(m.common.savedToast)
      void queryClient.invalidateQueries({ queryKey: ariKeys.mealPlans(propertyId) })
      onOpenChange(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : m.common.loadFailed),
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(toForm(plan))
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{plan ? m.mealPlans.editTitle : m.mealPlans.new}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={m.common.code} htmlFor="mp-code">
              <Input id="mp-code" value={form.code} onChange={(e) => set("code", e.target.value)} />
            </Field>
            <Field label={m.common.name} htmlFor="mp-name">
              <Input id="mp-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
          </div>
          <Field label={m.common.description} htmlFor="mp-desc">
            <Textarea
              id="mp-desc"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
            <SwitchRow
              id="mp-breakfast"
              label={m.mealPlans.breakfast}
              checked={form.includesBreakfast}
              onChange={(v) => set("includesBreakfast", v)}
            />
            <SwitchRow
              id="mp-lunch"
              label={m.mealPlans.lunch}
              checked={form.includesLunch}
              onChange={(v) => set("includesLunch", v)}
            />
            <SwitchRow
              id="mp-dinner"
              label={m.mealPlans.dinner}
              checked={form.includesDinner}
              onChange={(v) => set("includesDinner", v)}
            />
            <SwitchRow
              id="mp-drinks"
              label={m.mealPlans.drinks}
              checked={form.includesDrinks}
              onChange={(v) => set("includesDrinks", v)}
            />
          </div>
          <SwitchRow
            id="mp-active"
            label={m.common.active}
            checked={form.active}
            onChange={(v) => set("active", v)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {m.common.cancel}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.code.trim() || !form.name.trim()}
          >
            {m.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
