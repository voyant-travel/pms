"use client"

import { Button } from "@voyant-travel/ui/components/button"
import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import { useState } from "react"

import { useStorefrontMessagesOrDefault } from "@/lib/storefront-i18n"
import { defaultStayDates, isValidStayRange, type StaySearch } from "./stay-search"

/**
 * Property-first search bar: destination + check-in/check-out +
 * occupancy (adults / children / rooms). Holds its own draft state
 * seeded from the current URL search; on submit it hands the resolved
 * values back so the route can push them into URL state.
 */
export function StaySearchBar({
  initial,
  onSearch,
}: {
  initial: StaySearch
  onSearch: (
    next: Required<Pick<StaySearch, "checkIn" | "checkOut" | "adults" | "children" | "rooms">> & {
      destination?: string
    },
  ) => void
}): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().staySearch
  const fallback = defaultStayDates()
  const [destination, setDestination] = useState(initial.destination ?? "")
  const [checkIn, setCheckIn] = useState(initial.checkIn ?? fallback.checkIn)
  const [checkOut, setCheckOut] = useState(initial.checkOut ?? fallback.checkOut)
  const [adults, setAdults] = useState(initial.adults ?? 2)
  const [children, setChildren] = useState(initial.children ?? 0)
  const [rooms, setRooms] = useState(initial.rooms ?? 1)

  const datesValid = isValidStayRange(checkIn, checkOut)

  return (
    <form
      className="grid grid-cols-1 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!datesValid) return
        onSearch({
          destination: destination.trim() || undefined,
          checkIn,
          checkOut,
          adults,
          children,
          rooms,
        })
      }}
    >
      <div className="space-y-1 lg:col-span-2">
        <Label htmlFor="stay-destination">{t.destinationLabel}</Label>
        <Input
          id="stay-destination"
          placeholder={t.destinationPlaceholder}
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="stay-checkin">{t.checkIn}</Label>
        <Input
          id="stay-checkin"
          type="date"
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="stay-checkout">{t.checkOut}</Label>
        <Input
          id="stay-checkout"
          type="date"
          min={checkIn}
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-3 gap-2 lg:col-span-2">
        <NumberField
          id="stay-adults"
          label={t.adults}
          min={1}
          max={16}
          value={adults}
          onChange={setAdults}
        />
        <NumberField
          id="stay-children"
          label={t.children}
          min={0}
          max={12}
          value={children}
          onChange={setChildren}
        />
        <NumberField
          id="stay-rooms"
          label={t.rooms}
          min={1}
          max={8}
          value={rooms}
          onChange={setRooms}
        />
      </div>
      <div className="flex items-end lg:col-span-6">
        {!datesValid ? (
          <p className="mr-auto self-center text-amber-600 text-xs">{t.invalidDates}</p>
        ) : null}
        <Button type="submit" disabled={!datesValid} className="ml-auto">
          {t.search}
        </Button>
      </div>
    </form>
  )
}

function NumberField({
  id,
  label,
  min,
  max,
  value,
  onChange,
}: {
  id: string
  label: string
  min: number
  max: number
  value: number
  onChange: (n: number) => void
}): React.ReactElement {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10)
          if (Number.isNaN(n)) return
          onChange(Math.min(max, Math.max(min, n)))
        }}
      />
    </div>
  )
}
