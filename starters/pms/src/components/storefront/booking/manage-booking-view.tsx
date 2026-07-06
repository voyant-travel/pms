"use client"

/**
 * Manage-booking view: the rich stay summary + status timeline + next-steps
 * shown after a successful guest lookup. Fetches the guest-authorized stay
 * detail with the verified email (the same `?email=` authorization the
 * lookup used), so a direct hit here still cannot leak another booking.
 */

import { useStorefrontMessagesOrDefault } from "@/lib/storefront-i18n"
import { BookingNextSteps } from "./booking-next-steps"
import { BookingStatusTimeline } from "./booking-status-timeline"
import { buildStayIcs, type StayBookingDetail } from "./booking-view-model"
import { StaySummary } from "./stay-summary"
import { usePaymentSummary, useStayBookingDetail } from "./use-stay-booking"

/** Build the stay's ICS client-side and trigger a file download. */
function downloadStayIcs(detail: StayBookingDetail): void {
  const ics = buildStayIcs(detail)
  if (!ics || typeof document === "undefined") return
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${detail.bookingNumber || "stay"}.ics`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function ManageBookingView({
  bookingId,
  email,
  onReset,
}: {
  bookingId: string
  email: string
  onReset: () => void
}): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().manageBooking
  const { detail, isLoading, notFound } = useStayBookingDetail(bookingId, { email })
  const payment = usePaymentSummary(bookingId)

  if (isLoading) {
    return <p className="text-[var(--acme-ink-soft)] text-sm">{t.lookingUp}</p>
  }
  if (notFound || !detail) {
    return (
      <div className="space-y-4">
        <p className="text-[var(--acme-ink-soft)] text-sm">{t.notFound}</p>
        <button type="button" onClick={onReset} className="acme-btn acme-btn-outline">
          {t.backToLookup}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="acme-eyebrow">{t.navLabel}</p>
          <p className="acme-serif mt-1 text-lg text-[var(--acme-ink)]">{detail.bookingNumber}</p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <button
            type="button"
            onClick={() => downloadStayIcs(detail)}
            className="acme-btn acme-btn-outline"
          >
            {t.addToCalendar}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="acme-btn acme-btn-outline"
          >
            {t.print}
          </button>
          <button type="button" onClick={onReset} className="acme-nav-link text-sm">
            {t.backToLookup}
          </button>
        </div>
      </div>

      <BookingStatusTimeline detail={detail} />
      <StaySummary detail={detail} payment={payment} />
      <BookingNextSteps detail={detail} />
    </div>
  )
}
