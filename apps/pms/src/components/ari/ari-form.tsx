"use client"

/** Small shared form atoms for the ARI dialogs — a labeled field and a switch row. */

import { Label } from "@voyant-travel/ui/components/label"
import { Switch } from "@voyant-travel/ui/components/switch"
import type { ReactNode } from "react"

export function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={htmlFor} className="text-sm">
        {label}
      </Label>
      {children}
    </div>
  )
}

export function SwitchRow({
  label,
  checked,
  onChange,
  id,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  id: string
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </label>
  )
}
