"use client"

/**
 * Editable calendar cells. Each cell shows its value and turns into a focused
 * input on click; committing (blur / Enter) fires a one-day upsert, Escape
 * cancels. Inventory cells also carry an open/closed toggle.
 */

import type { CalendarInventoryCell, CalendarRateCell } from "@voyant-travel/pms-ari"
import { useEffect, useRef, useState } from "react"
import { centsToInput, inputToCents } from "./calendar-grid-model"

/** Join truthy class names (single background per element keeps stacking sane). */
const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ")

function EditableValue({
  initial,
  onCommit,
  align = "center",
  valueClassName,
  strike = false,
}: {
  initial: string
  onCommit: (raw: string) => void
  align?: "center" | "right"
  valueClassName?: string
  strike?: boolean
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
        className={cx(
          "h-6 w-full rounded border px-1 tabular-nums outline-none",
          align === "right" ? "text-right" : "text-center",
          valueClassName ?? "text-xs",
        )}
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
      className={cx(
        "h-6 w-full px-1 tabular-nums hover:bg-accent",
        align === "right" ? "text-right" : "text-center",
        valueClassName ?? "text-xs",
        strike && "text-muted-foreground line-through",
      )}
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
    <div
      className={cx(
        "flex flex-col items-center justify-center gap-0.5 py-0.5",
        closed && "bg-destructive/10",
      )}
    >
      <EditableValue
        initial={cell ? String(capacity) : ""}
        valueClassName={cx("text-[13px] font-semibold", !closed && "text-foreground")}
        strike={closed}
        onCommit={(raw) => {
          const n = Number(raw)
          if (Number.isFinite(n) && n >= 0) onSave(Math.trunc(n), closed)
        }}
      />
      {/* Open is the norm, so it reads as a quiet dot; closed is the exception
          worth ink — a red "Closed" label. Both toggle the same state. */}
      <button
        type="button"
        onClick={() => onSave(capacity, !closed)}
        title={closed ? "Closed — click to open" : "Open — click to close"}
        aria-label={closed ? "Closed — click to open" : "Open — click to close"}
        className={cx(
          "flex h-3 items-center justify-center leading-none",
          closed
            ? "text-destructive text-[9px] font-semibold uppercase tracking-wide"
            : "text-muted-foreground/40 hover:text-muted-foreground",
        )}
      >
        {closed ? (
          "Closed"
        ) : (
          <span className="h-1 w-1 rounded-full bg-current" aria-hidden="true" />
        )}
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
      valueClassName="text-[13px] font-semibold text-foreground"
      onCommit={(raw) => {
        const cents = inputToCents(raw)
        if (cents != null && cents >= 0) onSave(cents)
      }}
    />
  )
}
