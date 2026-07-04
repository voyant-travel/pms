"use client"

import { useQuery } from "@tanstack/react-query"
import { formatMessage } from "@voyant-travel/i18n"
import { CalendarClock, Package, Users } from "lucide-react"

import { useAdminMessages } from "@/lib/admin-i18n"
import { getApiUrl } from "@/lib/env"

type PaymentLinkSummaryMessages = ReturnType<
  typeof useAdminMessages
>["bookings"]["detail"]["paymentLinkSummary"]

interface BookingSummaryItem {
  id: string
  productName: string
  optionName: string | null
  unitName: string | null
  departureLabel: string | null
  startsAt: string | null
  endsAt: string | null
  serviceDate: string | null
  quantity: number
  itemType: string
  amountCents: number | null
  currency: string
}

interface BookingSummary {
  bookingId: string
  bookingNumber: string
  status: string
  pax: number | null
  startDate: string | null
  endDate: string | null
  chargeAmountCents: number | null
  currency: string
  bookingTotalAmountCents: number | null
  bookingCurrency: string
  items: BookingSummaryItem[]
}

interface BookingSummaryResponse {
  data: BookingSummary | null
}

export interface PaymentLinkBookingSummaryState {
  status: "loading" | "ready" | "empty"
  node: React.ReactNode
}

/**
 * Fetches the structured booking context for a payment link and
 * returns the summary card. Mirrors `usePaymentLinkTripSummary` but
 * for admin-initiated booking-attached sessions. The page uses the
 * `status` field to decide whether to suppress its default "notes"
 * paragraph.
 *
 *   - `loading` → render the skeleton, keep notes hidden.
 *   - `ready`   → render the card; the caller should hide notes.
 *   - `empty`   → session isn't a single-booking checkout; render nothing.
 */
export function usePaymentLinkBookingSummary(sessionId: string): PaymentLinkBookingSummaryState {
  const t = useAdminMessages().bookings.detail.paymentLinkSummary
  const query = useQuery({
    queryKey: ["payment-link-booking-summary", sessionId],
    queryFn: async (): Promise<BookingSummary | null> => {
      const res = await fetch(
        `${getApiUrl()}/v1/public/payment-link/${encodeURIComponent(sessionId)}/booking-summary`,
        { headers: { Accept: "application/json" } },
      )
      if (!res.ok) throw new Error(`booking-summary fetch failed: ${res.status}`)
      const body = (await res.json()) as BookingSummaryResponse
      return body.data
    },
    staleTime: 60_000,
  })

  if (query.isLoading) return { status: "loading", node: <BookingSummarySkeleton /> }
  const booking = query.data
  if (!booking || booking.items.length === 0) return { status: "empty", node: null }
  return { status: "ready", node: <BookingSummaryCard booking={booking} messages={t} /> }
}

function BookingSummaryCard({
  booking,
  messages,
}: {
  booking: BookingSummary
  messages: PaymentLinkSummaryMessages
}) {
  const partial =
    booking.chargeAmountCents != null &&
    booking.bookingTotalAmountCents != null &&
    booking.chargeAmountCents < booking.bookingTotalAmountCents

  return (
    <section
      aria-label={messages.ariaLabel}
      className="flex flex-col gap-3 rounded-md border bg-card p-5 shadow-sm"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium text-base">{messages.heading}</h2>
        <span className="font-mono text-muted-foreground text-xs">{booking.bookingNumber}</span>
      </header>
      <ul className="flex flex-col gap-3">
        {booking.items.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-3 border-b pb-3 last:border-b-0 last:pb-0"
          >
            <div
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
            >
              <Package className="size-4" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate font-medium text-sm">{item.productName}</p>
              {item.optionName || item.unitName ? (
                <p className="truncate text-muted-foreground text-xs">
                  {[item.optionName, item.unitName].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <ScheduleLine item={item} />
            </div>
            <div className="shrink-0 text-right text-sm">
              {item.quantity > 1 ? (
                <span className="block text-muted-foreground text-xs">× {item.quantity}</span>
              ) : null}
              <span className="font-medium tabular-nums">
                {formatMoney(item.amountCents, item.currency)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {booking.pax != null ? (
        <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Users className="size-3" aria-hidden />
          {booking.pax === 1
            ? messages.travelerSingular
            : formatMessage(messages.travelerPlural, { count: booking.pax })}
        </p>
      ) : null}
      <div className="flex flex-col gap-1 border-t pt-3">
        {partial ? (
          <div className="flex items-baseline justify-between text-muted-foreground text-xs">
            <span className="uppercase tracking-wider">{messages.bookingTotal}</span>
            <span className="font-mono tabular-nums">
              {formatMoney(booking.bookingTotalAmountCents, booking.bookingCurrency)}
            </span>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground text-sm uppercase tracking-wider">
            {partial ? messages.dueNow : messages.totalPayable}
          </span>
          <span className="font-semibold text-base tabular-nums">
            {formatMoney(booking.chargeAmountCents, booking.currency)}
          </span>
        </div>
      </div>
    </section>
  )
}

function ScheduleLine({ item }: { item: BookingSummaryItem }) {
  const label =
    item.departureLabel ?? formatScheduleRange(item.startsAt, item.endsAt) ?? item.serviceDate
  if (!label) return null
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-xs">
      <CalendarClock className="size-3" aria-hidden />
      {label}
    </span>
  )
}

function BookingSummarySkeleton() {
  return (
    <section className="flex flex-col gap-3 rounded-md border bg-card p-5 shadow-sm">
      <div className="h-4 w-24 animate-pulse rounded-md bg-muted" />
      <ul className="flex flex-col gap-3">
        {[0, 1].map((index) => (
          <li
            key={`booking-skeleton-${index}`}
            className="flex items-start gap-3 border-b pb-3 last:border-b-0 last:pb-0"
          >
            <div className="size-10 shrink-0 animate-pulse rounded-md bg-muted" />
            <div className="flex flex-1 flex-col gap-2 py-1">
              <div className="h-3 w-40 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-24 animate-pulse rounded bg-muted/70" />
            </div>
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          </li>
        ))}
      </ul>
    </section>
  )
}

function formatMoney(amountCents: number | null | undefined, currency: string | null | undefined) {
  if (amountCents == null) return "—"
  return (amountCents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: currency ?? "EUR",
  })
}

function formatScheduleRange(startsAt: string | null, endsAt: string | null): string | null {
  if (!startsAt) return null
  const start = formatDateTime(startsAt)
  if (!start) return null
  if (!endsAt || endsAt === startsAt) return start
  const end = formatDateTime(endsAt)
  if (!end) return start
  return `${start} → ${end}`
}

function formatDateTime(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}
