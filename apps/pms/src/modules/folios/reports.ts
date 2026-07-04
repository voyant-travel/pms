/**
 * PURE daily-report math (PLAN §4.4). The standard hotel KPIs for a business
 * date, computed from counts + posting sums the query layer supplies. No db — the
 * service resolves occupied/sellable unit counts, rooms sold, and the day's
 * postings, then calls `buildDailyReport`. Edge cases (zero rooms sold, zero
 * sellable) return 0 rather than NaN/Infinity.
 *
 * Definitions:
 *   - occupancy %  = occupied units / sellable units
 *   - rooms sold   = occupied room-nights for D (sum of in-house stays' roomCount)
 *   - room revenue = sum of `room`-type postings for D (minor units)
 *   - ADR          = room revenue / rooms sold        (Average Daily Rate)
 *   - RevPAR       = room revenue / sellable units    (Revenue Per Available Room)
 *   - revenue by type = signed sum of each posting type for D
 */

/** Minimal posting shape for report sums (structural). */
export interface ReportPosting {
  type: string
  amountCents: number
}

/** Occupancy as a 0..1 ratio; 0 when there are no sellable units. */
export function computeOccupancy(occupiedUnits: number, sellableUnits: number): number {
  if (sellableUnits <= 0) return 0
  return occupiedUnits / sellableUnits
}

/** ADR in minor units; 0 when no rooms were sold (avoids divide-by-zero). */
export function computeAdrCents(roomRevenueCents: number, roomsSold: number): number {
  if (roomsSold <= 0) return 0
  return Math.round(roomRevenueCents / roomsSold)
}

/** RevPAR in minor units; 0 when there are no sellable units. */
export function computeRevParCents(roomRevenueCents: number, sellableUnits: number): number {
  if (sellableUnits <= 0) return 0
  return Math.round(roomRevenueCents / sellableUnits)
}

/** Signed sum of each posting type for the day (e.g. `{ room, tax, payment }`). */
export function sumRevenueByType(postings: readonly ReportPosting[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of postings) out[p.type] = (out[p.type] ?? 0) + p.amountCents
  return out
}

export interface DailyReportInput {
  propertyId: string
  date: string
  occupiedUnits: number
  sellableUnits: number
  roomsSold: number
  postings: readonly ReportPosting[]
}

export interface DailyReport {
  propertyId: string
  date: string
  occupiedUnits: number
  sellableUnits: number
  /** 0..1 (multiply by 100 for a percentage). */
  occupancy: number
  roomsSold: number
  roomRevenueCents: number
  adrCents: number
  revParCents: number
  totalRevenueCents: number
  revenueByType: Record<string, number>
}

/** PURE: assemble the full daily report from resolved inputs. */
export function buildDailyReport(input: DailyReportInput): DailyReport {
  const revenueByType = sumRevenueByType(input.postings)
  const roomRevenueCents = revenueByType.room ?? 0
  // Total revenue = every non-payment charge type netted (room, tax, fee, extra,
  // adjustment, transfer). Payments are money received, not revenue, so excluded.
  const totalRevenueCents = input.postings.reduce(
    (sum, p) => (p.type === "payment" ? sum : sum + p.amountCents),
    0,
  )
  return {
    propertyId: input.propertyId,
    date: input.date,
    occupiedUnits: input.occupiedUnits,
    sellableUnits: input.sellableUnits,
    occupancy: computeOccupancy(input.occupiedUnits, input.sellableUnits),
    roomsSold: input.roomsSold,
    roomRevenueCents,
    adrCents: computeAdrCents(roomRevenueCents, input.roomsSold),
    revParCents: computeRevParCents(roomRevenueCents, input.sellableUnits),
    totalRevenueCents,
    revenueByType,
  }
}
