import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import type { AccommodationContent } from "@voyant-travel/accommodations/content-shape"
import {
  type BookingDraftV1,
  bookingDraftV1,
} from "@voyant-travel/catalog-contracts/booking-engine/contracts"
import { useBookingQuote } from "@voyant-travel/catalog-react/booking-engine"
import { useEffect, useMemo, useState } from "react"
import { firstSelectablePair } from "@/components/storefront/rooms-matrix"
import { Container, Eyebrow, SectionHeading } from "@/components/storefront/site/primitives"
import { PropertyBookingPanel } from "@/components/storefront/site/property-booking-panel"
import { resolveAcmeContent } from "@/components/storefront/site/property-content"
import {
  AmenityList,
  describeRate,
  HighlightList,
  PropertyGallery,
  RoomList,
} from "@/components/storefront/site/property-detail-view"
import {
  defaultStayDates,
  resolveOccupancy,
  type StaySearch,
  toBookingJourneySearch,
} from "@/components/storefront/stay-search"
import { getApiUrl } from "@/lib/env"
import { type ContentResolution, fetchContent } from "./shop-product-detail-content"

/**
 * Elevated Acme property page. The presentation is fully branded (hero
 * gallery, intro, amenities, room cards, a sticky booking panel and a
 * location block) but the live-quote + Book wiring is unchanged from the
 * storefront machinery: a probe `BookingDraftV1` drives `useBookingQuote`,
 * and Book hands the locked-in room/rate/dates to the booking journey.
 */
export function AccommodationDetailPage({
  entityId,
  stay,
}: {
  entityId: string
  stay: StaySearch
}): React.ReactElement {
  const navigate = useNavigate()

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

  if (content.isLoading) return <DetailSkeleton />
  if (!content.data) return <DetailMissing entityId={entityId} />

  const c = content.data.content
  const editorial = resolveAcmeContent({ name: c.hotel.name })
  const location = [c.hotel.city, c.hotel.country].filter(Boolean).join(", ") || null
  const selectedRoom = c.room_types.find((r) => r.id === selectedRoomId) ?? null
  const selectedRate = c.rate_plans.find((r) => r.id === selectedRatePlanId) ?? null

  function onBook() {
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
  }

  return (
    <div className="bg-[var(--acme-paper)]">
      <PropertyGallery
        name={c.hotel.name}
        stars={c.hotel.star_rating ?? null}
        location={location}
        thumbnailUrl={null}
      />

      <Container className="py-12 lg:py-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
          <div className="space-y-14 lg:col-span-2">
            <section>
              <Eyebrow>The hotel</Eyebrow>
              <p className="mt-4 max-w-2xl text-[var(--acme-ink-soft)] text-lg leading-relaxed">
                {editorial.intro}
              </p>
              {c.hotel.description && c.hotel.description !== editorial.intro ? (
                <p className="mt-4 max-w-2xl whitespace-pre-line text-[var(--acme-ink-soft)] text-sm leading-relaxed">
                  {c.hotel.description}
                </p>
              ) : null}
              <div className="mt-8">
                <HighlightList highlights={editorial.highlights} />
              </div>
            </section>

            <section>
              <SectionHeading as="h2" className="text-2xl">
                Rooms &amp; rates
              </SectionHeading>
              <p className="mt-2 text-[var(--acme-ink-soft)] text-sm">
                Prices shown update live for your selected dates and occupancy.
              </p>
              <div className="mt-6">
                <RoomList
                  content={c}
                  roomSeed={editorial.roomSeed}
                  selectedRoomId={selectedRoomId}
                  selectedRatePlanId={selectedRatePlanId}
                  onSelect={(roomId, ratePlanId) => {
                    setSelectedRoomId(roomId)
                    setSelectedRatePlanId(ratePlanId)
                  }}
                  emptyLabel="No rooms are configured for this property yet."
                />
              </div>
            </section>

            {c.amenities.length > 0 ? (
              <section>
                <SectionHeading as="h2" className="text-2xl">
                  Amenities
                </SectionHeading>
                <div className="mt-6">
                  <AmenityList amenities={c.amenities} />
                </div>
              </section>
            ) : null}
          </div>

          <aside className="lg:col-span-1">
            <PropertyBookingPanel
              checkIn={checkIn}
              checkOut={checkOut}
              adults={adultCount}
              childCount={childCount}
              rooms={roomCount}
              selectedRoomName={selectedRoom?.name ?? null}
              selectedBoard={selectedRate ? describeRate(selectedRate.name).board : null}
              totalCents={totalCents}
              currency={currency}
              isQuoting={quote.isQuoting}
              invalidReason={humanizeInvalid(quote.data?.invalidReason)}
              bookDisabled={
                !selectedRoomId ||
                !selectedRatePlanId ||
                !datesValid ||
                totalPax < 1 ||
                quote.data?.available === false
              }
              onCheckIn={setCheckIn}
              onCheckOut={setCheckOut}
              onAdults={setAdultCount}
              onChildren={setChildCount}
              onRooms={setRoomCount}
              onBook={onBook}
            />
          </aside>
        </div>
      </Container>

      <LocationBlock
        name={c.hotel.name}
        address={c.hotel.address ?? null}
        city={c.hotel.city ?? null}
        checkInTime={c.hotel.check_in_time ?? null}
        checkOutTime={c.hotel.check_out_time ?? null}
        phone={editorial.phone}
        email={editorial.email}
        resolution={content.data.resolution}
      />
    </div>
  )
}

function LocationBlock({
  name,
  address,
  city,
  checkInTime,
  checkOutTime,
  phone,
  email,
  resolution,
}: {
  name: string
  address: string | null
  city: string | null
  checkInTime: string | null
  checkOutTime: string | null
  phone: string
  email: string
  resolution: ContentResolution | null
}): React.ReactElement {
  void resolution
  return (
    <section className="bg-[var(--acme-ink)] text-[var(--acme-paper)]">
      <Container className="grid grid-cols-1 gap-10 py-16 sm:grid-cols-3">
        <div>
          <p className="acme-eyebrow text-[var(--acme-accent-soft)]">Location</p>
          <h2 className="acme-serif mt-3 text-2xl">{name}</h2>
          {address ? <p className="mt-3 text-sm text-white/70">{address}</p> : null}
          {city ? <p className="text-sm text-white/70">{city}</p> : null}
        </div>
        <div>
          <p className="acme-eyebrow text-[var(--acme-accent-soft)]">Reservations</p>
          <ul className="mt-3 space-y-1.5 text-sm text-white/70">
            <li>
              <a href={`tel:${phone.replace(/\s/g, "")}`} className="hover:text-white">
                {phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${email}`} className="hover:text-white">
                {email}
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="acme-eyebrow text-[var(--acme-accent-soft)]">Good to know</p>
          <ul className="mt-3 space-y-1.5 text-sm text-white/70">
            <li>Check-in from {checkInTime ?? "15:00"}</li>
            <li>Check-out by {checkOutTime ?? "11:00"}</li>
            <li>Valid photo ID required at arrival</li>
          </ul>
        </div>
      </Container>
    </section>
  )
}

function humanizeInvalid(reason: string | undefined): string | null {
  if (!reason) return null
  switch (reason) {
    case "unavailable":
      return "Sold out for these dates — try another window."
    case "no_price_for_occupancy":
      return "No rate for the chosen room and occupancy."
    case "property_not_found":
      return "This property is currently unavailable."
    default:
      return "This selection is currently unavailable."
  }
}

function DetailSkeleton(): React.ReactElement {
  return (
    <div className="bg-[var(--acme-paper)]">
      <div className="h-[52vh] min-h-[380px] animate-pulse bg-[var(--acme-paper-deep)]" />
      <Container className="py-16">
        <div className="h-8 w-1/3 animate-pulse rounded bg-[var(--acme-paper-deep)]" />
        <div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-[var(--acme-paper-deep)]" />
      </Container>
    </div>
  )
}

function DetailMissing({ entityId }: { entityId: string }): React.ReactElement {
  return (
    <div className="bg-[var(--acme-paper)]">
      <Container className="py-24 text-center">
        <SectionHeading as="h1">Property unavailable</SectionHeading>
        <p className="mt-4 text-[var(--acme-ink-soft)]">
          We couldn't load this hotel ({entityId}). It may no longer be available.
        </p>
      </Container>
    </div>
  )
}
