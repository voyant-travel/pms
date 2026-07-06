"use client"

/**
 * Rates & availability grid: room types as row groups (an availability row plus
 * one row per attached rate plan), dates as columns. First column is sticky and
 * the body scrolls horizontally. Cells are individually editable; edits write a
 * one-day upsert via {@link useCalendarMutations}.
 */

import type { CalendarGrid } from "@voyant-travel/pms-ari"
import { ariMessages } from "./ari-messages"
import { InventoryCell, RateCell } from "./calendar-cells"
import { buildDateColumns, indexCalendar, isoWeekdayOf, isWeekend } from "./calendar-grid-model"
import { useCalendarMutations } from "./use-calendar-mutations"

const WEEKDAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

// See the tape-chart grid for the same reasoning: the grid is `table-fixed` +
// `w-full` so date columns share the container width instead of leaving a dead
// gap on wide screens. STICKY_COL_PX matches `w-52` (13rem); MIN_COL_PX is the
// per-column floor below which the container scrolls (a full month easily
// exceeds the viewport, so this grid usually scrolls at 1440/1920 as before);
// MAX_COL_PX caps growth on ultra-wide viewports where the table then
// left-aligns.
const STICKY_COL_PX = 208
const MIN_COL_PX = 56
const MAX_COL_PX = 140

export function CalendarGridView({ grid }: { grid: CalendarGrid }) {
  const m = ariMessages.calendar
  const dates = buildDateColumns(grid.from, grid.to)
  const index = indexCalendar(grid)
  const ratePlanById = new Map(grid.ratePlans.map((rp) => [rp.id, rp]))
  const { saveInventory, saveRate } = useCalendarMutations()

  if (grid.roomTypes.length === 0) {
    return <p className="text-muted-foreground text-sm">{m.noRoomTypes}</p>
  }

  const stickyCol =
    "sticky left-0 z-10 bg-background border-r w-52 min-w-52 max-w-52 px-3 text-left align-middle"

  const gridStyle = {
    minWidth: STICKY_COL_PX + dates.length * MIN_COL_PX,
    maxWidth: STICKY_COL_PX + dates.length * MAX_COL_PX,
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full table-fixed border-collapse text-xs" style={gridStyle}>
        <thead>
          <tr className="border-b bg-muted/40">
            <th className={`${stickyCol} py-2 font-medium`}>{ariMessages.property.label}</th>
            {dates.map((date) => {
              const day = date.slice(8)
              return (
                <th
                  key={date}
                  className={`px-1 py-1 text-center font-normal ${
                    isWeekend(date) ? "bg-muted/60" : ""
                  }`}
                >
                  <div className="text-muted-foreground text-[10px]">
                    {WEEKDAY_LABELS[isoWeekdayOf(date)]}
                  </div>
                  <div className="font-medium tabular-nums">{day}</div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {grid.roomTypes.map((rt) => {
            const ratePlans = rt.ratePlanIds
              .map((id) => ratePlanById.get(id))
              .filter((rp): rp is NonNullable<typeof rp> => rp != null)
            return (
              <RoomTypeRows
                key={rt.id}
                grid={grid}
                roomType={rt}
                ratePlans={ratePlans}
                dates={dates}
                index={index}
                stickyCol={stickyCol}
                onSaveInventory={(date, capacity, closed) =>
                  saveInventory.mutate({ roomTypeId: rt.id, date, capacity, closed })
                }
                onSaveRate={(ratePlanId, date, sellCurrency, cents) =>
                  saveRate.mutate({
                    ratePlanId,
                    roomTypeId: rt.id,
                    date,
                    sellCurrency,
                    sellAmountCents: cents,
                  })
                }
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RoomTypeRows({
  roomType,
  ratePlans,
  dates,
  index,
  stickyCol,
  onSaveInventory,
  onSaveRate,
}: {
  grid: CalendarGrid
  roomType: CalendarGrid["roomTypes"][number]
  ratePlans: CalendarGrid["ratePlans"]
  dates: string[]
  index: ReturnType<typeof indexCalendar>
  stickyCol: string
  onSaveInventory: (date: string, capacity: number, closed: boolean) => void
  onSaveRate: (ratePlanId: string, date: string, sellCurrency: string, cents: number) => void
}) {
  const m = ariMessages.calendar
  return (
    <>
      <tr className="border-b bg-muted/20">
        <th className={`${stickyCol} bg-muted/20 py-2 font-semibold`}>{roomType.name}</th>
        <td className="text-muted-foreground px-2 py-1 text-[10px]" colSpan={dates.length}>
          {m.inventoryRow}
        </td>
      </tr>
      <tr className="border-b">
        <td className={`${stickyCol} text-muted-foreground py-1`}>{m.capacity}</td>
        {dates.map((date) => (
          <td key={date} className={`p-0 ${isWeekend(date) ? "bg-muted/30" : ""}`}>
            <InventoryCell
              cell={index.inventory(roomType.id, date)}
              onSave={(capacity, closed) => onSaveInventory(date, capacity, closed)}
            />
          </td>
        ))}
      </tr>
      {ratePlans.length === 0 ? (
        <tr className="border-b">
          <td className={`${stickyCol} text-muted-foreground py-1 italic`}>—</td>
          <td className="text-muted-foreground px-2 py-1 text-[10px]" colSpan={dates.length}>
            {ariMessages.ratePlans.noRoomTypes}
          </td>
        </tr>
      ) : (
        ratePlans.map((rp) => (
          <tr key={rp.id} className="border-b">
            <td className={`${stickyCol} py-1`}>
              <span className="font-medium">{rp.name}</span>
              <span className="text-muted-foreground ml-1">{rp.currencyCode}</span>
            </td>
            {dates.map((date) => (
              <td key={date} className={`p-0 ${isWeekend(date) ? "bg-muted/30" : ""}`}>
                <RateCell
                  cell={index.rate(rp.id, roomType.id, date)}
                  onSave={(cents) => onSaveRate(rp.id, date, rp.currencyCode, cents)}
                />
              </td>
            ))}
          </tr>
        ))
      )}
    </>
  )
}
