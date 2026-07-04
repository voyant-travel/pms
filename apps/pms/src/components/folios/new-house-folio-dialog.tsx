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
import { useState } from "react"

import { Field } from "../ari/ari-form"
import { foliosMessages } from "./folios-messages"
import { useFolioMutations } from "./use-folio-mutations"

/** Open a house-account folio (kind `house`, no booking) for a property. */
export function NewHouseFolioDialog({
  propertyId,
  defaultCurrency,
  open,
  onOpenChange,
}: {
  propertyId: string
  defaultCurrency?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const m = foliosMessages
  const [guestName, setGuestName] = useState("")
  const [currency, setCurrency] = useState(defaultCurrency ?? "EUR")
  const { openHouse } = useFolioMutations()

  const reset = () => {
    setGuestName("")
    setCurrency(defaultCurrency ?? "EUR")
  }

  const canSave = currency.trim().length === 3
  const submit = () => {
    if (!canSave) return
    openHouse.mutate(
      {
        propertyId,
        kind: "house",
        currency: currency.trim().toUpperCase(),
        guestName: guestName.trim() || null,
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{m.newHouseDialog.title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label={m.newHouseDialog.guest} htmlFor="house-guest">
            <Input
              id="house-guest"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder={m.newHouseDialog.guestPlaceholder}
            />
          </Field>
          <Field label={m.newHouseDialog.currency} htmlFor="house-currency">
            <Input
              id="house-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
              maxLength={3}
              className="w-24 uppercase"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {m.common.cancel}
          </Button>
          <Button onClick={submit} disabled={openHouse.isPending || !canSave}>
            {m.newHouseDialog.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
