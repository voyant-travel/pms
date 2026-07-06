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
// gap on wide screens. STICKY_COL_PX matches `w-56` (14rem); MIN_COL_PX is the
// per-column floor below which the container scrolls (a full month easily
// exceeds the viewport, so this grid usually scrolls at 1440/1920 as before);
// MAX_COL_PX caps growth on ultra-wide viewports where the table then
// left-aligns.
const STICKY_COL_PX = 224
const MIN_COL_PX = 56
const MAX_COL_PX = 140

/** Join truthy class names. Keep exactly one background utility per element so
 * sticky cells stay reliably opaque (translucent tints let scrolled content
 * bleed through the sticky label column). */
const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ")

/** Column tint for a date cell: today wins over weekend; plain otherwise. */
function columnTint(isToday: boolean, weekend: boolean): string {
  if (isToday) return "bg-primary/[0.06]"
  if (weekend) return "bg-muted-foreground/10"
  return ""
}

export function CalendarGridView({ grid }: { grid: CalendarGrid }) {
  const m = ariMessages.calendar
  const dates = buildDateColumns(grid.from, grid.to)
  const index = indexCalendar(grid)
  const ratePlanById = new Map(grid.ratePlans.map((rp) => [rp.id, rp]))
  const { saveInventory, saveRate } = useCalendarMutations()
  // Operators orient by "today"; highlight its column when it falls in range.
  const todayIso = new Date().toISOString().slice(0, 10)

  if (grid.roomTypes.length === 0) {
    return <p className="text-muted-foreground text-sm">{m.noRoomTypes}</p>
  }

  // Sticky label column. Every sticky cell must carry its own opaque background
  // (`bg-card` for label rows, `bg-muted` for section headers) so horizontally
  // scrolled cell content never shows through it.
  const stickyBase =
    "sticky left-0 z-20 border-r w-56 min-w-56 max-w-56 px-3 text-left align-middle"

  const gridStyle = {
    minWidth: STICKY_COL_PX + dates.length * MIN_COL_PX,
    maxWidth: STICKY_COL_PX + dates.length * MAX_COL_PX,
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full table-fixed border-collapse text-xs" style={gridStyle}>
        <thead>
          <tr className="border-b bg-muted">
            <th
              className={cx(
                stickyBase,
                "bg-muted py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
              )}
            >
              {ariMessages.property.label}
            </th>
            {dates.map((date) => {
              const day = date.slice(8)
              const isToday = date === todayIso
              const weekend = isWeekend(date)
              return (
                <th
                  key={date}
                  className={cx(
                    "px-1 py-1 text-center font-normal",
                    isToday
                      ? "bg-primary/10 ring-1 ring-inset ring-primary/30"
                      : weekend
                        ? "bg-muted-foreground/15"
                        : "",
                  )}
                >
                  <div
                    className={cx(
                      "text-[10px]",
                      isToday ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {WEEKDAY_LABELS[isoWeekdayOf(date)]}
                  </div>
                  <div
                    className={cx(
                      "tabular-nums",
                      isToday ? "font-bold text-primary" : "font-medium",
                    )}
                  >
                    {day}
                  </div>
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
                stickyBase={stickyBase}
                todayIso={todayIso}
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
  stickyBase,
  todayIso,
  onSaveInventory,
  onSaveRate,
}: {
  grid: CalendarGrid
  roomType: CalendarGrid["roomTypes"][number]
  ratePlans: CalendarGrid["ratePlans"]
  dates: string[]
  index: ReturnType<typeof indexCalendar>
  stickyBase: string
  todayIso: string
  onSaveInventory: (date: string, capacity: number, closed: boolean) => void
  onSaveRate: (ratePlanId: string, date: string, sellCurrency: string, cents: number) => void
}) {
  const m = ariMessages.calendar
  return (
    <>
      <tr className="border-y bg-muted">
        <th className={cx(stickyBase, "bg-muted py-2 text-[13px] font-semibold text-foreground")}>
          {roomType.name}
        </th>
        <td
          className="bg-muted text-muted-foreground px-3 py-2 text-[10px] uppercase tracking-wide"
          colSpan={dates.length}
        >
          {m.inventoryRow}
        </td>
      </tr>
      <tr className="border-b bg-card">
        <td
          className={cx(stickyBase, "bg-card text-muted-foreground py-1 text-[11px] font-medium")}
        >
          {m.capacity}
        </td>
        {dates.map((date) => (
          <td key={date} className={cx("p-0", columnTint(date === todayIso, isWeekend(date)))}>
            <InventoryCell
              cell={index.inventory(roomType.id, date)}
              onSave={(capacity, closed) => onSaveInventory(date, capacity, closed)}
            />
          </td>
        ))}
      </tr>
      {ratePlans.length === 0 ? (
        <tr className="border-b bg-card">
          <td className={cx(stickyBase, "bg-card text-muted-foreground py-1 italic")}>—</td>
          <td
            className="bg-card text-muted-foreground px-3 py-1 text-[10px]"
            colSpan={dates.length}
          >
            {ariMessages.ratePlans.noRoomTypes}
          </td>
        </tr>
      ) : (
        ratePlans.map((rp) => (
          <tr key={rp.id} className="border-b bg-card">
            <td className={cx(stickyBase, "bg-card py-1")}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-foreground" title={rp.name}>
                  {rp.name}
                </span>
                <span className="text-muted-foreground shrink-0 text-[10px] font-medium tabular-nums">
                  {rp.currencyCode}
                </span>
              </div>
            </td>
            {dates.map((date) => (
              <td key={date} className={cx("p-0", columnTint(date === todayIso, isWeekend(date)))}>
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
