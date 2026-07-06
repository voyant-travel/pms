import { describe, expect, it } from "vitest"
import {
  buildCreateBody,
  canSearch,
  emptyGuest,
  isGuestValid,
  isStayValid,
  type NewReservationForm,
  type ReservationPick,
} from "./new-reservation-model"

const form: NewReservationForm = {
  checkIn: "2026-07-13",
  checkOut: "2026-07-15",
  adults: 2,
  children: 0,
  rooms: 1,
}

const pick: ReservationPick = {
  roomTypeId: "rt_1",
  roomTypeName: "Classic Double",
  ratePlanId: "rp_1",
  ratePlanName: "Flexible",
  totalAmountCents: 24000,
  currency: "EUR",
}

describe("isStayValid", () => {
  it("accepts a positive half-open window", () => {
    expect(isStayValid({ checkIn: "2026-07-13", checkOut: "2026-07-15" })).toBe(true)
  })
  it("rejects a zero or reversed window", () => {
    expect(isStayValid({ checkIn: "2026-07-13", checkOut: "2026-07-13" })).toBe(false)
    expect(isStayValid({ checkIn: "2026-07-15", checkOut: "2026-07-13" })).toBe(false)
  })
  it("rejects a blank date", () => {
    expect(isStayValid({ checkIn: "", checkOut: "2026-07-15" })).toBe(false)
  })
})

describe("canSearch", () => {
  it("requires a valid stay, at least one adult and one room", () => {
    expect(canSearch(form)).toBe(true)
    expect(canSearch({ ...form, adults: 0 })).toBe(false)
    expect(canSearch({ ...form, rooms: 0 })).toBe(false)
    expect(canSearch({ ...form, checkOut: form.checkIn })).toBe(false)
  })
})

describe("isGuestValid", () => {
  it("requires a first and last name", () => {
    expect(isGuestValid({ ...emptyGuest(), firstName: "Grace", lastName: "Hopper" })).toBe(true)
    expect(isGuestValid({ ...emptyGuest(), firstName: "Grace" })).toBe(false)
    expect(isGuestValid({ ...emptyGuest(), firstName: "  ", lastName: "Hopper" })).toBe(false)
  })
})

describe("buildCreateBody", () => {
  it("maps the pick + guest into the POST payload with room quantity", () => {
    const body = buildCreateBody("prop_1", { ...form, rooms: 2 }, pick, {
      ...emptyGuest(),
      firstName: "Grace",
      lastName: "Hopper",
      email: "g@x.io",
    })
    expect(body.selections).toEqual([{ roomTypeId: "rt_1", ratePlanId: "rp_1", quantity: 2 }])
    expect(body.occupancy).toEqual({ adults: 2, children: 0, infants: 0 })
    expect(body.guest.email).toBe("g@x.io")
  })
  it("omits blank optional guest fields", () => {
    const body = buildCreateBody("prop_1", form, pick, {
      ...emptyGuest(),
      firstName: "Grace",
      lastName: "Hopper",
    })
    expect(body.guest.email).toBeUndefined()
    expect(body.guest.phone).toBeUndefined()
    expect(body.notes).toBeUndefined()
  })
})
