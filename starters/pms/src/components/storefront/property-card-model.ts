/**
 * Property card view-model — the flat shape the storefront results grid
 * renders. Built from the catalog search response, which exposes two
 * projections:
 *
 *   - `storefront-card` → a normalized `cards[]` with media, priceFrom,
 *     and destinations. Preferred.
 *   - raw `hits[]` → `document.fields` blob (Typesense projection).
 *     Fallback when the caller didn't ask for cards.
 *
 * Keeping the mapping here (pure, tested) means the route file just
 * renders `PropertyCardVM[]` and never touches raw field name drift.
 */

export interface PropertyCardVM {
  id: string
  name: string
  location?: string
  imageUrl?: string
  priceFromMinor?: number
  currency?: string
}

interface StorefrontCard {
  id: string
  name: string | null
  media?: { thumbnailUrl: string | null; coverMediaUrl: string | null }
  priceFrom?: { amountCents: number; currency: string | null } | null
  destinations?: { cities: string[]; countries: string[]; regions: string[] }
}

interface SearchHit {
  id: string
  document: { fields: Record<string, unknown> }
}

interface CatalogSearchLike {
  hits: ReadonlyArray<SearchHit>
  cards?: ReadonlyArray<StorefrontCard>
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

function locationFromDestinations(d: StorefrontCard["destinations"]): string | undefined {
  if (!d) return undefined
  const city = d.cities[0]
  const country = d.countries[0] ?? d.regions[0]
  return [city, country].filter(Boolean).join(", ") || undefined
}

export function cardToPropertyVM(card: StorefrontCard): PropertyCardVM {
  return {
    id: card.id,
    name: card.name ?? card.id,
    location: locationFromDestinations(card.destinations),
    imageUrl: card.media?.coverMediaUrl ?? card.media?.thumbnailUrl ?? undefined,
    priceFromMinor: card.priceFrom?.amountCents ?? undefined,
    currency: card.priceFrom?.currency ?? undefined,
  }
}

export function hitToPropertyVM(hit: SearchHit): PropertyCardVM {
  const f = hit.document.fields
  const city = readString(f.city)
  const country = readString(f.country) ?? readString(f.region)
  return {
    id: hit.id,
    name: readString(f.name) ?? readString(f.title) ?? hit.id,
    location: [city, country].filter(Boolean).join(", ") || undefined,
    imageUrl:
      readString(f.hero_image_url) ??
      readString(f.thumbnailUrl) ??
      readString(f.image_url) ??
      undefined,
    priceFromMinor:
      readNumber(f.price_from_amount_cents) ??
      readNumber(f.priceFromAmountCents) ??
      readNumber(f.price_cents) ??
      undefined,
    currency: readString(f.currency) ?? readString(f.sell_currency) ?? undefined,
  }
}

/**
 * Normalize a catalog search result into property cards. Prefers the
 * `storefront-card` projection; falls back to raw hits.
 */
export function buildPropertyCards(result: CatalogSearchLike | undefined): PropertyCardVM[] {
  if (!result) return []
  if (result.cards && result.cards.length > 0) return result.cards.map(cardToPropertyVM)
  return result.hits.map(hitToPropertyVM)
}
