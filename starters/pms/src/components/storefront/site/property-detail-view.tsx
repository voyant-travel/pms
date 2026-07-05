"use client"

import { Link } from "@tanstack/react-router"
import type { AccommodationContent } from "@voyant-travel/accommodations/content-shape"
import { useState } from "react"

import { buildRoomsMatrix } from "@/components/storefront/rooms-matrix"
import { Stars } from "./primitives"
import { picsum, resolveAcmeContent } from "./property-content"

/**
 * Presentational building blocks for the elevated Acme property page.
 * They render the branded skin; the owning route keeps the live-quote
 * and booking wiring and passes selection state + callbacks in.
 */

/** Full-bleed hero gallery: a lead image with a thumbnail rail. */
export function PropertyGallery({
  name,
  stars,
  location,
  thumbnailUrl,
}: {
  name: string
  stars: number | null
  location: string | null
  thumbnailUrl: string | null
}): React.ReactElement {
  const editorial = resolveAcmeContent({ thumbnailUrl, name })
  const seeds = editorial.gallerySeeds
  const [active, setActive] = useState(0)

  return (
    <div className="bg-[var(--acme-ink)]">
      <div className="relative h-[52vh] min-h-[380px] w-full overflow-hidden sm:h-[62vh]">
        <img
          src={picsum(seeds[active] ?? seeds[0], 2000, 1200)}
          alt={name}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
        <div className="acme-container absolute inset-x-0 bottom-0 pb-8">
          <Link
            to="/shop/hotels"
            className="text-[0.7rem] text-white/70 uppercase tracking-[0.18em] transition-colors hover:text-white"
          >
            ← All hotels
          </Link>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="acme-serif text-4xl text-white leading-tight sm:text-5xl">{name}</h1>
              {location ? <p className="mt-2 text-sm text-white/80">{location}</p> : null}
            </div>
            <Stars rating={stars} className="pb-2 text-lg" />
          </div>
        </div>
      </div>

      {seeds.length > 1 ? (
        <div className="acme-container flex gap-2 overflow-x-auto py-3">
          {seeds.map((seed, i) => (
            <button
              key={seed}
              type="button"
              onClick={() => setActive(i)}
              className={`h-16 w-24 shrink-0 overflow-hidden rounded-sm border-2 transition-all ${
                i === active ? "border-[var(--acme-accent)]" : "border-transparent opacity-70"
              }`}
              aria-label={`View image ${i + 1}`}
            >
              <img src={picsum(seed, 240, 160)} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Signature experiences / reasons to stay. */
export function HighlightList({
  highlights,
}: {
  highlights: readonly string[]
}): React.ReactElement | null {
  if (highlights.length === 0) return null
  return (
    <ul className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
      {highlights.map((h) => (
        <li key={h} className="flex items-start gap-3 text-[var(--acme-ink-soft)] text-sm">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--acme-accent)]" />
          <span className="leading-relaxed">{h}</span>
        </li>
      ))}
    </ul>
  )
}

/** Amenity chips. */
export function AmenityList({
  amenities,
}: {
  amenities: AccommodationContent["amenities"]
}): React.ReactElement | null {
  if (amenities.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {amenities.map((a) => (
        <span
          key={a.id}
          className="rounded-full border border-[var(--acme-line-strong)] px-3.5 py-1.5 text-[var(--acme-ink-soft)] text-sm"
        >
          {a.name}
        </span>
      ))}
    </div>
  )
}

/**
 * Derive a human meal-plan + cancellation label from the rate-plan name.
 * The seeded rate plans encode both in the name
 * (e.g. "Flexible — Bed & Breakfast", "Non-refundable — Room Only").
 */
export function describeRate(name: string): { board: string; cancellation: string | null } {
  const [flexPart, boardPart] = name.split(/\s*—\s*/)
  const board = boardPart?.trim() || "Room only"
  const flex = (flexPart ?? "").toLowerCase()
  const cancellation = flex.includes("non-refundable")
    ? "Non-refundable"
    : flex.includes("flexible")
      ? "Free cancellation"
      : flex.includes("weekly")
        ? "7-night minimum"
        : null
  return { board, cancellation }
}

/** Branded room + rate selector — drives the sidebar live quote. */
export function RoomList({
  content,
  roomSeed,
  selectedRoomId,
  selectedRatePlanId,
  onSelect,
  emptyLabel,
}: {
  content: Pick<AccommodationContent, "room_types" | "rate_plans">
  roomSeed: string
  selectedRoomId: string | undefined
  selectedRatePlanId: string | undefined
  onSelect: (roomTypeId: string, ratePlanId: string) => void
  emptyLabel: string
}): React.ReactElement {
  const matrix = buildRoomsMatrix(content)
  if (matrix.length === 0) {
    return <p className="text-[var(--acme-ink-soft)] text-sm">{emptyLabel}</p>
  }

  return (
    <div className="space-y-5">
      {matrix.map(({ room, ratePlans }, i) => (
        <div
          key={room.id}
          className="overflow-hidden rounded-sm border border-[var(--acme-line-strong)] bg-[var(--acme-surface)]"
        >
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr]">
            <div className="relative aspect-[4/3] sm:aspect-auto">
              <img
                src={picsum(`${roomSeed}-${i}`, 500, 400)}
                alt={room.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="acme-serif text-xl">{room.name}</h3>
                {room.max_occupancy ? (
                  <span className="shrink-0 text-[var(--acme-ink-faint)] text-xs uppercase tracking-wide">
                    Sleeps {room.max_occupancy}
                  </span>
                ) : null}
              </div>
              {room.description ? (
                <p className="mt-1.5 text-[var(--acme-ink-soft)] text-sm leading-relaxed">
                  {room.description}
                </p>
              ) : null}

              <ul className="mt-4 divide-y divide-[var(--acme-line)] border-[var(--acme-line)] border-t">
                {ratePlans.map((plan) => {
                  const active = room.id === selectedRoomId && plan.id === selectedRatePlanId
                  const { board, cancellation } = describeRate(plan.name)
                  return (
                    <li key={plan.id} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <div className="font-medium text-sm">{board}</div>
                        {cancellation ? (
                          <div
                            className={`text-xs ${
                              cancellation === "Non-refundable"
                                ? "text-[var(--acme-ink-faint)]"
                                : "text-emerald-700"
                            }`}
                          >
                            {cancellation}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelect(room.id, plan.id)}
                        className={`shrink-0 rounded-sm px-4 py-2 text-xs uppercase tracking-[0.1em] transition-colors ${
                          active
                            ? "bg-[var(--acme-accent)] text-white"
                            : "border border-[var(--acme-ink)] text-[var(--acme-ink)] hover:bg-[var(--acme-ink)] hover:text-white"
                        }`}
                      >
                        {active ? "Selected" : "Select"}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
