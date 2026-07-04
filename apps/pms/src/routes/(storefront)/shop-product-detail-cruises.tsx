import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  type BookingDraftV1,
  bookingDraftV1,
} from "@voyant-travel/catalog-contracts/booking-engine/contracts"
import { useBookingQuote } from "@voyant-travel/catalog-react/booking-engine"
import type { CruiseContent } from "@voyant-travel/cruises/content-shape"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
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
  formatSailingDate,
  HeroImage,
  PaxStepper,
} from "./shop-product-detail-shared"

export function CruiseDetailPage({ entityId }: { entityId: string }): React.ReactElement {
  const navigate = useNavigate()
  const t = useStorefrontMessagesOrDefault().shopDetailCruises

  const content = useQuery({
    queryKey: ["public-cruise-content", entityId],
    queryFn: () =>
      fetchContent<CruiseContent>(
        `${getApiUrl()}/v1/public/cruises/${encodeURIComponent(entityId)}/content`,
      ),
    staleTime: 30_000,
  })

  const [selectedSailingId, setSelectedSailingId] = useState<string | undefined>(undefined)
  const [selectedCabinCategoryId, setSelectedCabinCategoryId] = useState<string | undefined>(
    undefined,
  )
  const [occupancy, setOccupancy] = useState(2)

  const firstSailingId = content.data?.content.sailings.find((s) => s.status !== "sold_out")?.id
  useEffect(() => {
    if (firstSailingId && !selectedSailingId) setSelectedSailingId(firstSailingId)
  }, [firstSailingId, selectedSailingId])

  const probeDraft = useMemo<BookingDraftV1 | null>(() => {
    if (!selectedSailingId || !selectedCabinCategoryId) return null
    return bookingDraftV1.parse({
      entity: { module: "cruises", id: entityId, sourceKind: "" },
      configure: {
        departureSlotId: selectedSailingId,
        cabinCategoryId: selectedCabinCategoryId,
        pax: { adult: occupancy },
      },
    })
  }, [entityId, selectedSailingId, selectedCabinCategoryId, occupancy])

  const quote = useBookingQuote({ surface: "public", draft: probeDraft })
  const totalCents = quote.data?.pricing?.total ?? 0
  const currency = quote.data?.pricing?.currency

  return (
    <DetailLayout
      body={
        content.isLoading ? (
          <BodySkeleton />
        ) : !content.data ? (
          <BodyMissing entityModule="cruises" entityId={entityId} />
        ) : (
          <CruiseDetailBody
            content={content.data.content}
            resolution={content.data.resolution}
            selectedSailingId={selectedSailingId}
            onSelectSailing={(id) => {
              setSelectedSailingId(id)
              setSelectedCabinCategoryId(undefined)
            }}
            selectedCabinCategoryId={selectedCabinCategoryId}
            onSelectCabinCategory={setSelectedCabinCategoryId}
            occupancy={occupancy}
          />
        )
      }
      sidebar={
        <BookingSidebar
          totalPax={occupancy}
          totalCents={totalCents}
          currency={currency ?? undefined}
          isQuoting={quote.isQuoting}
          quoteData={quote.data}
          disabled={
            !selectedSailingId || !selectedCabinCategoryId || quote.data?.available === false
          }
          onBook={() => {
            if (!selectedSailingId || !selectedCabinCategoryId) return
            navigate({
              to: "/shop/book/$entityModule/$entityId",
              params: { entityModule: "cruises", entityId },
              search: {
                departureSlotId: selectedSailingId,
                cabinCategoryId: selectedCabinCategoryId,
                adult: occupancy,
              } as never,
            })
          }}
        >
          <div className="space-y-3">
            <Label>{t.occupancy}</Label>
            <PaxStepper
              label={t.guestsInCabin}
              hint={t.perPaxPricing}
              value={occupancy}
              setValue={setOccupancy}
              min={1}
              max={4}
            />
          </div>
        </BookingSidebar>
      }
    />
  )
}

function CruiseDetailBody({
  content,
  resolution,
  selectedSailingId,
  onSelectSailing,
  selectedCabinCategoryId,
  onSelectCabinCategory,
  occupancy,
}: {
  content: CruiseContent
  resolution: ContentResolution | null
  selectedSailingId: string | undefined
  onSelectSailing: (id: string) => void
  selectedCabinCategoryId: string | undefined
  onSelectCabinCategory: (id: string) => void
  occupancy: number
}): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().shopDetailCruises
  return (
    <div className="space-y-4">
      {content.cruise.hero_image_url ? (
        <HeroImage url={content.cruise.hero_image_url} alt={content.cruise.name} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{content.cruise.name}</CardTitle>
          <ContentResolutionHint resolution={resolution} />
        </CardHeader>
        <CardContent className="space-y-3">
          {content.ship?.name ? (
            <div className="text-muted-foreground text-sm">
              {t.aboard} <span className="font-medium">{content.ship.name}</span>
              {content.cruise.duration_nights
                ? ` · ${t.nights.replace("{count}", String(content.cruise.duration_nights))}`
                : ""}
            </div>
          ) : null}
          {content.cruise.description ? (
            <p className="whitespace-pre-line text-muted-foreground text-sm">
              {content.cruise.description}
            </p>
          ) : null}
          <BackLink />
        </CardContent>
      </Card>

      {content.ship ? <CruiseShipDetails ship={content.ship} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.chooseSailing}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground text-xs uppercase">
                  <th className="py-2">{t.colDate}</th>
                  <th className="py-2">{t.colRoute}</th>
                  <th className="py-2">{t.colNights}</th>
                  <th className="py-2 text-right">{t.colStatus}</th>
                </tr>
              </thead>
              <tbody>
                {content.sailings.map((sailing) => {
                  const soldOut = sailing.status === "sold_out"
                  const selected = sailing.id === selectedSailingId
                  return (
                    <tr
                      key={sailing.id}
                      className={`border-b ${selected ? "bg-primary/5" : ""} ${
                        soldOut ? "text-muted-foreground" : "cursor-pointer hover:bg-muted/50"
                      }`}
                      onClick={() => {
                        if (!soldOut) onSelectSailing(sailing.id)
                      }}
                    >
                      <td className="py-2">{formatSailingDate(sailing.start_date)}</td>
                      <td className="py-2">
                        {sailing.embarkation_port && sailing.disembarkation_port
                          ? `${sailing.embarkation_port} → ${sailing.disembarkation_port}`
                          : (sailing.embarkation_port ?? "—")}
                      </td>
                      <td className="py-2">{sailing.duration_nights ?? "—"}</td>
                      <td className="py-2 text-right">{soldOut ? t.soldOut : t.available}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedSailingId && content.cabin_categories.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.chooseCabin}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {content.cabin_categories.map((cat) => {
              const selected = cat.id === selectedCabinCategoryId
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`w-full rounded border p-3 text-left ${
                    selected ? "border-primary ring-2 ring-primary" : ""
                  }`}
                  onClick={() => onSelectCabinCategory(cat.id)}
                >
                  <CruiseCabinCategorySummary category={cat} />
                </button>
              )
            })}
            <p className="text-muted-foreground text-xs">
              {t.pricingPerGuest.replace("{occupancy}", String(occupancy))}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function CruiseShipDetails({ ship }: { ship: NonNullable<CruiseContent["ship"]> }) {
  const t = useStorefrontMessagesOrDefault().shopDetailCruises
  const deckPlanImages = [
    ...(ship.deck_plan_url ? [ship.deck_plan_url] : []),
    ...(ship.deck_plans ?? []).flatMap((deck) => (deck.image_url ? [deck.image_url] : [])),
  ]
  const deckPlanGalleryImages = Array.from(new Set(deckPlanImages.filter(isRenderableImageUrl)))
  const deckPlanDocuments = Array.from(
    new Set(deckPlanImages.filter((url) => !isRenderableImageUrl(url))),
  )
  const specs = [
    ship.ship_type,
    ship.capacity ? t.guestsCount.replace("{count}", String(ship.capacity)) : null,
    ship.decks ? t.decksCount.replace("{count}", String(ship.decks)) : null,
    ship.year_built ? t.builtYear.replace("{year}", String(ship.year_built)) : null,
  ].filter((v): v is string => typeof v === "string" && v.length > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ship.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {ship.gallery.length > 0 ? <ImageStrip images={ship.gallery} alt={ship.name} /> : null}
        {specs.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {specs.map((spec) => (
              <Badge key={spec} variant="secondary">
                {spec}
              </Badge>
            ))}
          </div>
        ) : null}
        {ship.description ? (
          <p className="whitespace-pre-line text-muted-foreground text-sm">{ship.description}</p>
        ) : null}
        {deckPlanGalleryImages.length > 0 ? (
          <div className="space-y-2">
            <div className="font-medium text-sm">{t.deckPlan}</div>
            <ImageStrip images={deckPlanGalleryImages} alt={`${ship.name} deck plan`} />
          </div>
        ) : null}
        {deckPlanDocuments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {deckPlanDocuments.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="rounded border px-3 py-1.5 text-sm hover:bg-muted"
              >
                {t.openDeckPlan}
              </a>
            ))}
          </div>
        ) : null}
        {ship.deck_plans.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {ship.deck_plans.map((deck) => (
              <Badge key={`${deck.level ?? ""}-${deck.name}`} variant="outline">
                {deck.level != null
                  ? t.deckLabel.replace("{level}", String(deck.level)).replace("{name}", deck.name)
                  : deck.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function CruiseCabinCategorySummary({
  category,
}: {
  category: CruiseContent["cabin_categories"][number]
}) {
  const t = useStorefrontMessagesOrDefault().shopDetailCruises
  const meta = [
    category.type,
    category.square_feet ? `${category.square_feet} sqft` : null,
    category.capacity_max ? t.sleeps.replace("{count}", String(category.capacity_max)) : null,
  ].filter((v): v is string => typeof v === "string" && v.length > 0)
  const cleanInclusions = category.inclusions.filter(
    (item) => item.trim() !== category.description?.trim() && !/^stateroom size/i.test(item.trim()),
  )

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        {category.images.length > 0 ? (
          <img
            src={category.images[0]}
            alt={category.name}
            className="h-24 w-32 shrink-0 rounded object-cover"
            loading="lazy"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium">{formatCabinName(category)}</div>
            {category.wheelchair_accessible ? (
              <Badge variant="outline">{t.wheelchairAccessible}</Badge>
            ) : null}
          </div>
          {meta.length > 0 ? (
            <div className="mt-1 text-muted-foreground text-xs uppercase">{meta.join(" · ")}</div>
          ) : null}
          {category.grade_codes.length > 0 ? (
            <div className="mt-1 text-muted-foreground text-xs">
              {t.grades.replace("{codes}", category.grade_codes.join(", "))}
            </div>
          ) : null}
          {category.description ? (
            <div className="mt-2 line-clamp-3 text-muted-foreground text-xs">
              {category.description}
            </div>
          ) : null}
        </div>
      </div>
      {category.images.length > 1 ? (
        <ImageStrip images={category.images.slice(1)} alt={category.name} compact />
      ) : null}
      {category.floorplan_images.length > 0 ? (
        <div className="space-y-2">
          <div className="font-medium text-sm">{t.floorPlan}</div>
          <ImageStrip
            images={category.floorplan_images}
            alt={`${category.name} floor plan`}
            compact
            contain
          />
        </div>
      ) : null}
      {cleanInclusions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {cleanInclusions.slice(0, 8).map((inclusion) => (
            <Badge key={inclusion} variant="secondary">
              {inclusion}
            </Badge>
          ))}
          {cleanInclusions.length > 8 ? (
            <Badge variant="outline">+{cleanInclusions.length - 8}</Badge>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ImageStrip({
  images,
  alt,
  compact = false,
  contain = false,
}: {
  images: string[]
  alt: string
  compact?: boolean
  contain?: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {images.slice(0, compact ? 3 : 6).map((src, index) => (
        <img
          key={src}
          src={src}
          alt={`${alt} ${index + 1}`}
          className={`w-full rounded bg-muted ${compact ? "h-24" : "h-36"} ${
            contain ? "object-contain" : "object-cover"
          }`}
          loading="lazy"
        />
      ))}
    </div>
  )
}

function formatCabinName(category: CruiseContent["cabin_categories"][number]): string {
  const code = category.code?.trim()
  if (!code || category.name.includes(code)) return category.name
  return `${category.name} (${code})`
}

function isRenderableImageUrl(url: string): boolean {
  if (url.startsWith("data:image/")) return true
  const path = url.split(/[?#]/, 1)[0]?.toLowerCase() ?? ""
  return /\.(avif|gif|jpe?g|png|svg|webp)$/.test(path)
}
