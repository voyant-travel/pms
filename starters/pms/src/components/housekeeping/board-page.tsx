"use client"

import { Button } from "@voyant-travel/ui/components/button"
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react"
import { useState } from "react"

import { IsoDateField } from "../admin-shared/iso-date-field"
import { addDaysIso, todayIso } from "../front-desk/front-desk-dates"
import { housekeepingMessages } from "./housekeeping-messages"
import { HousekeepingPageShell } from "./housekeeping-page-shell"
import { RoomStatusStrip } from "./room-status-strip"
import { TaskBoard } from "./task-board"
import { useHousekeepingMutations } from "./use-housekeeping-mutations"

function BoardView({ propertyId }: { propertyId: string }) {
  const m = housekeepingMessages
  const [date, setDate] = useState<string>(() => todayIso())
  const { generate } = useHousekeepingMutations()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={m.common.prev}
          onClick={() => setDate((d) => addDaysIso(d, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <IsoDateField
          value={date}
          onChange={(v) => setDate(v || todayIso())}
          required
          className="w-40"
        />
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={m.common.next}
          onClick={() => setDate((d) => addDaysIso(d, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDate(todayIso())}>
          {m.common.today}
        </Button>
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            disabled={generate.isPending}
            onClick={() => generate.mutate({ propertyId, date })}
          >
            <Sparkles className="size-4" /> {m.board.generate}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TaskBoard propertyId={propertyId} date={date} />
        <RoomStatusStrip propertyId={propertyId} date={date} />
      </div>
    </div>
  )
}

export function HousekeepingBoardPage() {
  return (
    <HousekeepingPageShell title={housekeepingMessages.board.title}>
      {(propertyId) => <BoardView propertyId={propertyId} />}
    </HousekeepingPageShell>
  )
}
