/**
 * Pure form state + guards for the New reservation page. Kept db- and React-free
 * so the progressive-flow logic (when can you search, when can you create, what
 * body to POST) is unit-tested without rendering.
 */

import type { CreateReservationBody } from "./front-desk-client"
import { nightsBetween } from "./front-desk-dates"

export interface NewReservationForm {
  checkIn: string
  checkOut: string
  adults: number
  children: number
  rooms: number
}

export interface GuestForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  notes: string
}

/** The room type × rate plan the desk picked, carried into the guest step. */
export interface ReservationPick {
  roomTypeId: string
  roomTypeName: string
  ratePlanId: string
  ratePlanName: string
  totalAmountCents: number
  currency: string
}

export function emptyGuest(): GuestForm {
  return { firstName: "", lastName: "", email: "", phone: "", notes: "" }
}

/** Dates form a valid, positive stay window (needed before an availability probe). */
export function isStayValid(form: Pick<NewReservationForm, "checkIn" | "checkOut">): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(form.checkIn) &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.checkOut) &&
    nightsBetween(form.checkIn, form.checkOut) > 0
  )
}

export function canSearch(form: NewReservationForm): boolean {
  return isStayValid(form) && form.adults >= 1 && form.rooms >= 1
}

export function isGuestValid(guest: GuestForm): boolean {
  return guest.firstName.trim().length > 0 && guest.lastName.trim().length > 0
}

/** Assemble the create payload from the picked room and the guest step. */
export function buildCreateBody(
  propertyId: string,
  form: NewReservationForm,
  pick: ReservationPick,
  guest: GuestForm,
): CreateReservationBody {
  return {
    propertyId,
    checkIn: form.checkIn,
    checkOut: form.checkOut,
    occupancy: { adults: form.adults, children: form.children, infants: 0 },
    selections: [
      { roomTypeId: pick.roomTypeId, ratePlanId: pick.ratePlanId, quantity: form.rooms },
    ],
    guest: {
      firstName: guest.firstName.trim(),
      lastName: guest.lastName.trim(),
      email: guest.email.trim() || undefined,
      phone: guest.phone.trim() || undefined,
    },
    notes: guest.notes.trim() || undefined,
  }
}
