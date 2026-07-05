"use client"

import { countNights } from "@/components/storefront/stay-search"

/**
 * Branded, sticky booking panel for the Acme property page. Pure
 * presentation — the owning route holds the selection state and the
 * live quote, and passes values + callbacks in. Keeps the exact same
 * "configure upstream, then Book" flow the storefront already uses.
 */
export function PropertyBookingPanel({
  checkIn,
  checkOut,
  adults,
  children,
  rooms,
  selectedRoomName,
  selectedBoard,
  totalCents,
  currency,
  isQuoting,
  invalidReason,
  bookDisabled,
  onCheckIn,
  onCheckOut,
  onAdults,
  onChildren,
  onRooms,
  onBook,
}: {
  checkIn: string
  checkOut: string
  adults: number
  children: number
  rooms: number
  selectedRoomName: string | null
  selectedBoard: string | null
  totalCents: number
  currency: string | undefined
  isQuoting: boolean
  invalidReason: string | null
  bookDisabled: boolean
  onCheckIn: (v: string) => void
  onCheckOut: (v: string) => void
  onAdults: (n: number) => void
  onChildren: (n: number) => void
  onRooms: (n: number) => void
  onBook: () => void
}): React.ReactElement {
  const nights = countNights(checkIn, checkOut)
  const hasPrice = totalCents > 0 && currency
  const perNight = hasPrice && nights ? totalCents / nights : null

  return (
    <div className="lg:sticky lg:top-24">
      <div className="rounded-sm border border-[var(--acme-line-strong)] bg-[var(--acme-surface)] p-6 shadow-sm">
        <p className="acme-eyebrow">Reserve your stay</p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="acme-field-label">Check-in</span>
            <input
              type="date"
              className="acme-input"
              value={checkIn}
              onChange={(e) => onCheckIn(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="acme-field-label">Check-out</span>
            <input
              type="date"
              className="acme-input"
              min={checkIn}
              value={checkOut}
              onChange={(e) => onCheckOut(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 space-y-2.5 rounded-sm border border-[var(--acme-line)] p-3.5">
          <PanelStepper label="Adults" value={adults} setValue={onAdults} min={1} max={16} />
          <PanelStepper label="Children" value={children} setValue={onChildren} min={0} max={12} />
          <PanelStepper label="Rooms" value={rooms} setValue={onRooms} min={1} max={8} />
        </div>

        {selectedRoomName ? (
          <div className="mt-4 border-[var(--acme-line)] border-t pt-4 text-sm">
            <div className="font-medium">{selectedRoomName}</div>
            {selectedBoard ? (
              <div className="text-[var(--acme-ink-faint)] text-xs">{selectedBoard}</div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex items-baseline justify-between border-[var(--acme-line)] border-t pt-4">
          <div>
            <div className="text-[var(--acme-ink-faint)] text-xs">
              {nights ? `${nights} night${nights === 1 ? "" : "s"}` : "Select dates"}
            </div>
            {perNight ? (
              <div className="text-[var(--acme-ink-faint)] text-xs">
                {formatMoney(perNight, currency)} / night
              </div>
            ) : null}
          </div>
          <div className="text-right">
            {isQuoting && !hasPrice ? (
              <div className="h-6 w-20 animate-pulse rounded bg-[var(--acme-paper-deep)]" />
            ) : hasPrice ? (
              <div className="acme-serif text-2xl">{formatMoney(totalCents, currency)}</div>
            ) : (
              <div className="text-[var(--acme-ink-faint)] text-sm">
                {invalidReason ? "—" : "Pending"}
              </div>
            )}
          </div>
        </div>

        {invalidReason ? (
          <p className="mt-2 text-[var(--acme-accent-strong)] text-xs">{invalidReason}</p>
        ) : null}

        <button
          type="button"
          className="acme-btn acme-btn-primary mt-5 w-full"
          disabled={bookDisabled}
          onClick={onBook}
        >
          Book now
        </button>
        <p className="mt-3 text-center text-[var(--acme-ink-faint)] text-xs">
          You won't be charged yet — the next step collects guest details.
        </p>
      </div>
    </div>
  )
}

function PanelStepper({
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

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100)
  } catch {
    return `${Math.round(cents / 100)} ${currency}`
  }
}
