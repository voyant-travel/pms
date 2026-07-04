"use client"

import { Link } from "@tanstack/react-router"
import { Card, CardContent } from "@voyant-travel/ui/components/card"

import { useStorefrontMessagesOrDefault } from "@/lib/storefront-i18n"
import type { PropertyCardVM } from "./property-card-model"
import type { StaySearch } from "./stay-search"

function formatMoney(minor: number, currency: string | undefined): string {
  const major = minor / 100
  try {
    return currency
      ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(major)
      : major.toLocaleString()
  } catch {
    return `${major.toFixed(2)} ${currency ?? ""}`.trim()
  }
}

/**
 * Property results grid. Each card links to the property detail route,
 * carrying the current dates + occupancy as URL search so the detail
 * page opens pre-scoped to the guest's stay.
 */
export function PropertyResults({
  cards,
  stay,
}: {
  cards: ReadonlyArray<PropertyCardVM>
  stay: StaySearch
}): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().staySearch
  const detailSearch: StaySearch = {
    ...(stay.checkIn ? { checkIn: stay.checkIn } : {}),
    ...(stay.checkOut ? { checkOut: stay.checkOut } : {}),
    ...(stay.adults ? { adults: stay.adults } : {}),
    ...(stay.children ? { children: stay.children } : {}),
    ...(stay.rooms ? { rooms: stay.rooms } : {}),
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <Link
          key={card.id}
          to="/shop/products/$entityModule/$entityId"
          params={{ entityModule: "accommodations", entityId: card.id }}
          search={detailSearch as never}
          className="block"
        >
          <Card className="h-full overflow-hidden transition hover:shadow-md">
            {card.imageUrl ? (
              <img
                src={card.imageUrl}
                alt={card.name}
                className="aspect-[4/3] w-full object-cover"
              />
            ) : (
              <div className="aspect-[4/3] w-full bg-muted" />
            )}
            <CardContent className="space-y-1 pt-4">
              <div className="font-medium">{card.name}</div>
              {card.location ? (
                <div className="text-muted-foreground text-sm">{card.location}</div>
              ) : null}
              {card.priceFromMinor != null ? (
                <div className="pt-1 font-medium text-sm">
                  {t.fromPerNight.replace(
                    "{amount}",
                    formatMoney(card.priceFromMinor, card.currency),
                  )}
                </div>
              ) : (
                <div className="pt-1 text-primary text-sm">{t.viewProperty}</div>
              )}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
