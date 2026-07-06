"use client"

/**
 * Data hooks for the guest post-booking surfaces.
 *
 * `useStayBookingDetail` fetches the rich, guest-authorized stay detail from
 * the template route `GET /v1/public/stay-bookings/:bookingId`. Authorization
 * is by traveler-email match (`?email=`) — the confirmation page passes the
 * stashed payer email; the manage page passes the email the guest just
 * verified via `/guest-lookup`. A 404 is surfaced as a typed `notFound` flag
 * (never as data) so a guessed id can't render someone else's stay.
 *
 * `usePaymentSummary` does a single (non-polling) read of the public
 * `checkout-status` endpoint to surface the payment state + any proforma /
 * invoice number for the manage view.
 */

import { useQuery } from "@tanstack/react-query"

import { getApiUrl } from "@/lib/env"
import type { StayBookingDetail } from "./booking-view-model"

export interface StayBookingQueryResult {
  detail: StayBookingDetail | null
  isLoading: boolean
  isError: boolean
  notFound: boolean
}

export function useStayBookingDetail(
  bookingId: string | null | undefined,
  options: { email?: string | null; enabled?: boolean } = {},
): StayBookingQueryResult {
  const email = options.email ?? null
  const enabled = (options.enabled ?? true) && Boolean(bookingId)

  const query = useQuery({
    queryKey: ["stay-booking-detail", bookingId, email],
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<StayBookingDetail | "not_found"> => {
      const url = new URL(
        `${getApiUrl()}/v1/public/stay-bookings/${encodeURIComponent(bookingId as string)}`,
      )
      if (email) url.searchParams.set("email", email)
      const res = await fetch(url, { credentials: "include" })
      if (res.status === 404) return "not_found"
      if (!res.ok) throw new Error(`stay_booking_detail_failed_${res.status}`)
      const json = (await res.json()) as { data?: StayBookingDetail }
      if (!json.data) throw new Error("stay_booking_detail_empty")
      return json.data
    },
  })

  const notFound = query.data === "not_found"
  return {
    detail: notFound || !query.data ? null : (query.data as StayBookingDetail),
    isLoading: query.isLoading,
    isError: query.isError,
    notFound,
  }
}

export type PaymentState = "paid" | "pending" | "failed"

export interface PaymentSummary {
  status: PaymentState | null
  invoiceNumber: string | null
}

interface CheckoutStatusResponse {
  paymentStatus: PaymentState
  bankTransferInstructions: { proformaNumber: string | null } | null
  session: { invoiceId: string | null } | null
}

export function usePaymentSummary(
  bookingId: string | null | undefined,
  options: { enabled?: boolean } = {},
): PaymentSummary {
  const enabled = (options.enabled ?? true) && Boolean(bookingId)
  const { data } = useQuery({
    queryKey: ["stay-booking-payment", bookingId],
    enabled,
    staleTime: 15_000,
    retry: false,
    queryFn: async (): Promise<PaymentSummary> => {
      const res = await fetch(
        `${getApiUrl()}/v1/public/bookings/${encodeURIComponent(bookingId as string)}/checkout-status`,
        { credentials: "include" },
      )
      if (!res.ok) return { status: null, invoiceNumber: null }
      const json = (await res.json()) as { data?: CheckoutStatusResponse }
      const d = json.data
      return {
        status: d?.paymentStatus ?? null,
        invoiceNumber: d?.bankTransferInstructions?.proformaNumber ?? null,
      }
    },
  })
  return data ?? { status: null, invoiceNumber: null }
}
