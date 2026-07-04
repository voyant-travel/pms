import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  type BookingDraftV1,
  bookingDraftV1,
} from "@voyant-travel/catalog-contracts/booking-engine/contracts"
import { useBookingQuote } from "@voyant-travel/catalog-react/booking-engine"
import type { ProductContent } from "@voyant-travel/inventory/content-shape"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { useEffect, useMemo, useState } from "react"

import { getApiUrl } from "@/lib/env"
import { useStorefrontMessagesOrDefault } from "@/lib/storefront-i18n"
import { type ContentResolution, fetchContent } from "./shop-product-detail-content"
import {
  type AvailabilitySlot,
  BackLink,
  BodyMissing,
  BodySkeleton,
  BookingSidebar,
  ContentResolutionHint,
  DepartureSelect,
  DetailLayout,
  HeroImage,
  PaxBlock,
} from "./shop-product-detail-shared"

export function ProductDetailPageProducts({
  entityModule,
  entityId,
}: {
  entityModule: string
  entityId: string
}): React.ReactElement {
  const navigate = useNavigate()

  const slots = useQuery({
    queryKey: ["public-catalog-slots", entityModule, entityId],
    queryFn: async (): Promise<{ rows: AvailabilitySlot[] }> => {
      const res = await fetch(
        `${getApiUrl()}/v1/public/catalog/slots?entityModule=${encodeURIComponent(entityModule)}&entityId=${encodeURIComponent(entityId)}`,
        { credentials: "include" },
      )
      if (!res.ok) throw new Error(`Slots request failed: ${res.status}`)
      return res.json()
    },
    staleTime: 30_000,
  })

  const content = useQuery({
    queryKey: ["public-product-content", entityModule, entityId],
    queryFn: () =>
      fetchContent<ProductContent>(
        `${getApiUrl()}/v1/public/products/${encodeURIComponent(entityId)}/content`,
      ),
    staleTime: 30_000,
  })

  const [selectedSlotId, setSelectedSlotId] = useState<string | undefined>(undefined)
  const [adultCount, setAdultCount] = useState(2)
  const [childCount, setChildCount] = useState(0)
  const [infantCount, setInfantCount] = useState(0)

  const firstOpenId = slots.data?.rows[0]?.id
  useEffect(() => {
    if (firstOpenId && !selectedSlotId) setSelectedSlotId(firstOpenId)
  }, [firstOpenId, selectedSlotId])

  const probeDraft = useMemo<BookingDraftV1 | null>(() => {
    if (!selectedSlotId) return null
    return bookingDraftV1.parse({
      entity: { module: entityModule, id: entityId, sourceKind: "" },
      configure: {
        departureSlotId: selectedSlotId,
        pax: { adult: adultCount, child: childCount, infant: infantCount },
      },
    })
  }, [entityModule, entityId, selectedSlotId, adultCount, childCount, infantCount])

  const quote = useBookingQuote({ surface: "public", draft: probeDraft })

  const totalPax = adultCount + childCount + infantCount
  const totalCents = quote.data?.pricing?.total ?? 0
  const currency = quote.data?.pricing?.currency

  return (
    <DetailLayout
      body={
        <ProductDetailBody
          entityModule={entityModule}
          entityId={entityId}
          content={content.data?.content ?? null}
          resolution={content.data?.resolution ?? null}
          isLoading={content.isLoading}
        />
      }
      sidebar={
        <BookingSidebar
          totalPax={totalPax}
          totalCents={totalCents}
          currency={currency}
          isQuoting={quote.isQuoting}
          quoteData={quote.data}
          disabled={!selectedSlotId || totalPax < 1 || quote.data?.available === false}
          onBook={() => {
            if (!selectedSlotId) return
            navigate({
              to: "/shop/book/$entityModule/$entityId",
              params: { entityModule, entityId },
              search: {
                departureSlotId: selectedSlotId,
                adult: adultCount,
                ...(childCount > 0 ? { child: childCount } : {}),
                ...(infantCount > 0 ? { infant: infantCount } : {}),
              } as never,
            })
          }}
        >
          <DepartureSelect
            slots={slots.data?.rows ?? []}
            isLoading={slots.isLoading}
            isError={slots.isError}
            value={selectedSlotId}
            onChange={setSelectedSlotId}
          />
          <PaxBlock
            adult={adultCount}
            child={childCount}
            infant={infantCount}
            setAdult={setAdultCount}
            setChild={setChildCount}
            setInfant={setInfantCount}
          />
        </BookingSidebar>
      }
    />
  )
}

function ProductDetailBody({
  entityModule,
  entityId,
  content,
  resolution,
  isLoading,
}: {
  entityModule: string
  entityId: string
  content: ProductContent | null
  resolution: ContentResolution | null
  isLoading: boolean
}): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().shopDetailProducts
  if (isLoading) return <BodySkeleton />
  if (!content) return <BodyMissing entityModule={entityModule} entityId={entityId} />

  const heroImage = content.media?.find((m) => m.type === "image")
  const galleryImages = content.media?.filter((m) => m.type === "image").slice(0, 6) ?? []

  return (
    <div className="space-y-4">
      {heroImage ? (
        <HeroImage url={heroImage.url} alt={heroImage.alt ?? content.product.name} />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{content.product.name}</CardTitle>
          <ContentResolutionHint resolution={resolution} />
        </CardHeader>
        <CardContent className="space-y-4">
          {content.product.description ? (
            <p className="whitespace-pre-line text-muted-foreground text-sm">
              {content.product.description}
            </p>
          ) : null}
          {content.product.highlights && content.product.highlights.length > 0 ? (
            <div>
              <div className="mb-2 font-medium text-sm">{t.highlights}</div>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {content.product.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <BackLink />
        </CardContent>
      </Card>

      {content.days && content.days.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.itinerary}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {content.days.map((day) => (
              <div key={day.day_number} className="space-y-1 border-l-2 pl-4">
                <div className="font-medium text-sm">
                  {t.day.replace("{number}", String(day.day_number))}
                  {day.title ? ` · ${day.title}` : ""}
                  {day.location ? (
                    <span className="text-muted-foreground"> — {day.location}</span>
                  ) : null}
                </div>
                {day.description ? (
                  <p className="text-muted-foreground text-sm">{day.description}</p>
                ) : null}
                {day.services && day.services.length > 0 ? (
                  <ul className="list-disc pl-5 text-muted-foreground text-xs">
                    {day.services.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {galleryImages.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.gallery}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {galleryImages.slice(1).map((img) => (
                <img
                  key={img.url}
                  src={img.url}
                  alt={img.alt ?? content.product.name}
                  className="aspect-square w-full rounded object-cover"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {content.policies && content.policies.length > 0 ? (
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
