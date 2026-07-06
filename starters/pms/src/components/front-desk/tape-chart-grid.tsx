"use client"

/**
 * Tape chart grid: room-type groups → unit rows, dates as columns. The first
 * column is sticky and the body scrolls horizontally (mirrors the ARI calendar
 * grid). Each stay renders as a single `colSpan` bar across the nights it
 * occupies; clicking a bar surfaces the stay actions. Empty nights render as
 * individual cells so weekend tinting survives.
 */

import type { TapeChart, TapeChartUnitRow } from "@voyant-travel/pms-front-desk"
import { dayOfMonth, isoWeekdayOf, isWeekend } from "./front-desk-dates"
import { frontDeskMessages } from "./front-desk-messages"
import { buildRowLanes, type StayBar, statusBarClass } from "./tape-chart-model"

const WEEKDAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

// Sticky Unit column. Every sticky cell must carry its own opaque background so
// horizontally scrolled stay bars never show through it — `bg-background` for
// unit rows, `bg-muted` for the opaque section headers (see `GroupRows`).
const STICKY_COL =
  "sticky left-0 z-20 bg-background border-r w-40 min-w-40 max-w-40 px-3 text-left align-middle"

// The grid is `table-fixed` + `w-full`, so the date columns share the container
// width evenly instead of sitting at a fixed size and leaving a dead gap on wide
// screens. The bounds below keep that graceful in both directions:
//   - STICKY_COL_PX: width of the sticky Unit column (matches `w-40` = 10rem).
//   - MIN_COL_PX: floor per date column; once the container is narrower than the
//     sticky column plus one min-width per date, the table's `min-width` wins and
//     the container scrolls horizontally (preserving the sticky-column behaviour).
//   - MAX_COL_PX: cap per date column so columns stop growing on ultra-wide
//     viewports; past that the table caps out and left-aligns (a right gap only
//     appears at absurd widths). 140px reads well at 1440px (~70px/col) and
//     1920px (~104px/col) while staying inside the 120-160px sweet spot.
const STICKY_COL_PX = 160
const MIN_COL_PX = 48
const MAX_COL_PX = 140

export function TapeChartGrid({
  chart,
  onSelectStay,
}: {
  chart: TapeChart
  onSelectStay: (stay: StayBar, unitId: string) => void
}) {
  const m = frontDeskMessages.tapeChart
  const { dates } = chart

  if (chart.groups.length === 0) {
    return <p className="text-muted-foreground text-sm">{m.noUnits}</p>
  }

  const gridStyle = {
    minWidth: STICKY_COL_PX + dates.length * MIN_COL_PX,
    maxWidth: STICKY_COL_PX + dates.length * MAX_COL_PX,
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full table-fixed border-collapse text-xs" style={gridStyle}>
        <thead>
          <tr className="border-b bg-muted/40">
            <th className={`${STICKY_COL} py-2 font-medium`}>{m.unitColumn}</th>
            {dates.map((date) => (
              <th
                key={date}
                className={`px-1 py-1 text-center font-normal ${
                  isWeekend(date) ? "bg-muted/60" : ""
                }`}
              >
                <div className="text-muted-foreground text-[10px]">
                  {WEEKDAY_LABELS[isoWeekdayOf(date)]}
                </div>
                <div className="font-medium tabular-nums">{dayOfMonth(date)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.groups.map((group) => (
            <GroupRows
              key={group.roomTypeId}
              roomTypeName={group.roomTypeName}
              units={group.units}
              dates={dates}
              onSelectStay={onSelectStay}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupRows({
  roomTypeName,
  units,
  dates,
  onSelectStay,
}: {
  roomTypeName: string
  units: TapeChartUnitRow[]
  dates: string[]
  onSelectStay: (stay: StayBar, unitId: string) => void
}) {
  return (
    <>
      <tr className="border-y bg-muted">
        <th className={`${STICKY_COL} bg-muted py-1.5 font-semibold`}>{roomTypeName}</th>
        <td className="bg-muted px-2 py-1" colSpan={dates.length} />
      </tr>
      {units.map((unit) => (
        <UnitRows key={unit.unitId} unit={unit} dates={dates} onSelectStay={onSelectStay} />
      ))}
    </>
  )
}

function UnitRows({
  unit,
  dates,
  onSelectStay,
}: {
  unit: TapeChartUnitRow
  dates: string[]
  onSelectStay: (stay: StayBar, unitId: string) => void
}) {
  const lanes = buildRowLanes(unit.cells, dates)

  return (
    <>
      {lanes.map((segments, laneIndex) => {
        const isFirstLane = laneIndex === 0
        // Stable, content-derived key (avoids using the array index directly).
        const laneKey = `${unit.unitId}-${segments.find((s) => s.bar)?.bar?.bookingItemId ?? "empty"}`
        let cursor = 0
        const cells: React.ReactNode[] = []
        for (const segment of segments) {
          if (segment.bar) {
            const bar = segment.bar
            cells.push(
              <td key={`bar-${cursor}`} colSpan={segment.span} className="p-0.5">
                <button
                  type="button"
                  onClick={() => onSelectStay(bar, unit.unitId)}
                  className={`flex h-7 w-full items-center truncate rounded border px-1.5 text-left text-[11px] font-medium ${statusBarClass(
                    bar.reservationStatus,
                    bar.opsStatus,
                  )}`}
                  title={bar.guestName ?? undefined}
                >
                  <span className="truncate">
                    {bar.guestName ?? frontDeskMessages.common.guest}
                  </span>
                </button>
              </td>,
            )
            cursor += segment.span
          } else {
            for (let i = 0; i < segment.span; i += 1) {
              const date = dates[cursor]
              cells.push(
                <td
                  key={`gap-${cursor}`}
                  className={isWeekend(date) ? "bg-muted/30" : undefined}
                />,
              )
              cursor += 1
            }
          }
        }
        return (
          <tr key={laneKey} className="border-b">
            <th className={`${STICKY_COL} py-1 font-normal`}>
              {isFirstLane ? (
                <span className="flex items-center gap-1">
                  <span className="font-medium">{unit.unitNumber}</span>
                  {unit.status !== "available" ? (
                    <span className="text-muted-foreground text-[10px]">({unit.status})</span>
                  ) : null}
                </span>
              ) : null}
            </th>
            {cells}
          </tr>
        )
      })}
    </>
  )
}
