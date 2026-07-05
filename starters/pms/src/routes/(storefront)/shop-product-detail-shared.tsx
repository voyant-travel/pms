import { Link } from "@tanstack/react-router"
import { Button } from "@voyant-travel/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { Label } from "@voyant-travel/ui/components/label"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import type React from "react"

import { type StorefrontMessages, useStorefrontMessagesOrDefault } from "@/lib/storefront-i18n"
import type { ContentResolution } from "./shop-product-detail-content"

type DetailSharedMessages = StorefrontMessages["shopDetailShared"]

export interface AvailabilitySlot {
  id: string
  dateLocal: string
  startsAt: string
  endsAt?: string | null
  timezone: string
  status: string
  unlimited: boolean
  remainingPax?: number | null
  initialPax?: number | null
  nights?: number | null
  days?: number | null
}

export function DetailLayout({
  body,
  sidebar,
}: {
  body: React.ReactNode
  sidebar: React.ReactNode
}): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-6 pb-24 lg:grid-cols-3 lg:pb-0">
      <div className="space-y-4 lg:col-span-2">{body}</div>
      <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit">{sidebar}</aside>
    </div>
  )
}

export function BookingSidebar({
  children,
  totalPax,
  totalCents,
  currency,
  isQuoting,
  quoteData,
  disabled,
  onBook,
}: {
  children: React.ReactNode
  totalPax: number
  totalCents: number
  currency: string | undefined
  isQuoting: boolean
  quoteData: { available?: boolean; invalidReason?: string } | null | undefined
  disabled: boolean
  onBook: () => void
}): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().shopDetailShared
  const priceLabel =
    totalCents > 0 && currency
      ? t.priceFrom.replace("{amount}", formatMoney(totalCents, currency))
      : quoteData?.invalidReason
        ? "—"
        : t.pricePending
  const guestsLabel = totalPax === 1 ? t.guestSingular : t.guestPlural

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t.bookThis}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {totalPax} {guestsLabel}
            </span>
            {isQuoting && !quoteData ? <Skeleton className="h-4 w-20" /> : null}
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-medium">{t.subtotal}</span>
            <span className="font-medium text-xl">{priceLabel}</span>
          </div>
          {quoteData?.invalidReason ? (
            <p className="text-amber-600 text-xs">
              {humanizeInvalidReason(quoteData.invalidReason, t)}
            </p>
          ) : null}
          <Button type="button" className="w-full" disabled={disabled} onClick={onBook}>
            {t.book}
          </Button>
          <p className="text-muted-foreground text-xs">{t.noChargeYet}</p>
        </CardContent>
      </Card>

      {/* Mobile fixed bottom panel — collapses sidebar on narrow viewports */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background p-3 shadow-lg lg:hidden">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-muted-foreground text-xs">
              {totalPax} {guestsLabel}
            </div>
            <div className="font-medium">{priceLabel}</div>
          </div>
          <Button type="button" disabled={disabled} onClick={onBook}>
            {t.book}
          </Button>
        </div>
      </div>
    </>
  )
}

export function DepartureSelect({
  slots,
  isLoading,
  isError,
  value,
  onChange,
}: {
  slots: ReadonlyArray<AvailabilitySlot>
  isLoading: boolean
  isError: boolean
  value: string | undefined
  onChange: (id: string) => void
}): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().shopDetailShared
  return (
    <div className="space-y-1">
      <Label htmlFor="departure-select">{t.departure}</Label>
      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : isError ? (
        <p className="text-destructive text-sm">{t.departuresUnavailable}</p>
      ) : slots.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.noUpcomingDepartures}</p>
      ) : (
        <select
          id="departure-select"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {formatSlotLabel(slot, t.slotLeft, t.nightsShort, t.daysShort)}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

export function PaxBlock({
  adult,
  child,
  infant,
  setAdult,
  setChild,
  setInfant,
  showInfants = true,
}: {
  adult: number
  child: number
  infant: number
  setAdult: (n: number) => void
  setChild: (n: number) => void
  setInfant: (n: number) => void
  showInfants?: boolean
}): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().shopDetailShared
  return (
    <div className="space-y-3">
      <Label>{t.travelers}</Label>
      <PaxStepper
        label={t.adults}
        hint={t.adultsHint}
        value={adult}
        setValue={setAdult}
        min={1}
        max={8}
      />
      <PaxStepper
        label={t.children}
        hint={t.childrenHint}
        value={child}
        setValue={setChild}
        min={0}
        max={6}
      />
      {showInfants ? (
        <PaxStepper
          label={t.infants}
          hint={t.infantsHint}
          value={infant}
          setValue={setInfant}
          min={0}
          max={4}
        />
      ) : null}
    </div>
  )
}

export function PaxStepper({
  label,
  hint,
  value,
  setValue,
  min,
  max,
}: {
  label: string
  hint: string
  value: number
  setValue: (n: number) => void
  min: number
  max: number
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="font-medium text-sm">{label}</div>
        <div className="text-muted-foreground text-xs">{hint}</div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={value <= min}
          onClick={() => setValue(value - 1)}
        >
          −
        </Button>
        <span className="min-w-6 text-center">{value}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={value >= max}
          onClick={() => setValue(value + 1)}
        >
          +
        </Button>
      </div>
    </div>
  )
}

export function ContentResolutionHint({
  resolution,
}: {
  resolution: ContentResolution | null
}): React.ReactElement | null {
  const t = useStorefrontMessagesOrDefault().shopDetailShared
  if (!resolution) return null
  const hints: string[] = []
  if (resolution.match_kind && resolution.match_kind !== "exact" && resolution.served_locale) {
    hints.push(t.servedIn.replace("{locale}", resolution.served_locale))
  }
  if (resolution.machine_translated) {
    hints.push(t.machineTranslated)
  }
  if (resolution.source === "synthesized") {
    hints.push(t.limitedContent)
  }
  if (resolution.served_stale) {
    hints.push(t.refreshing)
  }
  if (hints.length === 0) return null
  return <div className="text-muted-foreground text-xs">{hints.join(" · ")}</div>
}

export function HeroImage({ url, alt }: { url: string; alt: string }): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-lg border">
      <img src={url} alt={alt} className="aspect-[16/9] w-full object-cover" />
    </div>
  )
}

export function BackLink(): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().shopDetailShared
  return (
    <p>
      <Link to="/shop" className="text-sm underline">
        {t.backToAll}
      </Link>
    </p>
  )
}

export function BodySkeleton(): React.ReactElement {
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-64 w-full" />
      </CardContent>
    </Card>
  )
}

export function BodyMissing({
  entityModule,
  entityId,
}: {
  entityModule: string
  entityId: string
}): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().shopDetailShared
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">
          {entityModule} · {entityId}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-muted-foreground text-sm">
        <p>{t.detailUnavailable}</p>
        <BackLink />
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

export function formatSlotLabel(
  slot: AvailabilitySlot,
  leftLabel: string,
  nightsShort: string,
  daysShort: string,
): string {
  const date = new Date(slot.startsAt)
  const dateStr = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  const duration = slot.nights
    ? ` · ${nightsShort.replace("{count}", String(slot.nights))}`
    : slot.days
      ? ` · ${daysShort.replace("{count}", String(slot.days))}`
      : ""
  const capacity = slot.unlimited
    ? ""
    : slot.remainingPax != null
      ? ` · ${slot.remainingPax} ${leftLabel}`
      : ""
  return `${dateStr} ${time}${duration}${capacity}`
}

export function formatSailingDate(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

function humanizeInvalidReason(reason: string, t: DetailSharedMessages): string {
  switch (reason) {
    case "unavailable":
      return t.invalidUnavailable
    case "departure_not_found":
      return t.invalidDepartureNotFound
    case "departure_unavailable":
      return t.invalidDepartureUnavailable
    case "no_sell_amount_configured":
      return t.invalidNoSellAmount
    case "product_not_found":
      return t.invalidProductNotFound
    case "cruise_not_found":
      return t.invalidCruiseNotFound
    case "property_not_found":
      return t.invalidPropertyNotFound
    case "no_price_for_occupancy":
      return t.invalidNoPriceForOccupancy
    default:
      return reason
  }
}
