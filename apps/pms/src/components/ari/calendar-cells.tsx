"use client"

/**
 * Editable calendar cells. Each cell shows its value and turns into a focused
 * input on click; committing (blur / Enter) fires a one-day upsert, Escape
 * cancels. Inventory cells also carry an open/closed toggle.
 */

import type { CalendarInventoryCell, CalendarRateCell } from "@voyant-travel/pms-ari"
import { useEffect, useRef, useState } from "react"
import { centsToInput, inputToCents } from "./calendar-grid-model"

function EditableValue({
  initial,
  onCommit,
  align = "center",
}: {
  initial: string
  onCommit: (raw: string) => void
  align?: "center" | "right"
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={0}
        step="0.01"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          if (draft !== initial) onCommit(draft)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") {
            setDraft(initial)
            setEditing(false)
          }
        }}
        className="h-6 w-full rounded border px-1 text-center text-xs tabular-nums outline-none"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(initial)
        setEditing(true)
      }}
      className={`h-6 w-full px-1 text-xs tabular-nums hover:bg-accent ${
        align === "right" ? "text-right" : "text-center"
      }`}
    >
      {initial === "" ? <span className="text-muted-foreground">–</span> : initial}
    </button>
  )
}

export function InventoryCell({
  cell,
  onSave,
}: {
  cell: CalendarInventoryCell | undefined
  onSave: (capacity: number, closed: boolean) => void
}) {
  const capacity = cell?.capacity ?? 0
  const closed = cell?.closed ?? false

  return (
    <div className={`flex flex-col items-center ${closed ? "bg-destructive/10" : ""}`}>
      <EditableValue
        initial={cell ? String(capacity) : ""}
        onCommit={(raw) => {
          const n = Number(raw)
          if (Number.isFinite(n) && n >= 0) onSave(Math.trunc(n), closed)
        }}
      />
      <button
        type="button"
        onClick={() => onSave(capacity, !closed)}
        className={`text-[10px] leading-tight ${
          closed ? "text-destructive font-medium" : "text-muted-foreground"
        }`}
      >
        {closed ? "closed" : "open"}
      </button>
    </div>
  )
}

export function RateCell({
  cell,
  onSave,
}: {
  cell: CalendarRateCell | undefined
  onSave: (sellAmountCents: number) => void
}) {
  return (
    <EditableValue
      initial={centsToInput(cell?.sellAmountCents)}
      align="right"
      onCommit={(raw) => {
        const cents = inputToCents(raw)
        if (cents != null && cents >= 0) onSave(cents)
      }}
    />
  )
}
