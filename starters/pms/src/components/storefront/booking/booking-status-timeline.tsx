"use client"

/**
 * Booking status timeline for the manage-booking view: confirmed → upcoming
 * → in-house → completed, or a confirmed → cancelled track. The phase
 * derivation is the pure `deriveStayTimeline`; this component only maps step
 * keys to localized labels and renders the Acme-styled stepper.
 */

import { useStorefrontMessagesOrDefault } from "@/lib/storefront-i18n"
import {
  deriveStayTimeline,
  type StayBookingDetail,
  type TimelineStepKey,
} from "./booking-view-model"

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function BookingStatusTimeline({
  detail,
}: {
  detail: StayBookingDetail
}): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().manageBooking
  const firstRoom = detail.rooms[0]
  const steps = deriveStayTimeline({
    status: detail.status,
    checkInDate: firstRoom?.checkInDate ?? detail.startDate,
    checkOutDate: firstRoom?.checkOutDate ?? detail.endDate,
    today: todayIso(),
  })

  const labels: Record<TimelineStepKey, string> = {
    confirmed: t.statusConfirmed,
    upcoming: t.statusUpcoming,
    in_house: t.statusInHouse,
    completed: t.statusCompleted,
    cancelled: t.statusCancelled,
  }

  return (
    <section className="rounded-sm border border-[var(--acme-line-strong)] bg-[var(--acme-surface)] p-5 shadow-sm sm:p-6">
      <p className="acme-eyebrow">{t.timelineTitle}</p>
      <ol className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-0">
        {steps.map((step, index) => {
          const isCancelled = step.key === "cancelled"
          const filled = step.state === "done" || step.state === "current"
          const dotClass = isCancelled
            ? "border-[var(--acme-ink)] bg-[var(--acme-ink)] text-[var(--acme-paper)]"
            : filled
              ? "border-[var(--acme-accent-strong)] bg-[var(--acme-accent)] text-white"
              : "border-[var(--acme-line-strong)] bg-[var(--acme-surface)] text-[var(--acme-ink-faint)]"
          return (
            <li key={step.key} className="flex items-center gap-3 sm:flex-1">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ${dotClass}`}
                  aria-hidden="true"
                >
                  {isCancelled ? "×" : filled ? "✓" : index + 1}
                </span>
                <span
                  className={
                    step.state === "current"
                      ? "font-medium text-[var(--acme-ink)] text-sm"
                      : "text-[var(--acme-ink-soft)] text-sm"
                  }
                >
                  {labels[step.key]}
                </span>
              </div>
              {index < steps.length - 1 ? (
                <span className="hidden h-px flex-1 bg-[var(--acme-line-strong)] sm:mx-3 sm:block" />
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
