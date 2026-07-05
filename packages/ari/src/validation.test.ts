import { describe, expect, it } from "vitest"

import {
  bulkInventoryInputSchema,
  bulkRatesInputSchema,
  calendarQuerySchema,
  insertRatePlanSchema,
  insertRoomTypeSchema,
  roomTypeListQuerySchema,
  updateRoomTypeSchema,
} from "./validation"

describe("insertRoomTypeSchema", () => {
  it("defaults inventoryMode to pooled and requires name + propertyId", () => {
    const parsed = insertRoomTypeSchema.parse({ propertyId: "prop_1", name: "Deluxe" })
    expect(parsed.inventoryMode).toBe("pooled")
  })
  it("rejects an unknown inventoryMode", () => {
    expect(
      insertRoomTypeSchema.safeParse({ propertyId: "p", name: "x", inventoryMode: "bogus" })
        .success,
    ).toBe(false)
  })
  it("rejects a missing name", () => {
    expect(insertRoomTypeSchema.safeParse({ propertyId: "p" }).success).toBe(false)
  })
})

describe("updateRoomTypeSchema", () => {
  it("is a partial that cannot move propertyId", () => {
    const parsed = updateRoomTypeSchema.parse({ name: "Renamed", propertyId: "prop_2" })
    expect(parsed).not.toHaveProperty("propertyId")
    expect(parsed.name).toBe("Renamed")
  })
})

describe("insertRatePlanSchema", () => {
  it("defaults chargeFrequency + guaranteeMode and requires a 3-char currency", () => {
    const parsed = insertRatePlanSchema.parse({
      propertyId: "prop_1",
      code: "BAR",
      name: "Best Available",
      currencyCode: "EUR",
    })
    expect(parsed.chargeFrequency).toBe("per_night")
    expect(parsed.guaranteeMode).toBe("none")
    expect(
      insertRatePlanSchema.safeParse({
        propertyId: "p",
        code: "c",
        name: "n",
        currencyCode: "EURO",
      }).success,
    ).toBe(false)
  })
})

describe("roomTypeListQuerySchema", () => {
  it("coerces pagination and parses the boolean-string active filter", () => {
    const parsed = roomTypeListQuerySchema.parse({ limit: "10", offset: "5", active: "true" })
    expect(parsed).toMatchObject({ limit: 10, offset: 5, active: true })
    expect(roomTypeListQuerySchema.parse({ active: "false" }).active).toBe(false)
    expect(roomTypeListQuerySchema.safeParse({ active: "yes" }).success).toBe(false)
  })
})

describe("calendarQuerySchema", () => {
  it("requires propertyId + ISO dates", () => {
    expect(
      calendarQuerySchema.safeParse({ propertyId: "p", from: "2026-07-01", to: "2026-07-31" })
        .success,
    ).toBe(true)
    expect(
      calendarQuerySchema.safeParse({ propertyId: "p", from: "07/01/2026", to: "2026-07-31" })
        .success,
    ).toBe(false)
  })
})

describe("bulk input schemas", () => {
  it("requires at least one rate operation with sell amount + weekday range 1..7", () => {
    expect(bulkRatesInputSchema.safeParse({ operations: [] }).success).toBe(false)
    const ok = bulkRatesInputSchema.parse({
      operations: [
        {
          ratePlanId: "rp_1",
          roomTypeId: "rt_1",
          from: "2026-07-01",
          to: "2026-07-31",
          weekdays: [1, 2, 3, 4, 5],
          sellCurrency: "EUR",
          sellAmountCents: 12000,
        },
      ],
    })
    expect(ok.operations).toHaveLength(1)
    expect(
      bulkRatesInputSchema.safeParse({
        operations: [
          {
            ratePlanId: "rp_1",
            roomTypeId: "rt_1",
            from: "2026-07-01",
            to: "2026-07-31",
            weekdays: [0],
            sellCurrency: "EUR",
            sellAmountCents: 1,
          },
        ],
      }).success,
    ).toBe(false)
  })

  it("requires capacity on an inventory operation", () => {
    expect(
      bulkInventoryInputSchema.safeParse({
        operations: [{ roomTypeId: "rt_1", from: "2026-07-01", to: "2026-07-02" }],
      }).success,
    ).toBe(false)
    expect(
      bulkInventoryInputSchema.safeParse({
        operations: [{ roomTypeId: "rt_1", from: "2026-07-01", to: "2026-07-02", capacity: 5 }],
      }).success,
    ).toBe(true)
  })
})
