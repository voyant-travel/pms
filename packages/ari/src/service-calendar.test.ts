import type {
  ratePlanDailyRates,
  ratePlanRoomTypes,
  ratePlans,
  roomTypeDailyInventory,
  roomTypes,
} from "@voyant-travel/accommodations/schema"
import { describe, expect, it } from "vitest"

import { assembleCalendar, buildInventoryRows, buildRateRows } from "./service-calendar"

type RoomTypeRow = typeof roomTypes.$inferSelect
type RatePlanRow = typeof ratePlans.$inferSelect
type JoinRow = typeof ratePlanRoomTypes.$inferSelect
type InventoryRow = typeof roomTypeDailyInventory.$inferSelect
type RateRow = typeof ratePlanDailyRates.$inferSelect

const now = new Date("2026-07-04T00:00:00.000Z")

function roomType(over: Partial<RoomTypeRow> & Pick<RoomTypeRow, "id">): RoomTypeRow {
  return {
    propertyId: "prop_1",
    supplierId: null,
    code: null,
    name: "Room",
    description: null,
    inventoryMode: "pooled",
    roomClass: null,
    maxAdults: null,
    maxChildren: null,
    maxInfants: null,
    standardOccupancy: null,
    maxOccupancy: null,
    minOccupancy: null,
    bedroomCount: null,
    bathroomCount: null,
    areaValue: null,
    areaUnit: null,
    accessibilityNotes: null,
    smokingAllowed: false,
    active: true,
    sortOrder: 0,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

function ratePlan(over: Partial<RatePlanRow> & Pick<RatePlanRow, "id">): RatePlanRow {
  return {
    propertyId: "prop_1",
    code: "BAR",
    name: "Best Available",
    description: null,
    mealPlanId: null,
    priceCatalogId: null,
    cancellationPolicyId: null,
    marketId: null,
    currencyCode: "EUR",
    chargeFrequency: "per_night",
    guaranteeMode: "none",
    commissionable: true,
    refundable: true,
    active: true,
    sortOrder: 0,
    customerPaymentPolicy: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

function join(over: Partial<JoinRow> & Pick<JoinRow, "id" | "ratePlanId" | "roomTypeId">): JoinRow {
  return {
    productId: null,
    optionId: null,
    unitId: null,
    active: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

describe("assembleCalendar", () => {
  const roomTypeRows = [
    roomType({ id: "rt_1", name: "Deluxe", code: "DLX" }),
    roomType({ id: "rt_2" }),
  ]
  const ratePlanRows = [ratePlan({ id: "rp_1" }), ratePlan({ id: "rp_2", code: "NRF" })]

  it("maps active joins to each room type's rate-plan list and ignores inactive joins", () => {
    const grid = assembleCalendar({
      propertyId: "prop_1",
      from: "2026-07-01",
      to: "2026-07-02",
      roomTypeRows,
      ratePlanRows,
      joinRows: [
        join({ id: "rprt_1", ratePlanId: "rp_1", roomTypeId: "rt_1" }),
        join({ id: "rprt_2", ratePlanId: "rp_2", roomTypeId: "rt_1" }),
        join({ id: "rprt_3", ratePlanId: "rp_1", roomTypeId: "rt_2", active: false }),
      ],
      inventoryRows: [],
      rateRows: [],
    })
    expect(grid.roomTypes.find((r) => r.id === "rt_1")?.ratePlanIds).toEqual(["rp_1", "rp_2"])
    expect(grid.roomTypes.find((r) => r.id === "rt_2")?.ratePlanIds).toEqual([])
    expect(grid.ratePlans.map((p) => p.id)).toEqual(["rp_1", "rp_2"])
  })

  it("projects inventory + rate cells to the wire shape", () => {
    const inventoryRows: InventoryRow[] = [
      {
        id: "rtdi_1",
        roomTypeId: "rt_1",
        date: "2026-07-01",
        capacity: 5,
        closed: false,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      },
    ]
    const rateRows: RateRow[] = [
      {
        id: "rpdr_1",
        ratePlanId: "rp_1",
        roomTypeId: "rt_1",
        date: "2026-07-01",
        sellCurrency: "EUR",
        sellAmountCents: 12000,
        costCurrency: null,
        costAmountCents: null,
        taxAmountCents: null,
        feeAmountCents: null,
        occupancyBasis: "room",
        includedAdults: 2,
        includedChildren: 0,
        includedInfants: 0,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      },
    ]
    const grid = assembleCalendar({
      propertyId: "prop_1",
      from: "2026-07-01",
      to: "2026-07-01",
      roomTypeRows,
      ratePlanRows,
      joinRows: [],
      inventoryRows,
      rateRows,
    })
    expect(grid.inventory).toEqual([
      { roomTypeId: "rt_1", date: "2026-07-01", capacity: 5, closed: false },
    ])
    expect(grid.rates[0]).toMatchObject({
      ratePlanId: "rp_1",
      roomTypeId: "rt_1",
      date: "2026-07-01",
      sellAmountCents: 12000,
      occupancyBasis: "room",
      includedAdults: 2,
    })
  })
})

describe("buildRateRows", () => {
  it("expands a weekday-masked range and applies upstream defaults", () => {
    const rows = buildRateRows([
      {
        ratePlanId: "rp_1",
        roomTypeId: "rt_1",
        from: "2026-07-06", // Monday
        to: "2026-07-12", // Sunday
        weekdays: [6, 7],
        sellCurrency: "EUR",
        sellAmountCents: 15000,
      },
    ])
    expect(rows.map((r) => r.date)).toEqual(["2026-07-11", "2026-07-12"])
    expect(rows[0]).toMatchObject({
      occupancyBasis: "room",
      includedAdults: 2,
      includedChildren: 0,
      includedInfants: 0,
      costAmountCents: null,
    })
  })

  it("dedupes on the natural key (ratePlanId, roomTypeId, date) with last-write-wins", () => {
    const rows = buildRateRows([
      {
        ratePlanId: "rp_1",
        roomTypeId: "rt_1",
        from: "2026-07-01",
        to: "2026-07-01",
        sellCurrency: "EUR",
        sellAmountCents: 100,
      },
      {
        ratePlanId: "rp_1",
        roomTypeId: "rt_1",
        from: "2026-07-01",
        to: "2026-07-01",
        sellCurrency: "EUR",
        sellAmountCents: 200,
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].sellAmountCents).toBe(200)
  })
})

describe("buildInventoryRows", () => {
  it("expands a full range and dedupes on (roomTypeId, date)", () => {
    const rows = buildInventoryRows([
      { roomTypeId: "rt_1", from: "2026-07-01", to: "2026-07-03", capacity: 4 },
      { roomTypeId: "rt_1", from: "2026-07-03", to: "2026-07-03", capacity: 9, closed: true },
    ])
    expect(rows).toHaveLength(3)
    const last = rows.find((r) => r.date === "2026-07-03")
    expect(last).toMatchObject({ capacity: 9, closed: true })
  })
})
