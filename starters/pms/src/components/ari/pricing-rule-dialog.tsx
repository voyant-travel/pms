"use client"

/**
 * Create/edit dialog for a pricing rule, written for a non-technical manager:
 * a Season / Days-of-week toggle, a friendly "Increase by % / Set exact price"
 * adjustment picker, and scope pickers that show room / plan NAMES (an empty
 * selection means "everything"). The UI's signed `mode` decomposes into the
 * stored `adjustmentType` + signed `adjustmentValue` on save.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
import { toFriendlyError } from "@/lib/friendly-error"

import {
  ariKeys,
  createPricingRule,
  listRatePlans,
  listRoomTypes,
  type PricingRule,
  updatePricingRule,
} from "./ari-client"
import { Field, SwitchRow } from "./ari-form"
import { ariMessages } from "./ari-messages"

type AdjustmentMode = "increase_pct" | "decrease_pct" | "add" | "subtract" | "set"
const MONEY_MODES: AdjustmentMode[] = ["add", "subtract", "set"]

const WEEKDAYS: { iso: number; label: string }[] = [
  { iso: 1, label: "Mon" },
  { iso: 2, label: "Tue" },
  { iso: 3, label: "Wed" },
  { iso: 4, label: "Thu" },
  { iso: 5, label: "Fri" },
  { iso: 6, label: "Sat" },
  { iso: 7, label: "Sun" },
]

interface FormState {
  name: string
  kind: "season" | "weekday"
  fromDate: string
  toDate: string
  weekdays: number[]
  mode: AdjustmentMode
  amount: string
  roomTypeIds: string[]
  ratePlanIds: string[]
  priority: number
  active: boolean
}

function centsToEuros(cents: number): string {
  const whole = cents / 100
  return Number.isInteger(whole) ? String(whole) : whole.toFixed(2)
}

function deriveMode(rule: PricingRule): { mode: AdjustmentMode; amount: string } {
  const v = rule.adjustmentValue
  if (rule.adjustmentType === "set") return { mode: "set", amount: centsToEuros(v) }
  if (rule.adjustmentType === "percent") {
    return { mode: v >= 0 ? "increase_pct" : "decrease_pct", amount: String(Math.abs(v)) }
  }
  return { mode: v >= 0 ? "add" : "subtract", amount: centsToEuros(Math.abs(v)) }
}

function toForm(rule: PricingRule | null): FormState {
  if (!rule) {
    return {
      name: "",
      kind: "season",
      fromDate: "",
      toDate: "",
      weekdays: [6, 7],
      mode: "increase_pct",
      amount: "",
      roomTypeIds: [],
      ratePlanIds: [],
      priority: 0,
      active: true,
    }
  }
  const { mode, amount } = deriveMode(rule)
  return {
    name: rule.name,
    kind: rule.kind,
    fromDate: rule.fromDate ?? "",
    toDate: rule.toDate ?? "",
    weekdays: rule.weekdays ?? [],
    mode,
    amount,
    roomTypeIds: rule.roomTypeIds ?? [],
    ratePlanIds: rule.ratePlanIds ?? [],
    priority: rule.priority ?? 0,
    active: rule.active ?? true,
  }
}

/** Decompose the UI mode + amount into a stored (type, signed value). */
function buildAdjustment(mode: AdjustmentMode, amount: string) {
  const n = Number(amount.trim())
  const magnitude = Number.isFinite(n) && n >= 0 ? n : 0
  switch (mode) {
    case "increase_pct":
      return { adjustmentType: "percent" as const, adjustmentValue: Math.round(magnitude) }
    case "decrease_pct":
      return { adjustmentType: "percent" as const, adjustmentValue: -Math.round(magnitude) }
    case "add":
      return { adjustmentType: "absolute" as const, adjustmentValue: Math.round(magnitude * 100) }
    case "subtract":
      return { adjustmentType: "absolute" as const, adjustmentValue: -Math.round(magnitude * 100) }
    case "set":
      return { adjustmentType: "set" as const, adjustmentValue: Math.round(magnitude * 100) }
  }
}

export function PricingRuleDialog({
  propertyId,
  rule,
  open,
  onOpenChange,
}: {
  propertyId: string
  rule: PricingRule | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const m = ariMessages.pricing.rules
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() => toForm(rule))

  const roomTypesQuery = useQuery({
    queryKey: ariKeys.roomTypes(propertyId),
    queryFn: () => listRoomTypes(propertyId),
    enabled: open,
  })
  const ratePlansQuery = useQuery({
    queryKey: ariKeys.ratePlans(propertyId),
    queryFn: () => listRatePlans(propertyId),
    enabled: open,
  })
  const roomTypes = roomTypesQuery.data?.data ?? []
  const ratePlans = ratePlansQuery.data?.data ?? []

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const toggleId = (key: "roomTypeIds" | "ratePlanIds", id: string) =>
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(id) ? prev[key].filter((x) => x !== id) : [...prev[key], id],
    }))

  const toggleWeekday = (iso: number) =>
    setForm((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(iso)
        ? prev.weekdays.filter((x) => x !== iso)
        : [...prev.weekdays, iso].sort((a, b) => a - b),
    }))

  const isMoney = MONEY_MODES.includes(form.mode)

  const save = useMutation({
    mutationFn: async () => {
      const { adjustmentType, adjustmentValue } = buildAdjustment(form.mode, form.amount)
      const payload = {
        name: form.name.trim(),
        kind: form.kind,
        fromDate: form.fromDate || null,
        toDate: form.toDate || null,
        weekdays: form.kind === "weekday" ? form.weekdays : null,
        adjustmentType,
        adjustmentValue,
        roomTypeIds: form.roomTypeIds.length ? form.roomTypeIds : null,
        ratePlanIds: form.ratePlanIds.length ? form.ratePlanIds : null,
        priority: form.priority,
        active: form.active,
      }
      if (rule) return updatePricingRule(rule.id, payload)
      return createPricingRule({ ...payload, propertyId })
    },
    onSuccess: () => {
      toast.success(ariMessages.common.savedToast)
      void queryClient.invalidateQueries({ queryKey: ariKeys.pricingRules(propertyId) })
      onOpenChange(false)
    },
    onError: (err) => toast.error(toFriendlyError(err, ariMessages.common.loadFailed)),
  })

  const seasonInvalid = form.kind === "season" && (!form.fromDate || !form.toDate)
  const weekdayInvalid = form.kind === "weekday" && form.weekdays.length === 0
  const invalid = !form.name.trim() || !form.amount.trim() || seasonInvalid || weekdayInvalid

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(toForm(rule))
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? m.editTitle : m.new}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label={m.name} htmlFor="rule-name">
            <Input
              id="rule-name"
              value={form.name}
              placeholder={m.namePlaceholder}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>

          <Field label={m.kind} htmlFor="rule-kind">
            <Select
              value={form.kind}
              onValueChange={(v) => set("kind", (v ?? "season") as FormState["kind"])}
            >
              <SelectTrigger id="rule-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="season">{m.kindSeason}</SelectItem>
                <SelectItem value="weekday">{m.kindWeekday}</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {form.kind === "season" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={m.from} htmlFor="rule-from">
                <Input
                  id="rule-from"
                  type="date"
                  value={form.fromDate}
                  onChange={(e) => set("fromDate", e.target.value)}
                />
              </Field>
              <Field label={m.to} htmlFor="rule-to">
                <Input
                  id="rule-to"
                  type="date"
                  value={form.toDate}
                  onChange={(e) => set("toDate", e.target.value)}
                />
              </Field>
            </div>
          ) : (
            <Field label={m.days}>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => {
                  const on = form.weekdays.includes(d.iso)
                  return (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => toggleWeekday(d.iso)}
                      className={`rounded-md border px-3 py-1.5 text-sm ${
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background"
                      }`}
                    >
                      {d.label}
                    </button>
                  )
                })}
              </div>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={m.adjustment} htmlFor="rule-mode">
              <Select
                value={form.mode}
                onValueChange={(v) => set("mode", (v ?? "increase_pct") as AdjustmentMode)}
              >
                <SelectTrigger id="rule-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="increase_pct">{m.increaseBy}</SelectItem>
                  <SelectItem value="decrease_pct">{m.decreaseBy}</SelectItem>
                  <SelectItem value="add">{m.addAmount}</SelectItem>
                  <SelectItem value="subtract">{m.subtractAmount}</SelectItem>
                  <SelectItem value="set">{m.setPrice}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={isMoney ? m.amountMoney : m.amountPercent} htmlFor="rule-amount">
              <Input
                id="rule-amount"
                inputMode="decimal"
                value={form.amount}
                placeholder={isMoney ? "€ per night" : "%"}
                onChange={(e) => set("amount", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-md border p-3">
            <div>
              <p className="mb-2 text-sm font-medium">{m.rooms}</p>
              <p className="mb-2 text-muted-foreground text-xs">
                {form.roomTypeIds.length === 0 ? m.allRooms : `${form.roomTypeIds.length} selected`}
              </p>
              <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                {roomTypes.map((rt) => (
                  <label
                    key={rt.id}
                    htmlFor={`rule-room-${rt.id}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      id={`rule-room-${rt.id}`}
                      checked={form.roomTypeIds.includes(rt.id)}
                      onCheckedChange={() => toggleId("roomTypeIds", rt.id)}
                    />
                    {rt.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">{m.plans}</p>
              <p className="mb-2 text-muted-foreground text-xs">
                {form.ratePlanIds.length === 0 ? m.allPlans : `${form.ratePlanIds.length} selected`}
              </p>
              <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                {ratePlans.map((rp) => (
                  <label
                    key={rp.id}
                    htmlFor={`rule-plan-${rp.id}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      id={`rule-plan-${rp.id}`}
                      checked={form.ratePlanIds.includes(rp.id)}
                      onCheckedChange={() => toggleId("ratePlanIds", rp.id)}
                    />
                    {rp.name}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 items-end gap-3">
            <Field label={m.priority} htmlFor="rule-priority">
              <Input
                id="rule-priority"
                type="number"
                min={0}
                value={form.priority}
                onChange={(e) => set("priority", Math.max(0, Number(e.target.value) || 0))}
              />
              <span className="text-muted-foreground text-xs">{m.priorityHint}</span>
            </Field>
            <div className="rounded-md border p-3">
              <SwitchRow
                id="rule-active"
                label={m.active}
                checked={form.active}
                onChange={(v) => set("active", v)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {ariMessages.common.cancel}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || invalid}>
            {ariMessages.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
