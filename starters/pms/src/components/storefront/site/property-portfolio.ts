/**
 * Portfolio grouping for the Acme storefront.
 *
 * The accommodations catalog indexes **room types** (one document per
 * `hrmt_…`), each carrying its parent `propertyId` and a property-stable
 * thumbnail seed. The hotel-group storefront wants **properties**, so
 * this module collapses the room-type hits into one group per property,
 * preserving a representative room-type id used both to link to the
 * property page and to fetch the property's content aggregate (the
 * content endpoint accepts any room-type id and returns the whole hotel).
 *
 * Pure + framework-free so the (otherwise inline) grouping is testable
 * without a live catalog.
 */

export interface PropertyGroup {
  propertyId: string
  /** A room-type id belonging to this property — used as the storefront
   *  entity id for links and content fetches. */
  representativeRoomId: string
  /** Property-stable thumbnail seed URL (drives imagery + copy lookup). */
  thumbnailUrl: string | null
  /** All room-type ids for this property, in catalog order. */
  roomTypeIds: string[]
}

interface SearchHitLike {
  id: string
  document?: { fields?: Record<string, unknown> }
}

interface SearchResultLike {
  hits?: ReadonlyArray<SearchHitLike>
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined
}

/**
 * Group accommodation room-type search hits into one entry per property,
 * in first-seen order. Hits without a resolvable `propertyId` fall back
 * to their own id as the group key so nothing is silently dropped.
 */
export function groupHitsByProperty(result: SearchResultLike | undefined): PropertyGroup[] {
  const groups = new Map<string, PropertyGroup>()
  for (const hit of result?.hits ?? []) {
    const fields = hit.document?.fields ?? {}
    const propertyId = readString(fields.propertyId) ?? hit.id
    const thumbnailUrl = readString(fields.thumbnailUrl) ?? null
    const existing = groups.get(propertyId)
    if (existing) {
      existing.roomTypeIds.push(hit.id)
      if (!existing.thumbnailUrl && thumbnailUrl) existing.thumbnailUrl = thumbnailUrl
    } else {
      groups.set(propertyId, {
        propertyId,
        representativeRoomId: hit.id,
        thumbnailUrl,
        roomTypeIds: [hit.id],
      })
    }
  }
  return [...groups.values()]
}
