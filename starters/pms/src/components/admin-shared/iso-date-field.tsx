"use client"

/**
 * Shared admin date control. Wraps the design-system `DatePicker` so every admin
 * surface picks dates through the same calendar popover instead of the native
 * `<input type="date">` browser widget.
 *
 * Our state is ISO `YYYY-MM-DD` strings throughout, and empty is represented as
 * `""` (not `null`). This adapter bridges that convention to the DatePicker's
 * `string | null` value/onChange contract and maps optional `min`/`max` ISO
 * bounds onto react-day-picker disabled matchers.
 */

import { DatePicker } from "@voyant-travel/ui/components/date-picker"
import { Label } from "@voyant-travel/ui/components/label"
import { parseISO } from "date-fns"
import type { Matcher } from "react-day-picker"

export interface IsoDateFieldProps {
  /** ISO `YYYY-MM-DD` string, or `""` when empty. */
  value: string
  /** Receives the new ISO string, or `""` when cleared. */
  onChange: (iso: string) => void
  label?: string
  /** Earliest selectable ISO date (inclusive). */
  min?: string
  /** Latest selectable ISO date (inclusive). */
  max?: string
  disabled?: boolean
  /** Required fields default to non-clearable so the date can't be blanked. */
  required?: boolean
  clearable?: boolean
  placeholder?: string
  /** Applied to the trigger button — use for width overrides (defaults to full width). */
  className?: string
  /** Wrapping element className (e.g. grid column sizing on a bare navigator). */
  containerClassName?: string
}

function boundsMatcher(min?: string, max?: string): Matcher[] | undefined {
  const matchers: Matcher[] = []
  if (min) {
    const before = parseISO(min)
    if (!Number.isNaN(before.getTime())) matchers.push({ before })
  }
  if (max) {
    const after = parseISO(max)
    if (!Number.isNaN(after.getTime())) matchers.push({ after })
  }
  return matchers.length > 0 ? matchers : undefined
}

export function IsoDateField({
  value,
  onChange,
  label,
  min,
  max,
  disabled,
  required,
  clearable,
  placeholder,
  className,
  containerClassName,
}: IsoDateFieldProps) {
  const picker = (
    <DatePicker
      value={value || null}
      onChange={(next) => onChange(next ?? "")}
      dateDisabled={boundsMatcher(min, max)}
      disabled={disabled}
      clearable={clearable ?? !required}
      placeholder={placeholder ?? "Pick a date"}
      displayFormat="dd MMM yyyy"
      className={className}
    />
  )

  if (!label) {
    return containerClassName ? <div className={containerClassName}>{picker}</div> : picker
  }

  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName ?? ""}`}>
      <Label className="text-sm">{label}</Label>
      {picker}
    </div>
  )
}
