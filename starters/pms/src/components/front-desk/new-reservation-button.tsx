"use client"

/**
 * Header entry point to the New reservation flow, dropped into the tape-chart and
 * boards page headers via the shell's `controls` slot. A plain anchor (styled as
 * a button) because the admin-extension routes are grafted at runtime and aren't
 * in the typed router tree.
 */

import { buttonVariants } from "@voyant-travel/ui/components/button"
import { CalendarPlus } from "lucide-react"

import { frontDeskMessages } from "./front-desk-messages"

export function NewReservationButton() {
  return (
    <a
      href="/front-desk/reservations/new"
      className={buttonVariants({ variant: "default", size: "sm" })}
    >
      <CalendarPlus className="size-4" />
      {frontDeskMessages.nav.newReservation}
    </a>
  )
}
