/**
 * Acme Hotels editorial content + image map.
 *
 * The seeded catalog carries the hard facts (name, city, star rating,
 * rooms, rate plans, amenities) but ships placeholder imagery
 * (`hero_image_url` is null) and no marketing copy, phone or email.
 * This module is the single, swappable source for everything the
 * storefront layers on top: a tagline, editorial blurbs, signature
 * experiences, contact placeholders, and stable gallery imagery.
 *
 * Entries are keyed by a **stable seed token** (`acme-grand`,
 * `acme-seaside`, `acme-city`) that the seed script bakes into every
 * room-type thumbnail URL (`picsum.photos/seed/<token>/…`). That token
 * survives re-seeds (the `prop_…` / `hrmt_…` TypeIDs do not), so the
 * copy stays attached to the right hotel across dataset rebuilds. A
 * name-substring fallback covers any future property whose thumbnail
 * lacks a recognized seed.
 *
 * Pure + framework-free so it stays unit-testable.
 */

export type AcmePropertyKey = "acme-grand" | "acme-seaside" | "acme-city"

export interface AcmePropertyContent {
  key: AcmePropertyKey
  /** Short evocative line shown under the name on cards + hero. */
  tagline: string
  /** One-sentence card blurb. */
  blurb: string
  /** Two-to-three sentence intro for the property page. */
  intro: string
  /** Signature experiences / reasons to stay (property page). */
  highlights: readonly string[]
  /** Contact placeholders — the seeded rows carry none. */
  phone: string
  email: string
  /** Stable picsum seeds. `[0]` doubles as the card/cover image and
   *  matches the room-type thumbnail seed so imagery stays coherent. */
  gallerySeeds: readonly string[]
  /** Base seed for per-room imagery on the property page. */
  roomSeed: string
}

/**
 * Deterministic placeholder image URL. Stable seeds mean the same
 * hotel always renders the same photography across reloads — swap the
 * seeds (or the whole entry) here to re-skin without touching pages.
 */
export function picsum(seed: string, width: number, height: number): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`
}

export const ACME_PROPERTY_CONTENT: Record<AcmePropertyKey, AcmePropertyContent> = {
  "acme-grand": {
    key: "acme-grand",
    tagline: "A Belle Époque landmark on Calea Victoriei",
    blurb:
      "A restored 1920s grande dame in the heart of old Bucharest, with a rooftop spa and a fine-dining brasserie.",
    intro:
      "Behind a restored Belle Époque façade on Calea Victoriei, the Acme Grand pairs 1920s grandeur with a quietly modern stay. Marble corridors and a sweeping staircase lead to rooms dressed in warm neutrals, while the rooftop spa and brasserie draw a crowd of their own. It is a five-minute walk to the old town, the Athenaeum and the National Museum of Art.",
    highlights: [
      "Rooftop spa and heated indoor pool with skyline views",
      "Fine-dining brasserie led by a Bucharest-born chef",
      "Steps from the Athenaeum, old town and Calea Victoriei boutiques",
      "24-hour concierge, valet parking and airport transfers",
    ],
    phone: "+40 21 555 0100",
    email: "grand@acmehotels.example",
    gallerySeeds: ["acme-grand", "acme-grand-lobby", "acme-grand-suite", "acme-grand-spa"],
    roomSeed: "acme-grand-room",
  },
  "acme-seaside": {
    key: "acme-seaside",
    tagline: "Beachfront on the Mamaia strip",
    blurb:
      "A relaxed four-star resort with private-beach access, two outdoor pools and a seafood terrace on the Black Sea.",
    intro:
      "Right on the sand of the Mamaia strip, the Acme Seaside Resort is built for long, unhurried summers. Days move between the private beach, two outdoor pools and the seafood terrace; a supervised kids club keeps the youngest guests happy while parents settle in with a spritz at the water's edge. Constanța's old port and aquarium are a short drive south.",
    highlights: [
      "Direct private-beach access with loungers and cabanas",
      "Two outdoor pools and a poolside bar",
      "Seafood terrace restaurant overlooking the sea",
      "Supervised kids club, playground and free parking",
    ],
    phone: "+40 241 555 0200",
    email: "seaside@acmehotels.example",
    gallerySeeds: [
      "acme-seaside",
      "acme-seaside-pool",
      "acme-seaside-beach",
      "acme-seaside-terrace",
    ],
    roomSeed: "acme-seaside-room",
  },
  "acme-city": {
    key: "acme-city",
    tagline: "Serviced apartments in central Cluj-Napoca",
    blurb:
      "Self-catering studios and apartments off Piața Unirii, made for longer stays with self check-in and a full kitchenette.",
    intro:
      "A collection of serviced apartments a few minutes from Piața Unirii, the Acme City Apartments trade a hotel lobby for space and independence. Each unit has a full kitchenette and a washing machine, with self check-in and weekly housekeeping — an easy base for a working week, a slow weekend, or a month in Cluj-Napoca.",
    highlights: [
      "Full kitchenette and washing machine in every apartment",
      "Contactless self check-in, any hour",
      "Weekly housekeeping and fresh linen",
      "Walking distance to Piața Unirii, cafés and the old town",
    ],
    phone: "+40 264 555 0300",
    email: "city@acmehotels.example",
    gallerySeeds: ["acme-city", "acme-city-living", "acme-city-kitchen", "acme-city-street"],
    roomSeed: "acme-city-room",
  },
}

const NAME_FALLBACKS: ReadonlyArray<{ match: string; key: AcmePropertyKey }> = [
  { match: "grand", key: "acme-grand" },
  { match: "seaside", key: "acme-seaside" },
  { match: "apartment", key: "acme-city" },
  { match: "city", key: "acme-city" },
]

const SEED_TOKEN = /\/seed\/(acme-[a-z0-9-]+?)(?:-\d+)?\//i

/**
 * Extract the stable seed token from a room-type / card thumbnail URL,
 * e.g. `https://picsum.photos/seed/acme-grand/800/500` → `acme-grand`.
 * Returns null when the URL carries no recognized Acme seed.
 */
export function seedTokenFromUrl(url: string | null | undefined): AcmePropertyKey | null {
  if (!url) return null
  const m = SEED_TOKEN.exec(url)
  const token = m?.[1]?.toLowerCase()
  if (token && token in ACME_PROPERTY_CONTENT) return token as AcmePropertyKey
  return null
}

/**
 * Resolve editorial content for a property from its thumbnail URL,
 * falling back to a name-substring match, then to the flagship entry
 * so a page never renders without copy.
 */
export function resolveAcmeContent(input: {
  thumbnailUrl?: string | null
  name?: string | null
}): AcmePropertyContent {
  const byUrl = seedTokenFromUrl(input.thumbnailUrl)
  if (byUrl) return ACME_PROPERTY_CONTENT[byUrl]

  const name = (input.name ?? "").toLowerCase()
  for (const { match, key } of NAME_FALLBACKS) {
    if (name.includes(match)) return ACME_PROPERTY_CONTENT[key]
  }
  return ACME_PROPERTY_CONTENT["acme-grand"]
}
