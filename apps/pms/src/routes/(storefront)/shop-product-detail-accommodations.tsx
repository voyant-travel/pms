import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import type { AccommodationContent } from "@voyant-travel/accommodations/content-shape"
import {
  type BookingDraftV1,
  bookingDraftV1,
} from "@voyant-travel/catalog-contracts/booking-engine/contracts"
import { useBookingQuote } from "@voyant-travel/catalog-react/booking-engine"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import { useEffect, useMemo, useState } from "react"

import { getApiUrl } from "@/lib/env"
import { useStorefrontMessagesOrDefault } from "@/lib/storefront-i18n"
import { type ContentResolution, fetchContent } from "./shop-product-detail-content"
import {
  BackLink,
  BodyMissing,
  BodySkeleton,
  BookingSidebar,
  ContentResolutionHint,
  DetailLayout,
  HeroImage,
  PaxBlock,
} from "./shop-product-detail-shared"

export function AccommodationDetailPage({ entityId }: { entityId: string }): React.ReactElement {
  const navigate = useNavigate()
  const t = useStorefrontMessagesOrDefault().shopDetailAccommodations

  const content = useQuery({
    queryKey: ["public-accommodations-content", entityId],
    queryFn: () =>
      fetchContent<AccommodationContent>(
        `${getApiUrl()}/v1/public/accommodations/${encodeURIComponent(entityId)}/content`,
      ),
    staleTime: 30_000,
  })

  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [checkIn, setCheckIn] = useState(today)
  const [checkOut, setCheckOut] = useState(
    new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  )
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(undefined)
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string | undefined>(undefined)
  const [adultCount, setAdultCount] = useState(2)
  const [childCount, setChildCount] = useState(0)

  const firstRoomId = content.data?.content.room_types[0]?.id
  useEffect(() => {
    if (firstRoomId && !selectedRoomId) setSelectedRoomId(firstRoomId)
  }, [firstRoomId, selectedRoomId])

  const ratePlansForRoom = useMemo(() => {
    if (!content.data || !selectedRoomId) return []
    return content.data.content.rate_plans.filter(
      (rp) =>
        !rp.applies_to_room_type_ids ||
        rp.applies_to_room_type_ids.length === 0 ||
        rp.applies_to_room_type_ids.includes(selectedRoomId),
    )
  }, [content.data, selectedRoomId])

  useEffect(() => {
    if (ratePlansForRoom.length > 0 && !selectedRatePlanId) {
      setSelectedRatePlanId(ratePlansForRoom[0]?.id)
    }
  }, [ratePlansForRoom, selectedRatePlanId])

  const probeDraft = useMemo<BookingDraftV1 | null>(() => {
    if (!selectedRoomId || !checkIn || !checkOut) return null
    return bookingDraftV1.parse({
      entity: { module: "accommodations", id: entityId, sourceKind: "" },
      configure: {
        dateRange: { checkIn, checkOut },
        pax: { adult: adultCount, child: childCount },
      },
      accommodation: {
        rooms: [
          {
            optionUnitId: selectedRoomId,
            quantity: 1,
            ...(selectedRatePlanId ? { ratePlanId: selectedRatePlanId } : {}),
          },
        ],
        travelerAssignments: {},
      },
    })
  }, [entityId, checkIn, checkOut, selectedRoomId, selectedRatePlanId, adultCount, childCount])

  const quote = useBookingQuote({ surface: "public", draft: probeDraft })
  const totalCents = quote.data?.pricing?.total ?? 0
  const currency = quote.data?.pricing?.currency

  const totalPax = adultCount + childCount
  const datesValid = checkIn && checkOut && new Date(checkOut) > new Date(checkIn)

  return (
    <DetailLayout
      body={
        content.isLoading ? (
          <BodySkeleton />
        ) : !content.data ? (
          <BodyMissing entityModule="accommodations" entityId={entityId} />
        ) : (
          <AccommodationDetailBody
            content={content.data.content}
            resolution={content.data.resolution}
            selectedRoomId={selectedRoomId}
            onSelectRoom={(id) => {
              setSelectedRoomId(id)
              setSelectedRatePlanId(undefined)
            }}
            selectedRatePlanId={selectedRatePlanId}
            onSelectRatePlan={setSelectedRatePlanId}
            ratePlansForRoom={ratePlansForRoom}
          />
        )
      }
      sidebar={
        <BookingSidebar
          totalPax={totalPax}
          totalCents={totalCents}
          currency={currency}
          isQuoting={quote.isQuoting}
          quoteData={quote.data}
          disabled={
            !selectedRoomId ||
            !selectedRatePlanId ||
            !datesValid ||
            totalPax < 1 ||
            quote.data?.available === false
          }
          onBook={() => {
            if (!selectedRoomId || !selectedRatePlanId || !datesValid) return
            navigate({
              to: "/shop/book/$entityModule/$entityId",
              params: { entityModule: "accommodations", entityId },
              search: {
                checkIn,
                checkOut,
                roomTypeId: selectedRoomId,
                ratePlanId: selectedRatePlanId,
                adult: adultCount,
                ...(childCount > 0 ? { child: childCount } : {}),
              } as never,
            })
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="hp-checkin">{t.checkIn}</Label>
              <Input
                id="hp-checkin"
                type="date"
                min={today}
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hp-checkout">{t.checkOut}</Label>
              <Input
                id="hp-checkout"
                type="date"
                min={tomorrow}
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
              />
            </div>
          </div>

          <PaxBlock
            adult={adultCount}
            child={childCount}
            infant={0}
            setAdult={setAdultCount}
            setChild={setChildCount}
            setInfant={() => {}}
            showInfants={false}
          />
        </BookingSidebar>
      }
    />
  )
}

function AccommodationDetailBody({
  content,
  resolution,
  selectedRoomId,
  onSelectRoom,
  selectedRatePlanId,
  onSelectRatePlan,
  ratePlansForRoom,
}: {
  content: AccommodationContent
  resolution: ContentResolution | null
  selectedRoomId: string | undefined
  onSelectRoom: (id: string) => void
  selectedRatePlanId: string | undefined
  onSelectRatePlan: (id: string) => void
  ratePlansForRoom: ReadonlyArray<AccommodationContent["rate_plans"][number]>
}): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().shopDetailAccommodations
  return (
    <div className="space-y-4">
      {content.hotel.hero_image_url ? (
        <HeroImage url={content.hotel.hero_image_url} alt={content.hotel.name} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {content.hotel.name}
            {content.hotel.star_rating ? (
              <span className="ml-2 text-amber-500">
                {"★".repeat(Math.floor(content.hotel.star_rating))}
              </span>
            ) : null}
          </CardTitle>
          <ContentResolutionHint resolution={resolution} />
        </CardHeader>
        <CardContent className="space-y-3">
          {content.hotel.description ? (
            <p className="whitespace-pre-line text-muted-foreground text-sm">
              {content.hotel.description}
            </p>
          ) : null}
          <BackLink />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.chooseRoom}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {content.room_types.map((room) => {
            const selected = room.id === selectedRoomId
            return (
              <button
                key={room.id}
                type="button"
                className={`w-full rounded border p-3 text-left ${
                  selected ? "border-primary ring-2 ring-primary" : ""
                }`}
                onClick={() => onSelectRoom(room.id)}
              >
                <div className="font-medium">{room.name}</div>
                {room.description ? (
                  <div className="text-muted-foreground text-xs">{room.description}</div>
                ) : null}
                {room.max_occupancy ? (
                  <div className="text-muted-foreground text-xs">
                    {t.sleepsUpTo.replace("{count}", String(room.max_occupancy))}
                  </div>
                ) : null}
              </button>
            )
          })}
        </CardContent>
      </Card>

      {selectedRoomId && ratePlansForRoom.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.ratePlan}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ratePlansForRoom.map((plan) => {
              const selected = plan.id === selectedRatePlanId
              return (
                <button
                  key={plan.id}
                  type="button"
                  className={`w-full rounded border p-3 text-left ${
                    selected ? "border-primary ring-2 ring-primary" : ""
                  }`}
                  onClick={() => onSelectRatePlan(plan.id)}
                >
                  <div className="font-medium">{plan.name}</div>
                  {plan.description ? (
                    <div className="text-muted-foreground text-xs">{plan.description}</div>
                  ) : null}
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
                </button>
              )
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
