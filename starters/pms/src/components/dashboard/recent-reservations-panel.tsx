"use client"

/**
 * Recent reservations panel: the last five reservations (newest first) with
 * their STAY number, guest, stay window, status badge and source. Each row
 * links to the reservation detail (`/bookings/$id`); the header carries a "New
 * reservation" CTA into the front-desk create flow. The bookings admin list is
 * portfolio-wide, so the panel is labelled across all properties.
 */

import { Badge } from "@voyant-travel/ui/components/badge"
import { buttonVariants } from "@voyant-travel/ui/components/button"
import { CalendarPlus } from "lucide-react"
import { dashboardMessages as M } from "./dashboard-messages"
import { type ReservationTone, recentReservationView } from "./dashboard-model"
import { EmptyLine, ErrorLine, PanelCard, PanelLink, SkeletonRows } from "./dashboard-ui"
import { useRecentReservations } from "./use-dashboard-data"

const NEW_RESERVATION_HREF = "/front-desk/reservations/new"
const RESERVATIONS_HREF = "/bookings"

const TONE_VARIANT: Record<ReservationTone, "default" | "secondary" | "destructive" | "outline"> = {
  confirmed: "default",
  "in-house": "default",
  "checked-out": "secondary",
  pending: "outline",
  cancelled: "destructive",
}

export function RecentReservationsPanel() {
  const query = useRecentReservations(5)
  const reservations = query.data?.data ?? []

  return (
    <PanelCard
      title={M.recent.title}
      action={
        <div className="flex items-center gap-3">
          <PanelLink href={RESERVATIONS_HREF}>{M.recent.viewAll}</PanelLink>
          <a
            href={NEW_RESERVATION_HREF}
            className={buttonVariants({ variant: "default", size: "sm" })}
          >
            <CalendarPlus className="size-4" />
            {M.recent.newReservation}
          </a>
        </div>
      }
    >
      <p className="text-muted-foreground -mt-2 mb-3 text-xs">{M.recent.subtitle}</p>
      {query.isError ? (
        <ErrorLine>{M.common.loadFailed}</ErrorLine>
      ) : query.isLoading ? (
        <SkeletonRows rows={5} />
      ) : reservations.length === 0 ? (
        <EmptyLine>{M.recent.empty}</EmptyLine>
      ) : (
        <ul className="divide-border divide-y">
          {reservations.map((reservation) => {
            const view = recentReservationView(reservation)
            return (
              <li key={reservation.id}>
                <a
                  href={`/bookings/${reservation.id}`}
                  className="hover:bg-muted/50 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{view.guestName}</div>
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      <span className="font-mono">{view.stayNumber}</span>
                      <span aria-hidden>·</span>
                      <span>{view.dateRange}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground hidden text-xs sm:inline">
                      {M.reservationSource[view.sourceKey] ?? view.sourceKey}
                    </span>
                    <Badge variant={TONE_VARIANT[view.tone]}>
                      {M.reservationStatus[view.statusKey] ?? view.statusKey}
                    </Badge>
                  </div>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </PanelCard>
  )
}
