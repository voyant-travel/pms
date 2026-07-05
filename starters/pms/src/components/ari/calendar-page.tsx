"use client"

import { useQuery } from "@tanstack/react-query"
import { Button } from "@voyant-travel/ui/components/button"
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react"
import { useMemo, useState } from "react"

import { ariKeys, getCalendar } from "./ari-client"
import { ariMessages } from "./ari-messages"
import { AriPageShell } from "./ari-page-shell"
import { BulkUpdateDialog } from "./bulk-update-dialog"
import { CalendarGridView } from "./calendar-grid"
import { monthLabel, monthRange, shiftMonth } from "./calendar-grid-model"

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function CalendarView({ propertyId }: { propertyId: string }) {
  const m = ariMessages.calendar
  const [range, setRange] = useState(() => monthRange(todayIso()))
  const [bulkOpen, setBulkOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ariKeys.calendar(propertyId, range.from, range.to),
    queryFn: () => getCalendar(propertyId, range.from, range.to),
  })

  const grid = data?.data
  const label = useMemo(() => monthLabel(range.from), [range.from])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={m.prevMonth}
            onClick={() => setRange((r) => shiftMonth(r.from, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium">{label}</span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={m.nextMonth}
            onClick={() => setRange((r) => shiftMonth(r.from, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRange(monthRange(todayIso()))}>
            {m.today}
          </Button>
        </div>
        <Button variant="outline" disabled={!grid} onClick={() => setBulkOpen(true)}>
          <SlidersHorizontal className="size-4" /> {m.bulkUpdate}
        </Button>
      </div>

      {isError ? (
        <p className="text-destructive text-sm">{ariMessages.common.loadFailed}</p>
      ) : isLoading || !grid ? (
        <p className="text-muted-foreground text-sm">…</p>
      ) : (
        <CalendarGridView grid={grid} />
      )}

      {grid ? (
        <BulkUpdateDialog
          propertyId={propertyId}
          grid={grid}
          open={bulkOpen}
          onOpenChange={setBulkOpen}
        />
      ) : null}
    </div>
  )
}

export function CalendarPage() {
  return (
    <AriPageShell title={ariMessages.calendar.title}>
      {(propertyId) => <CalendarView propertyId={propertyId} />}
    </AriPageShell>
  )
}
