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

import { firstSelectablePair } from "@/components/storefront/rooms-matrix"
import { RoomsTable } from "@/components/storefront/rooms-table"
import {
  defaultStayDates,
  resolveOccupancy,
  type StaySearch,
  toBookingJourneySearch,
} from "@/components/storefront/stay-search"
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
  PaxStepper,
} from "./shop-product-detail-shared"

export function AccommodationDetailPage({
  entityId,
  stay,
}: {
  entityId: string
  stay: StaySearch
}): React.ReactElement {
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

  const fallbackDates = defaultStayDates()
  const occupancy = resolveOccupancy(stay)
  const [checkIn, setCheckIn] = useState(stay.checkIn ?? fallbackDates.checkIn)
  const [checkOut, setCheckOut] = useState(stay.checkOut ?? fallbackDates.checkOut)
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(undefined)
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string | undefined>(undefined)
  const [adultCount, setAdultCount] = useState(occupancy.adults)
  const [childCount, setChildCount] = useState(occupancy.children)
  const [roomCount, setRoomCount] = useState(occupancy.rooms)

  // Seed the initial (room, rate) selection from the first bookable pair.
  const initialPair = content.data ? firstSelectablePair(content.data.content) : null
  useEffect(() => {
    if (initialPair && !selectedRoomId) {
      setSelectedRoomId(initialPair.roomTypeId)
      setSelectedRatePlanId(initialPair.ratePlanId)
    }
  }, [initialPair, selectedRoomId])

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
            quantity: roomCount,
            ...(selectedRatePlanId ? { ratePlanId: selectedRatePlanId } : {}),
          },
        ],
        travelerAssignments: {},
      },
    })
  }, [
    entityId,
    checkIn,
    checkOut,
    selectedRoomId,
    selectedRatePlanId,
    adultCount,
    childCount,
    roomCount,
  ])

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
            selectedRatePlanId={selectedRatePlanId}
            onSelect={(roomId, ratePlanId) => {
              setSelectedRoomId(roomId)
              setSelectedRatePlanId(ratePlanId)
            }}
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
            if (!selectedRoomId || !selectedRatePlanId) return
            const bookingSearch = toBookingJourneySearch(
              { checkIn, checkOut, adults: adultCount, children: childCount, rooms: roomCount },
              { roomTypeId: selectedRoomId, ratePlanId: selectedRatePlanId },
            )
            if (!bookingSearch) return
            navigate({
              to: "/shop/book/$entityModule/$entityId",
              params: { entityModule: "accommodations", entityId },
              search: bookingSearch as never,
            })
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="hp-checkin">{t.checkIn}</Label>
              <Input
                id="hp-checkin"
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hp-checkout">{t.checkOut}</Label>
              <Input
                id="hp-checkout"
                type="date"
                min={checkIn}
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
          <PaxStepper
            label={t.availableRooms}
            hint=""
            value={roomCount}
            setValue={setRoomCount}
            min={1}
            max={8}
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
  selectedRatePlanId,
  onSelect,
}: {
  content: AccommodationContent
  resolution: ContentResolution | null
  selectedRoomId: string | undefined
  selectedRatePlanId: string | undefined
  onSelect: (roomTypeId: string, ratePlanId: string) => void
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
          {content.hotel.city || content.hotel.country ? (
            <p className="text-muted-foreground text-sm">
              {[content.hotel.city, content.hotel.country].filter(Boolean).join(", ")}
            </p>
          ) : null}
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
          <CardTitle>{t.availableRooms}</CardTitle>
        </CardHeader>
        <CardContent>
          <RoomsTable
            content={content}
            selectedRoomId={selectedRoomId}
            selectedRatePlanId={selectedRatePlanId}
            onSelect={onSelect}
          />
        </CardContent>
      </Card>

      {content.amenities.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.amenities}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              {content.amenities.map((a) => (
                <li key={a.id} className="text-muted-foreground">
                  {a.name}
                  {a.is_free ? (
                    <span className="ml-1 text-emerald-600 text-xs">{t.freeLabel}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {content.policies.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.policies}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {content.policies.map((p) => (
              <div key={p.kind}>
                <div className="font-medium capitalize">{p.kind.replace(/_/g, " ")}</div>
                {p.body ? (
                  <p className="whitespace-pre-line text-muted-foreground">{p.body}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
