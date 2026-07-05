"use client"

import { Link } from "@tanstack/react-router"

import { defaultStayDates, type StaySearch } from "@/components/storefront/stay-search"
import { Stars } from "./primitives"
import { picsum } from "./property-content"
import { PropertyFromPrice } from "./property-from-price"
import type { PropertyPortfolioItem } from "./use-property-portfolio"

/**
 * Editorial property card for the home showcase and the hotels listing.
 * Large imagery with a slow hover zoom, serif name, location + star
 * rating, a one-line blurb and a live "from / night" price. The whole
 * card links to the property page with the current stay pre-scoped.
 */
export function PropertyCard({
  item,
  stay,
  index = 0,
}: {
  item: PropertyPortfolioItem
  stay?: StaySearch
  index?: number
}): React.ReactElement {
  const fallback = defaultStayDates()
  const checkIn = stay?.checkIn ?? fallback.checkIn
  const checkOut = stay?.checkOut ?? fallback.checkOut

  const detailSearch: StaySearch = {
    ...(stay?.checkIn ? { checkIn: stay.checkIn } : {}),
    ...(stay?.checkOut ? { checkOut: stay.checkOut } : {}),
    ...(stay?.adults ? { adults: stay.adults } : {}),
    ...(stay?.children ? { children: stay.children } : {}),
    ...(stay?.rooms ? { rooms: stay.rooms } : {}),
  }

  return (
    <Link
      to="/shop/products/$entityModule/$entityId"
      params={{ entityModule: "accommodations", entityId: item.entityId }}
      search={detailSearch as never}
      className="acme-card group flex flex-col"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-[var(--acme-paper-deep)]">
        <img
          src={picsum(item.editorial.gallerySeeds[0], 900, 1120)}
          alt={item.name}
          loading={index > 1 ? "lazy" : "eager"}
          className="acme-card-media h-full w-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/45 to-transparent" />
        {item.city ? (
          <div className="absolute bottom-4 left-4 text-white">
            <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/80">
              {[item.city, item.country].filter(Boolean).join(", ")}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col pt-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="acme-serif text-2xl leading-tight">{item.name}</h3>
          <Stars rating={item.starRating} className="mt-1.5 shrink-0" />
        </div>
        <p className="mt-2 flex-1 text-[var(--acme-ink-soft)] text-sm leading-relaxed">
          {item.editorial.blurb}
        </p>
        <div className="mt-4 flex items-center justify-between border-[var(--acme-line)] border-t pt-4">
          <span className="text-sm">
            <PropertyFromPrice
              entityId={item.entityId}
              roomId={item.fromRoomId}
              ratePlanId={item.fromRatePlanId}
              checkIn={checkIn}
              checkOut={checkOut}
              adults={stay?.adults ?? 2}
            />
          </span>
          <span className="text-[0.7rem] text-[var(--acme-accent)] uppercase tracking-[0.14em] transition-colors group-hover:text-[var(--acme-accent-strong)]">
            View hotel →
          </span>
        </div>
      </div>
    </Link>
  )
}
