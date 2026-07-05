"use client"

import { useQuery } from "@tanstack/react-query"
import { ArrowRight, CalendarClock, ImageOff } from "lucide-react"

import { useAdminMessages } from "@/lib/admin-i18n"
import { getApiUrl } from "@/lib/env"

type PaymentLinkTripMessages = ReturnType<typeof useAdminMessages>["trips"]["paymentLinkSummary"]

interface TripSummaryComponent {
  id: string
  kind: string
  entityModule: string | null
  title: string
  thumbnailUrl: string | null
  thumbnailAlt: string | null
  scheduledStartsAt: string | null
  scheduledEndsAt: string | null
  sourceAmountCents: number | null
  sourceCurrency: string | null
  targetAmountCents: number | null
  targetCurrency: string | null
  fx: { rate: number; quotedAt: string } | null
}

interface TripSummary {
  envelopeId: string
  currency: string
  totalAmountCents: number
  components: TripSummaryComponent[]
}

interface TripSummaryResponse {
  data: TripSummary | null
}

export interface PaymentLinkTripSummaryState {
  status: "loading" | "ready" | "empty"
  node: React.ReactNode
}

/**
 * Fetches the structured trip context for a payment session and returns the
 * summary card alongside a status the caller can use to decide whether to
 * suppress the universal page's default notes paragraph.
 *
 *   - `loading`  → render the skeleton, keep notes hidden too (avoids the
 *     flash of plain notes before structured content arrives).
 *   - `ready`    → render the card; the caller should hide notes.
 *   - `empty`    → session isn't a trip; render nothing and let the
 *     universal page show its default `notes` paragraph.
 */
export function usePaymentLinkTripSummary(sessionId: string): PaymentLinkTripSummaryState {
  const t = useAdminMessages().trips.paymentLinkSummary
  const query = useQuery({
    queryKey: ["payment-link-trip-summary", sessionId],
    queryFn: async (): Promise<TripSummary | null> => {
      const res = await fetch(
        `${getApiUrl()}/v1/public/payment-link/${encodeURIComponent(sessionId)}/trip-summary`,
        { headers: { Accept: "application/json" } },
      )
      if (!res.ok) throw new Error(`trip-summary fetch failed: ${res.status}`)
      const body = (await res.json()) as TripSummaryResponse
      return body.data
    },
    staleTime: 60_000,
  })

  if (query.isLoading) return { status: "loading", node: <TripSummarySkeleton /> }
  const trip = query.data
  if (!trip || trip.components.length === 0) return { status: "empty", node: null }
  return { status: "ready", node: <TripSummaryCard trip={trip} messages={t} /> }
}

function TripSummaryCard({
  trip,
  messages,
}: {
  trip: TripSummary
  messages: PaymentLinkTripMessages
}) {
  const hasFx = trip.components.some((component) => component.fx)
  return (
    <section
      aria-label={messages.ariaLabel}
      className="flex flex-col gap-3 rounded-md border bg-card p-5 shadow-sm"
    >
      <h2 className="font-medium text-base">{messages.heading}</h2>
      <ul className="flex flex-col gap-3">
        {trip.components.map((component) => (
          <li
            key={component.id}
            className="flex items-start gap-3 border-b pb-3 last:border-b-0 last:pb-0"
          >
            <ComponentThumbnail component={component} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate font-medium text-sm">{component.title}</p>
              <ScheduleLine
                startsAt={component.scheduledStartsAt}
                endsAt={component.scheduledEndsAt}
              />
            </div>
            <div className="shrink-0 text-right text-sm">
              <ComponentAmount component={component} />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t pt-3">
        <span className="text-muted-foreground text-sm uppercase tracking-wider">
          {messages.totalPayable}
        </span>
        <span className="font-semibold text-base tabular-nums">
          {formatMoney(trip.totalAmountCents, trip.currency)}
        </span>
      </div>
      {hasFx ? <FxRatesBlock trip={trip} messages={messages} /> : null}
    </section>
  )
}

function ComponentThumbnail({ component }: { component: TripSummaryComponent }) {
  if (component.thumbnailUrl) {
    return (
      <img
        src={component.thumbnailUrl}
        alt={component.thumbnailAlt ?? component.title}
        className="size-14 shrink-0 rounded-md object-cover ring-1 ring-border"
        loading="lazy"
      />
    )
  }
  return (
    <div
      aria-hidden
      className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
    >
      <ImageOff className="size-5" />
    </div>
  )
}

function ScheduleLine({ startsAt, endsAt }: { startsAt: string | null; endsAt: string | null }) {
  if (!startsAt) return null
  const label = formatScheduleRange(startsAt, endsAt)
  if (!label) return null
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-xs">
      <CalendarClock className="size-3" aria-hidden />
      {label}
    </span>
  )
}

function ComponentAmount({ component }: { component: TripSummaryComponent }) {
  const showFxLine =
    component.fx &&
    component.sourceAmountCents != null &&
    component.sourceCurrency &&
    component.targetAmountCents != null &&
    component.targetCurrency &&
    component.sourceCurrency !== component.targetCurrency
  if (showFxLine) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <span className="text-muted-foreground line-through tabular-nums">
          {formatMoney(component.sourceAmountCents, component.sourceCurrency)}
        </span>
        <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
        <span className="font-medium tabular-nums">
          {formatMoney(component.targetAmountCents, component.targetCurrency)}
        </span>
      </div>
    )
  }
  const amount = component.targetAmountCents ?? component.sourceAmountCents
  const currency = component.targetCurrency ?? component.sourceCurrency
  return <span className="font-medium tabular-nums">{formatMoney(amount, currency)}</span>
}

function FxRatesBlock({
  trip,
  messages,
}: {
  trip: TripSummary
  messages: PaymentLinkTripMessages
}) {
  const lines = trip.components
    .filter(
      (component): component is TripSummaryComponent & { fx: { rate: number; quotedAt: string } } =>
        Boolean(component.fx) &&
        Boolean(component.sourceCurrency) &&
        Boolean(component.targetCurrency) &&
        component.sourceCurrency !== component.targetCurrency,
    )
    .map((component, index) => ({
      id: `${component.id}-${index}`,
      text: `${component.sourceCurrency} → ${component.targetCurrency}: ${component.fx.rate.toFixed(4)} quoted ${formatDateOnly(component.fx.quotedAt)}`,
    }))
  // Drop duplicate pair lines (common when several components share the same
  // currency conversion) so the FX block stays clean.
  const seen = new Set<string>()
  const dedupedLines = lines.filter((line) => {
    if (seen.has(line.text)) return false
    seen.add(line.text)
    return true
  })
  if (dedupedLines.length === 0) return null
  return (
    <div className="flex flex-col gap-1 border-t pt-3 text-muted-foreground text-xs">
      <span className="uppercase tracking-wider">{messages.fxRatesLabel}</span>
      {dedupedLines.map((line) => (
        <span key={line.id} className="font-mono">
          {line.text}
        </span>
      ))}
    </div>
  )
}

function TripSummarySkeleton() {
  return (
    <section className="flex flex-col gap-3 rounded-md border bg-card p-5 shadow-sm">
      <div className="h-4 w-20 animate-pulse rounded-md bg-muted" />
      <ul className="flex flex-col gap-3">
        {[0, 1].map((index) => (
          <li
            key={`skeleton-${index}`}
            className="flex items-start gap-3 border-b pb-3 last:border-b-0 last:pb-0"
          >
            <div className="size-14 shrink-0 animate-pulse rounded-md bg-muted" />
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

function formatScheduleRange(startsAt: string, endsAt: string | null): string {
  const start = formatDateTime(startsAt)
  if (!start) return ""
  if (!endsAt || endsAt === startsAt) return start
  const end = formatDateTime(endsAt)
  if (!end) return start
  return `${start} → ${end}`
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function formatDateOnly(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}
