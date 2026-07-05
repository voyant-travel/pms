"use client"

/**
 * Property scope control shared by every ARI page. Properties are the scoping
 * boundary for all inventory (room types, meal plans, rate plans, calendar), so
 * the selection is persisted to `localStorage` and reused across the section —
 * switching pages keeps the same property in view.
 */

import { useQuery } from "@tanstack/react-query"
import { Label } from "@voyant-travel/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { useCallback, useEffect, useState } from "react"

import { ariKeys, listPropertyOptions, type PropertyOption } from "./ari-client"
import { ariMessages } from "./ari-messages"

const STORAGE_KEY = "ari.selectedProperty"

function readStored(): string {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem(STORAGE_KEY) ?? ""
}

/** Shared, persisted "which property am I authoring?" selection. */
export function useSelectedProperty(): [string, (id: string) => void] {
  const [propertyId, setPropertyId] = useState<string>(readStored)

  const set = useCallback((id: string) => {
    setPropertyId(id)
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id)
  }, [])

  return [propertyId, set]
}

export function usePropertyOptions() {
  return useQuery({ queryKey: ariKeys.properties(), queryFn: listPropertyOptions })
}

export function PropertySelector({
  value,
  onChange,
  options,
  isLoading,
}: {
  value: string
  onChange: (id: string) => void
  options: PropertyOption[] | undefined
  isLoading: boolean
}) {
  const m = ariMessages.property

  // Default to the first property once options arrive and nothing is selected
  // (or the stored id no longer exists).
  useEffect(() => {
    if (!options || options.length === 0) return
    const stillValid = value && options.some((o) => o.id === value)
    if (!stillValid) onChange(options[0].id)
  }, [options, value, onChange])

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="ari-property" className="text-muted-foreground text-sm">
        {m.label}
      </Label>
      <Select
        value={value}
        onValueChange={(next) => onChange(next ?? "")}
        disabled={isLoading || !options || options.length === 0}
      >
        <SelectTrigger id="ari-property" className="min-w-56">
          <SelectValue placeholder={isLoading ? m.loading : m.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {(options ?? []).map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
