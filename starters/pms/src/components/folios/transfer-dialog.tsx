"use client"

import { Button } from "@voyant-travel/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@voyant-travel/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { useState } from "react"

import { Field } from "../ari/ari-form"
import type { Folio, FolioPosting } from "./folios-client"
import { foliosMessages } from "./folios-messages"
import { useFolioMutations } from "./use-folio-mutations"

/** Move a posting to another OPEN folio of the same property + currency. */
export function TransferDialog({
  folioId,
  posting,
  targets,
  open,
  onOpenChange,
}: {
  folioId: string
  posting: FolioPosting | null
  /** Candidate target folios (open, same property/currency, excluding the source). */
  targets: Folio[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const m = foliosMessages
  const [targetFolioId, setTargetFolioId] = useState<string>("")
  const { transfer } = useFolioMutations()

  const submit = () => {
    if (!posting || !targetFolioId) return
    transfer.mutate(
      { id: folioId, postingId: posting.id, targetFolioId },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setTargetFolioId("")
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.transferDialog.title}</DialogTitle>
        </DialogHeader>

        {posting ? (
          <p className="text-muted-foreground text-sm">
            {m.transferDialog.body(posting.description)}
          </p>
        ) : null}

        <div className="flex flex-col gap-4">
          {targets.length === 0 ? (
            <p className="text-muted-foreground text-sm">{m.transferDialog.noTargets}</p>
          ) : (
            <Field label={m.transferDialog.target} htmlFor="transfer-target">
              <Select value={targetFolioId} onValueChange={(v) => setTargetFolioId(v ?? "")}>
                <SelectTrigger id="transfer-target">
                  <SelectValue placeholder={m.transferDialog.pickTarget} />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((folio) => (
                    <SelectItem key={folio.id} value={folio.id}>
                      {folio.folioNumber}
                      {folio.guestName ? ` · ${folio.guestName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {m.common.cancel}
          </Button>
          <Button
            onClick={submit}
            disabled={transfer.isPending || !targetFolioId || targets.length === 0}
          >
            {m.detail.transfer}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
