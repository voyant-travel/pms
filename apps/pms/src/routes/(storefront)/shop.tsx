"use client"

import { createFileRoute, Link } from "@tanstack/react-router"
import { useCatalogSearch } from "@voyant-travel/catalog-react"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { Input } from "@voyant-travel/ui/components/input"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import { useState } from "react"
import { z } from "zod"

import { useStorefrontMessagesOrDefault } from "@/lib/storefront-i18n"

/**
 * Storefront landing — real catalog browser backed by
 * `/v1/public/catalog/search` (Typesense slice scoped to
 * `audience: "customer"`).
 *
 * When the deployment hasn't configured Typesense (no
 * `TYPESENSE_HOST`), the search route 503s and we render an
 * instructions block instead — a usable experience either way.
 */
const shopSearchSchema = z.object({
  q: z.string().optional(),
  vertical: z.enum(["products", "cruises", "accommodations", "charters", "flights"]).optional(),
})

export const Route = createFileRoute("/(storefront)/shop")({
  component: StorefrontIndex,
  validateSearch: shopSearchSchema,
})

function StorefrontIndex(): React.ReactElement {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const t = useStorefrontMessagesOrDefault().shop
  const vertical = search.vertical ?? "products"
  const [query, setQuery] = useState(search.q ?? "")

  const result = useCatalogSearch({
    surface: "public",
    vertical,
    query,
    mode: "keyword",
    pagination: { limit: 24 },
    enabled: true,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">{t.heading}</h1>
        <p className="text-muted-foreground">{t.intro}</p>
      </div>

      <div className="flex">
        <Link
          to="/shop/composer"
          className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
        >
          {t.buildTrip}
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-md"
        />
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={vertical}
          onChange={(e) =>
            navigate({
              search: (s) => ({ ...s, vertical: e.target.value as typeof vertical }),
            })
          }
        >
          <option value="products">{t.verticalProducts}</option>
          <option value="cruises">{t.verticalCruises}</option>
          <option value="accommodations">{t.verticalAccommodations}</option>
          <option value="charters">{t.verticalCharters}</option>
        </select>
      </div>

      {result.isError ? (
        <SearchUnavailable />
      ) : result.isLoading ? (
        <SearchSkeleton />
      ) : result.data && result.data.hits.length > 0 ? (
        <SearchResults vertical={vertical} hits={result.data.hits} />
      ) : (
        <SearchEmpty vertical={vertical} query={query} />
      )}
    </div>
  )
}

function SearchUnavailable(): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().shop
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.unavailableTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>{t.unavailableBody}</p>
        <p>
          <code>/shop/book/products/&lt;productId&gt;</code>
        </p>
      </CardContent>
    </Card>
  )
}

function SearchSkeleton(): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => `skel-${i}`).map((key) => (
        <Card key={key}>
          <CardContent className="space-y-2 pt-6">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

interface SearchHit {
  id: string
  document: { fields: Record<string, unknown> }
}

function SearchResults({
  vertical,
  hits,
}: {
  vertical: string
  hits: ReadonlyArray<SearchHit>
}): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().shop
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {hits.map((hit) => {
        const fields = hit.document.fields
        const name = readString(fields.name) ?? readString(fields.title) ?? hit.id
        const description = readString(fields.description) ?? readString(fields.summary)
        const listPrice = readNumber(fields.price_cents) ?? readNumber(fields.sell_amount_cents)
        const currency = readString(fields.currency) ?? readString(fields.sell_currency) ?? ""
        // Promotion annotations from `productPromotionsCatalogPolicy` (PR3
        // of #497). The catalog projection emits `bestOffer*` +
        // `originalPriceFromAmountCents` only for products with an
        // active auto-applied offer for the slice. Storefront consumers
        // compute the effective price client-side (per
        // promotions-architecture.md §3.7).
        const offerName = readString(fields.bestOfferName)
        const offerDiscountKind = readString(fields.bestOfferDiscountKind)
        const offerDiscountPercent = readNumber(fields.bestOfferDiscountPercent)
        const offerDiscountAmountCents = readNumber(fields.bestOfferDiscountAmountCents)
        const originalPriceCents = readNumber(fields.originalPriceFromAmountCents)
        const effectivePrice = computeEffectivePrice(listPrice, {
          kind: offerDiscountKind,
          percent: offerDiscountPercent,
          amountCents: offerDiscountAmountCents,
        })
        const showStrikethrough =
          originalPriceCents != null &&
          effectivePrice != null &&
          originalPriceCents > effectivePrice
        const offerBadgeText = describeOffer(
          offerDiscountKind,
          offerDiscountPercent,
          offerDiscountAmountCents,
          currency,
          { percentOff: t.percentOff, amountOff: t.amountOff },
        )
        return (
          <Card key={hit.id}>
            <CardHeader>
              <CardTitle className="text-base">{name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {description ? (
                <p className="text-muted-foreground line-clamp-3">{description}</p>
              ) : null}
              {effectivePrice != null ? (
                <div className="space-y-0.5">
                  <p className="font-medium">
                    {(effectivePrice / 100).toLocaleString(undefined, {
                      style: currency ? "currency" : "decimal",
                      currency: currency || undefined,
                    })}
                    {showStrikethrough && originalPriceCents != null ? (
                      <span className="ml-2 text-muted-foreground text-xs line-through">
                        {(originalPriceCents / 100).toLocaleString(undefined, {
                          style: currency ? "currency" : "decimal",
                          currency: currency || undefined,
                        })}
                      </span>
                    ) : null}
                  </p>
                  {offerName && offerBadgeText ? (
                    <p className="text-xs">
                      <span className="rounded-sm bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                        {offerBadgeText} — {offerName}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}
              <Link
                to="/shop/products/$entityModule/$entityId"
                params={{ entityModule: vertical, entityId: hit.id }}
                className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm hover:bg-primary/90"
              >
                {t.viewAndBook}
              </Link>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function SearchEmpty({ vertical, query }: { vertical: string; query: string }): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().shop
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-sm">
          {t.emptyPrefix} {vertical} {t.emptyMatch} {query ? <q>{query}</q> : t.emptyYourFilters}.{" "}
          {t.emptySuffix}
        </p>
      </CardContent>
    </Card>
  )
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined
}

function readNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/**
 * Apply the projected `bestOffer*` discount to the indexed list price.
 * Storefront consumers compute this client-side because the catalog
 * projection emits annotations only, never overwriting `priceFromAmountCents`
 * (per promotions-architecture.md §3.7).
 */
function computeEffectivePrice(
  listPriceCents: number | undefined,
  offer: { kind?: string; percent?: number; amountCents?: number },
): number | undefined {
  if (listPriceCents == null) return undefined
  if (!offer.kind) return listPriceCents
  if (offer.kind === "percentage" && offer.percent != null) {
    return Math.max(0, Math.round(listPriceCents * (1 - offer.percent / 100)))
  }
  if (offer.kind === "fixed_amount" && offer.amountCents != null) {
    return Math.max(0, listPriceCents - offer.amountCents)
  }
  return listPriceCents
}

function describeOffer(
  kind: string | undefined,
  percent: number | undefined,
  amountCents: number | undefined,
  currency: string,
  labels: { percentOff: string; amountOff: string },
): string | undefined {
  if (kind === "percentage" && percent != null) {
    return labels.percentOff.replace("{percent}", String(percent))
  }
  if (kind === "fixed_amount" && amountCents != null) {
    const amount = (amountCents / 100).toLocaleString(undefined, {
      style: currency ? "currency" : "decimal",
      currency: currency || undefined,
    })
    return labels.amountOff.replace("{amount}", amount)
  }
  return undefined
}
