"use client"

import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import {
  defaultStayDates,
  isValidStayRange,
  type StaySearch,
} from "@/components/storefront/stay-search"
import type { PropertyPortfolioItem } from "./use-property-portfolio"

/**
 * Acme availability bar — the booking entry point on the hero and the
 * hotels page. Destination + stay window + occupancy. On submit it
 * either jumps straight to the chosen hotel's page (dates pre-scoped) or,
 * for "All destinations", to the dates-aware hotels listing.
 *
 * `variant="hero"` renders the glass panel that floats over the hero
 * image; `variant="panel"` is the solid surface used inline on pages.
 */
export function AvailabilityBar({
  items,
  initial,
  variant = "panel",
}: {
  items: ReadonlyArray<PropertyPortfolioItem>
  initial?: StaySearch
  variant?: "hero" | "panel"
}): React.ReactElement {
  const navigate = useNavigate()
  const fallback = defaultStayDates()
  const [entityId, setEntityId] = useState("")
  const [checkIn, setCheckIn] = useState(initial?.checkIn ?? fallback.checkIn)
  const [checkOut, setCheckOut] = useState(initial?.checkOut ?? fallback.checkOut)
  const [adults, setAdults] = useState(initial?.adults ?? 2)
  const [children, setChildren] = useState(initial?.children ?? 0)
  const [rooms, setRooms] = useState(initial?.rooms ?? 1)

  const datesValid = isValidStayRange(checkIn, checkOut)
  const guestSummary = `${adults + children} guest${adults + children === 1 ? "" : "s"} · ${rooms} room${
    rooms === 1 ? "" : "s"
  }`

  const stay: StaySearch = {
    checkIn,
    checkOut,
    adults,
    ...(children > 0 ? { children } : {}),
    ...(rooms > 1 ? { rooms } : {}),
  }

  function submit() {
    if (!datesValid) return
    if (entityId) {
      navigate({
        to: "/shop/products/$entityModule/$entityId",
        params: { entityModule: "accommodations", entityId },
        search: stay as never,
      })
      return
    }
    navigate({ to: "/shop/hotels", search: stay as never })
  }

  const shell =
    variant === "hero"
      ? "border border-white/25 bg-[var(--acme-paper)]/95 shadow-2xl backdrop-blur-md"
      : "border border-[var(--acme-line-strong)] bg-[var(--acme-surface)] shadow-sm"

  return (
    <form
      className={`grid grid-cols-1 gap-px overflow-hidden rounded-sm sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.1fr_auto] ${shell}`}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Field label="Destination">
        <select
          className="acme-input border-0 shadow-none focus:shadow-none"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
        >
          <option value="">All destinations</option>
          {items.map((item) => (
            <option key={item.propertyId} value={item.entityId}>
              {item.name}
              {item.city ? ` — ${item.city}` : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Check-in">
        <input
          type="date"
          className="acme-input border-0 shadow-none focus:shadow-none"
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
        />
      </Field>

      <Field label="Check-out">
        <input
          type="date"
          className="acme-input border-0 shadow-none focus:shadow-none"
          min={checkIn}
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
        />
      </Field>

      <Field label="Guests">
        <details className="group relative">
          <summary className="acme-input flex cursor-pointer list-none items-center justify-between border-0 shadow-none focus:shadow-none">
            <span>{guestSummary}</span>
            <span className="text-[var(--acme-ink-faint)] text-xs transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-64 space-y-3 rounded-sm border border-[var(--acme-line-strong)] bg-[var(--acme-surface)] p-4 shadow-xl">
            <Stepper label="Adults" value={adults} setValue={setAdults} min={1} max={16} />
            <Stepper label="Children" value={children} setValue={setChildren} min={0} max={12} />
            <Stepper label="Rooms" value={rooms} setValue={setRooms} min={1} max={8} />
          </div>
        </details>
      </Field>

      <button type="submit" className="acme-btn acme-btn-primary rounded-none" disabled={!datesValid}>
        {entityId ? "View hotel" : "Search"}
      </button>

      {!datesValid ? (
        <p className="col-span-full bg-[var(--acme-surface)] px-4 pb-3 text-[var(--acme-accent-strong)] text-xs">
          Check-out must be after check-in.
        </p>
      ) : null}
    </form>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <label className="block bg-[var(--acme-surface)] px-4 py-2.5">
      <span className="acme-field-label">{label}</span>
      {children}
    </label>
  )
}

function Stepper({
  label,
  value,
  setValue,
  min,
  max,
}: {
  label: string
  value: number
  setValue: (n: number) => void
  min: number
  max: number
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--acme-ink)] text-sm">{label}</span>
      <div className="flex items-center gap-3">
        <StepButton disabled={value <= min} onClick={() => setValue(value - 1)} label={`Fewer ${label}`}>
          −
        </StepButton>
        <span className="min-w-5 text-center text-sm tabular-nums">{value}</span>
        <StepButton disabled={value >= max} onClick={() => setValue(value + 1)} label={`More ${label}`}>
          +
        </StepButton>
      </div>
    </div>
  )
}

function StepButton({
  children,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode
  disabled: boolean
  onClick: () => void
  label: string
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--acme-line-strong)] text-[var(--acme-ink)] leading-none transition-colors hover:border-[var(--acme-accent)] disabled:opacity-30"
    >
      {children}
    </button>
  )
}
