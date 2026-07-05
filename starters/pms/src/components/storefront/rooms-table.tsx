"use client"

import type { AccommodationContent } from "@voyant-travel/accommodations/content-shape"
import { Button } from "@voyant-travel/ui/components/button"

import { useStorefrontMessagesOrDefault } from "@/lib/storefront-i18n"
import { buildRoomsMatrix } from "./rooms-matrix"

/**
 * Booking.com-style rooms table: one section per room type, listing its
 * applicable rate plans (cancellation, inclusions) with a Select action
 * per rate. Selecting a (room, rate) pair drives the sidebar live quote.
 *
 * Per-combination live prices are intentionally not fetched here — that
 * would fan out one quote per (room × rate) pair. The sidebar quotes the
 * selected pair; the table is the picker. See report notes.
 */
export function RoomsTable({
  content,
  selectedRoomId,
  selectedRatePlanId,
  onSelect,
}: {
  content: Pick<AccommodationContent, "room_types" | "rate_plans">
  selectedRoomId: string | undefined
  selectedRatePlanId: string | undefined
  onSelect: (roomTypeId: string, ratePlanId: string) => void
}): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().shopDetailAccommodations
  const matrix = buildRoomsMatrix(content)

  if (matrix.length === 0) {
    return <p className="text-muted-foreground text-sm">{t.noRooms}</p>
  }

  return (
    <div className="space-y-4">
      {matrix.map(({ room, ratePlans }) => (
        <div key={room.id} className="rounded-lg border">
          <div className="border-b bg-muted/40 p-3">
            <div className="font-medium">{room.name}</div>
            <div className="flex flex-wrap gap-x-3 text-muted-foreground text-xs">
              {room.max_occupancy ? (
                <span>{t.sleeps.replace("{count}", String(room.max_occupancy))}</span>
              ) : null}
              {room.size_sqm ? (
                <span>{t.roomSize.replace("{size}", String(room.size_sqm))}</span>
              ) : null}
            </div>
            {room.description ? (
              <p className="mt-1 text-muted-foreground text-xs">{room.description}</p>
            ) : null}
          </div>
          <ul className="divide-y">
            {ratePlans.map((plan) => {
              const active = room.id === selectedRoomId && plan.id === selectedRatePlanId
              return (
                <li key={plan.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="space-y-0.5">
                    <div className="font-medium text-sm">{plan.name}</div>
                    {plan.cancellation_policy ? (
                      <div className="text-muted-foreground text-xs">
                        {t.cancellation.replace("{policy}", plan.cancellation_policy)}
                      </div>
                    ) : null}
                    {plan.inclusions && plan.inclusions.length > 0 ? (
                      <div className="text-muted-foreground text-xs">
                        {t.includes.replace("{inclusions}", plan.inclusions.join(", "))}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => onSelect(room.id, plan.id)}
                  >
                    {active ? t.selected : t.select}
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
