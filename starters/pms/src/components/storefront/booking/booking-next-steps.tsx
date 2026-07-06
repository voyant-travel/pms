"use client"

/**
 * "What's next", property contact, change/cancel guidance and cancellation
 * policy — shared by the confirmation and manage-booking surfaces. There is
 * NO sanctioned public guest-cancel endpoint upstream, so we never expose a
 * cancel action; instead we direct the guest to contact the property (quoting
 * their reference), matching a mature hotel's post-booking UX.
 */

import { picsum, resolveAcmeContent } from "@/components/storefront/site/property-content"
import { describeRate } from "@/components/storefront/site/rate-plan-label"
import { useStorefrontMessagesOrDefault } from "@/lib/storefront-i18n"
import type { StayBookingDetail } from "./booking-view-model"

function interp(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""))
}

/** A stay is refundable when the rate plan says so, or (as a fallback) when
 *  its name doesn't parse to a non-refundable cancellation policy. */
function isRefundable(detail: StayBookingDetail): boolean {
  const room = detail.rooms[0]
  if (!room) return true
  if (room.ratePlanRefundable != null) return room.ratePlanRefundable
  if (room.ratePlanName) return describeRate(room.ratePlanName).cancellation !== "Non-refundable"
  return true
}

export function BookingNextSteps({ detail }: { detail: StayBookingDetail }): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().manageBooking
  const content = resolveAcmeContent({ name: detail.property.name })
  const refundable = isRefundable(detail)
  const checkInTime = detail.property.checkInTime
  const checkOutTime = detail.property.checkOutTime

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {/* What's next */}
      <section className="rounded-sm border border-[var(--acme-line)] bg-[var(--acme-paper)] p-5">
        <p className="acme-eyebrow">{t.whatsNextTitle}</p>
        <ul className="mt-3 space-y-2 text-[var(--acme-ink-soft)] text-sm leading-relaxed">
          {checkInTime ? <li>{interp(t.checkInFrom, { time: checkInTime })}</li> : null}
          {checkOutTime ? <li>{interp(t.checkOutBy, { time: checkOutTime })}</li> : null}
          <li>
            <span className="font-medium text-[var(--acme-ink)]">{t.cancellationTitle}: </span>
            {refundable ? t.cancellationRefundable : t.cancellationNonRefundable}
          </li>
        </ul>
      </section>

      {/* Property contact */}
      <section className="overflow-hidden rounded-sm border border-[var(--acme-line)] bg-[var(--acme-paper)]">
        <div className="flex items-center gap-4 p-5">
          <img
            src={picsum(content.gallerySeeds[0], 160, 160)}
            alt={detail.property.name ?? "Hotel"}
            className="h-16 w-16 shrink-0 rounded-sm object-cover"
          />
          <div className="min-w-0">
            <p className="acme-eyebrow">{t.propertyContactTitle}</p>
            <p className="acme-serif mt-1 truncate text-lg text-[var(--acme-ink)]">
              {detail.property.name ?? "—"}
            </p>
          </div>
        </div>
        <div className="space-y-1 border-t border-[var(--acme-line)] px-5 py-4 text-sm">
          <a
            href={`tel:${content.phone}`}
            className="block text-[var(--acme-accent-strong)] hover:underline"
          >
            {content.phone}
          </a>
          <a
            href={`mailto:${content.email}`}
            className="block break-all text-[var(--acme-accent-strong)] hover:underline"
          >
            {content.email}
          </a>
        </div>
      </section>

      {/* Change / cancel guidance — contact-the-property (no public cancel path) */}
      <section className="rounded-sm border border-[var(--acme-line)] bg-[var(--acme-paper)] p-5 sm:col-span-2">
        <p className="acme-eyebrow">{t.changesTitle}</p>
        <p className="mt-3 text-[var(--acme-ink-soft)] text-sm leading-relaxed">{t.changesBody}</p>
      </section>
    </div>
  )
}
