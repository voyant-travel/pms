"use client"

/**
 * Rich, Acme-branded stay summary shared by the confirmation page and the
 * manage-booking view. Renders the property block, the stay window (dates +
 * property check-in/out times), per-room room-type / rate / board, the guest
 * recap, and a nightly rate breakdown with total, payment status and any
 * invoice/proforma number. Presentation only — data shaping lives in
 * `booking-view-model`.
 */

import { picsum, resolveAcmeContent } from "@/components/storefront/site/property-content"
import { describeRate } from "@/components/storefront/site/rate-plan-label"
import { useStorefrontMessagesOrDefault } from "@/lib/storefront-i18n"
import type { StayBookingDetail, StayRoomLine } from "./booking-view-model"
import { shapeRateBreakdown, totalGuests } from "./booking-view-model"
import { formatDate, formatDayMonth, formatMoney } from "./format"
import type { PaymentSummary } from "./use-stay-booking"

type ManageMessages = ReturnType<typeof useStorefrontMessagesOrDefault>["manageBooking"]

function interp(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""))
}

function plural(one: string, other: string, count: number): string {
  return count === 1 ? one : interp(other, { count })
}

function guestLabel(room: StayRoomLine, t: ManageMessages): string {
  const parts: string[] = [plural(t.adultsOne, t.adultsOther, room.adults)]
  if (room.children > 0) parts.push(plural(t.childrenOne, t.childrenOther, room.children))
  if (room.infants > 0) parts.push(plural(t.infantsOne, t.infantsOther, room.infants))
  return parts.join(" · ")
}

export function StaySummary({
  detail,
  payment,
}: {
  detail: StayBookingDetail
  payment?: PaymentSummary
}): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().manageBooking
  const content = resolveAcmeContent({ name: detail.property.name })
  const breakdown = shapeRateBreakdown(detail)
  const firstRoom = detail.rooms[0]
  const nights = firstRoom?.nightCount ?? 0

  return (
    <div className="overflow-hidden rounded-sm border border-[var(--acme-line-strong)] bg-[var(--acme-surface)] shadow-sm">
      {/* Property block */}
      <div className="relative h-48 sm:h-56">
        <img
          src={picsum(content.gallerySeeds[0], 1200, 560)}
          alt={detail.property.name ?? "Hotel"}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
          <h2 className="acme-serif text-2xl leading-tight text-white sm:text-3xl">
            {detail.property.name ?? "—"}
          </h2>
          {detail.property.address.fullText ? (
            <p className="mt-1 text-sm text-white/85">{detail.property.address.fullText}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-8 p-5 sm:p-7">
        {/* Stay window */}
        <section>
          <p className="acme-eyebrow">{t.stayTitle}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <StayFact
              label={t.checkIn}
              value={formatDate(firstRoom?.checkInDate ?? detail.startDate)}
              sub={detail.property.checkInTime ? `${detail.property.checkInTime}` : undefined}
            />
            <StayFact
              label={t.checkOut}
              value={formatDate(firstRoom?.checkOutDate ?? detail.endDate)}
              sub={detail.property.checkOutTime ? `${detail.property.checkOutTime}` : undefined}
            />
            <StayFact
              label={t.guests}
              value={
                nights > 0
                  ? plural(t.nightsOne, t.nightsOther, nights)
                  : plural(t.nightsOne, t.nightsOther, 0)
              }
              sub={firstRoom ? guestLabel(firstRoom, t) : `${totalGuests(detail)}`}
            />
          </div>
        </section>

        <div className="acme-hairline" />

        {/* Per-room detail */}
        <section className="space-y-5">
          {detail.rooms.map((room, index) => {
            const rate = room.ratePlanName ? describeRate(room.ratePlanName) : null
            return (
              <div key={room.stayItemId} className="space-y-2">
                {detail.rooms.length > 1 ? (
                  <p className="text-[var(--acme-ink-faint)] text-xs uppercase tracking-[0.14em]">
                    {interp(t.roomLabel, { index: index + 1 })}
                  </p>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-3">
                  <StayFact
                    label={t.roomType}
                    value={
                      room.roomCount > 1
                        ? `${room.roomCount} × ${room.roomTypeName ?? "—"}`
                        : (room.roomTypeName ?? "—")
                    }
                  />
                  <StayFact
                    label={t.ratePlan}
                    value={rate?.cancellation ?? room.ratePlanName ?? "—"}
                  />
                  <StayFact label={t.board} value={room.mealPlanName ?? rate?.board ?? "—"} />
                </div>
              </div>
            )
          })}
        </section>

        <div className="acme-hairline" />

        {/* Rate breakdown */}
        <section>
          <p className="acme-eyebrow">{t.rateBreakdownTitle}</p>
          <div className="mt-4 space-y-2 text-sm">
            {breakdown.rooms.flatMap((room) =>
              room.nights.map((night) => (
                <div
                  key={`${room.stayItemId}-${night.date}`}
                  className="flex items-baseline justify-between gap-4"
                >
                  <span className="text-[var(--acme-ink-soft)]">{formatDayMonth(night.date)}</span>
                  <span className="tabular-nums text-[var(--acme-ink)]">
                    {formatMoney(night.amountCents, breakdown.currency)}
                  </span>
                </div>
              )),
            )}
            <div className="acme-hairline my-3" />
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-medium text-[var(--acme-ink)]">{t.total}</span>
              <span className="acme-serif text-xl text-[var(--acme-ink)]">
                {formatMoney(breakdown.totalCents, breakdown.currency)}
              </span>
            </div>
            {payment?.status ? (
              <div className="mt-2 flex items-baseline justify-between gap-4">
                <span className="text-[var(--acme-ink-faint)] text-xs uppercase tracking-wide">
                  {t.paymentStatusLabel}
                </span>
                <span
                  className={
                    payment.status === "paid"
                      ? "font-medium text-[var(--acme-accent-strong)]"
                      : "font-medium text-[var(--acme-ink-soft)]"
                  }
                >
                  {payment.status === "paid" ? t.paid : t.paymentPending}
                </span>
              </div>
            ) : null}
            {payment?.invoiceNumber ? (
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[var(--acme-ink-faint)] text-xs uppercase tracking-wide">
                  {t.invoiceNumber}
                </span>
                <span className="text-[var(--acme-ink)]">{payment.invoiceNumber}</span>
              </div>
            ) : null}
          </div>
        </section>

        <div className="acme-hairline" />

        {/* Guest recap */}
        <section>
          <p className="acme-eyebrow">{t.guestDetailsTitle}</p>
          <ul className="mt-3 space-y-1 text-sm">
            {detail.travelers.map((traveler) => (
              <li key={`${traveler.firstName}-${traveler.lastName}-${traveler.isPrimary}`}>
                <span className="text-[var(--acme-ink)]">
                  {traveler.firstName} {traveler.lastName}
                </span>
                {traveler.isPrimary ? (
                  <span className="ml-2 text-[var(--acme-ink-faint)] text-xs uppercase tracking-wide">
                    {t.leadGuest}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function StayFact({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}): React.ReactElement {
  return (
    <div>
      <div className="text-[var(--acme-ink-faint)] text-xs uppercase tracking-[0.12em]">
        {label}
      </div>
      <div className="acme-serif mt-1 text-lg leading-tight text-[var(--acme-ink)]">{value}</div>
      {sub ? <div className="mt-0.5 text-[var(--acme-ink-soft)] text-sm">{sub}</div> : null}
    </div>
  )
}
