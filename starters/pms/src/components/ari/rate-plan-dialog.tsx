"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { InsertRatePlanInput } from "@voyant-travel/pms-ari"
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
import { toFriendlyError } from "@/lib/friendly-error"
import { ariKeys, createRatePlan, listMealPlans, type RatePlan, updateRatePlan } from "./ari-client"
import { CHARGE_FREQUENCY_OPTIONS, CURRENCY_OPTIONS, GUARANTEE_MODE_OPTIONS } from "./ari-constants"
import { Field, SwitchRow } from "./ari-form"
import { ariMessages } from "./ari-messages"
import { RatePlanRoomTypesEditor } from "./rate-plan-room-types"

type ChargeFrequency = NonNullable<InsertRatePlanInput["chargeFrequency"]>
type GuaranteeMode = NonNullable<InsertRatePlanInput["guaranteeMode"]>

const NO_MEAL_PLAN = "__none__"

interface FormState {
  code: string
  name: string
  description: string
  currencyCode: string
  chargeFrequency: ChargeFrequency
  guaranteeMode: GuaranteeMode
  mealPlanId: string
  refundable: boolean
  commissionable: boolean
  active: boolean
}

function toForm(rp: RatePlan | null): FormState {
  return {
    code: rp?.code ?? "",
    name: rp?.name ?? "",
    description: rp?.description ?? "",
    currencyCode: rp?.currencyCode ?? "EUR",
    chargeFrequency: rp?.chargeFrequency ?? "per_night",
    guaranteeMode: rp?.guaranteeMode ?? "none",
    mealPlanId: rp?.mealPlanId ?? NO_MEAL_PLAN,
    refundable: rp?.refundable ?? true,
    commissionable: rp?.commissionable ?? false,
    active: rp?.active ?? true,
  }
}

export function RatePlanDialog({
  propertyId,
  ratePlan,
  open,
  onOpenChange,
}: {
  propertyId: string
  ratePlan: RatePlan | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const m = ariMessages
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() => toForm(ratePlan))

  const { data: mealPlansData } = useQuery({
    queryKey: ariKeys.mealPlans(propertyId),
    queryFn: () => listMealPlans(propertyId),
    enabled: open,
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description || null,
        currencyCode: form.currencyCode.trim().toUpperCase(),
        chargeFrequency: form.chargeFrequency,
        guaranteeMode: form.guaranteeMode,
        mealPlanId: form.mealPlanId === NO_MEAL_PLAN ? null : form.mealPlanId,
        refundable: form.refundable,
        commissionable: form.commissionable,
        active: form.active,
      }
      if (ratePlan) return updateRatePlan(ratePlan.id, payload)
      return createRatePlan({ ...payload, propertyId })
    },
    onSuccess: () => {
      toast.success(m.common.savedToast)
      void queryClient.invalidateQueries({ queryKey: ariKeys.ratePlans(propertyId) })
      onOpenChange(false)
    },
    onError: (err) => toast.error(toFriendlyError(err, m.common.loadFailed)),
  })

  const mealPlans = mealPlansData?.data ?? []

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(toForm(ratePlan))
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ratePlan ? m.ratePlans.editTitle : m.ratePlans.new}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={m.common.code} htmlFor="rp-code">
              <Input id="rp-code" value={form.code} onChange={(e) => set("code", e.target.value)} />
            </Field>
            <Field label={m.common.name} htmlFor="rp-name">
              <Input id="rp-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
          </div>

          <Field label={m.common.description} htmlFor="rp-desc">
            <Textarea
              id="rp-desc"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label={m.ratePlans.currency} htmlFor="rp-currency">
              <Select
                value={form.currencyCode}
                onValueChange={(v) => set("currencyCode", v ?? "EUR")}
              >
                <SelectTrigger id="rp-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={m.ratePlans.chargeFrequency} htmlFor="rp-charge">
              <Select
                value={form.chargeFrequency}
                onValueChange={(v) => set("chargeFrequency", (v ?? "per_night") as ChargeFrequency)}
              >
                <SelectTrigger id="rp-charge">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHARGE_FREQUENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={m.ratePlans.guaranteeMode} htmlFor="rp-guarantee">
              <Select
                value={form.guaranteeMode}
                onValueChange={(v) => set("guaranteeMode", (v ?? "none") as GuaranteeMode)}
              >
                <SelectTrigger id="rp-guarantee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GUARANTEE_MODE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label={m.ratePlans.mealPlan} htmlFor="rp-meal">
            <Select
              value={form.mealPlanId}
              onValueChange={(v) => set("mealPlanId", v ?? NO_MEAL_PLAN)}
            >
              <SelectTrigger id="rp-meal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MEAL_PLAN}>—</SelectItem>
                {mealPlans.map((mp) => (
                  <SelectItem key={mp.id} value={mp.id}>
                    {mp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-3 gap-3 rounded-md border p-3">
            <SwitchRow
              id="rp-refundable"
              label={m.ratePlans.refundable}
              checked={form.refundable}
              onChange={(v) => set("refundable", v)}
            />
            <SwitchRow
              id="rp-commissionable"
              label={m.ratePlans.commissionable}
              checked={form.commissionable}
              onChange={(v) => set("commissionable", v)}
            />
            <SwitchRow
              id="rp-active"
              label={m.common.active}
              checked={form.active}
              onChange={(v) => set("active", v)}
            />
          </div>

          {ratePlan ? (
            <div className="border-t pt-4">
              <RatePlanRoomTypesEditor ratePlanId={ratePlan.id} propertyId={propertyId} />
            </div>
          ) : null}
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
