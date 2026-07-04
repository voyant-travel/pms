"use client"

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
import { useState } from "react"

import { Field } from "../ari/ari-form"
import { todayIso } from "../front-desk/front-desk-dates"
import { MANUAL_POSTING_TYPES, type ManualPostingType } from "./folios-client"
import { foliosMessages } from "./folios-messages"
import { inputToCents } from "./folios-model"
import { useFolioMutations } from "./use-folio-mutations"

interface FormState {
  type: ManualPostingType
  description: string
  amount: string
  quantity: string
  businessDate: string
}

function initialForm(businessDate: string): FormState {
  return { type: "extra", description: "", amount: "", quantity: "1", businessDate }
}

/** Add a manual charge / adjustment / payment to an open folio (ADR 0001). */
export function PostingDialog({
  folioId,
  currency,
  defaultBusinessDate,
  open,
  onOpenChange,
}: {
  folioId: string
  currency: string
  defaultBusinessDate?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const m = foliosMessages
  const fallbackDate = defaultBusinessDate ?? todayIso()
  const [form, setForm] = useState<FormState>(() => initialForm(fallbackDate))
  const { addPosting } = useFolioMutations()

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const amountCents = inputToCents(form.amount)
  const quantity = Math.max(1, Math.trunc(Number(form.quantity) || 1))
  const canSave =
    form.description.trim().length > 0 &&
    amountCents !== null &&
    amountCents !== 0 &&
    form.businessDate.length > 0

  const submit = () => {
    if (amountCents === null || amountCents === 0) return
    addPosting.mutate(
      {
        id: folioId,
        input: {
          type: form.type,
          description: form.description.trim(),
          amountCents,
          quantity,
          businessDate: form.businessDate,
        },
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(initialForm(fallbackDate))
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.postingDialog.title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label={m.postingDialog.type} htmlFor="posting-type">
            <Select
              value={form.type}
              onValueChange={(v) => set("type", (v ?? "extra") as ManualPostingType)}
            >
              <SelectTrigger id="posting-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_POSTING_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {m.detail.postingType[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label={m.postingDialog.description} htmlFor="posting-description">
            <Input
              id="posting-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              maxLength={500}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={`${m.postingDialog.amount} (${currency})`} htmlFor="posting-amount">
              <Input
                id="posting-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
              />
            </Field>
            <Field label={m.postingDialog.quantity} htmlFor="posting-quantity">
              <Input
                id="posting-quantity"
                type="number"
                min={1}
                step={1}
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
              />
            </Field>
          </div>

          <Field label={m.postingDialog.businessDate} htmlFor="posting-date">
            <Input
              id="posting-date"
              type="date"
              value={form.businessDate}
              onChange={(e) => set("businessDate", e.target.value || fallbackDate)}
            />
          </Field>

          <p className="text-muted-foreground text-xs">{m.postingDialog.amountHint}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {m.common.cancel}
          </Button>
          <Button onClick={submit} disabled={addPosting.isPending || !canSave}>
            {m.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
