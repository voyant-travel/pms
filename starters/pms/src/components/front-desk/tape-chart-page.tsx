"use client"

import { useQuery } from "@tanstack/react-query"
import type { TapeChart } from "@voyant-travel/pms-front-desk"
import { Button } from "@voyant-travel/ui/components/button"
import { Input } from "@voyant-travel/ui/components/input"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"
import { frontDeskKeys, getTapeChart } from "./front-desk-client"
import {
  addDaysIso,
  DEFAULT_TAPE_CHART_DAYS,
  defaultTapeChartRange,
  shiftRangeByDays,
} from "./front-desk-dates"
import { frontDeskMessages } from "./front-desk-messages"
import { FrontDeskPageShell } from "./front-desk-page-shell"
import { type MoveTarget, StayDetailDialog } from "./stay-detail-dialog"
import { TapeChartGrid } from "./tape-chart-grid"
import type { StayBar } from "./tape-chart-model"
import { UnassignedArrivalsTray } from "./unassigned-arrivals-tray"

interface Selection {
  stay: StayBar
  unitId: string
}

function TapeChartView({ propertyId }: { propertyId: string }) {
  const [range, setRange] = useState(() => defaultTapeChartRange())
  const [selection, setSelection] = useState<Selection | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: frontDeskKeys.tapeChart(propertyId, range.from, range.to),
    queryFn: () => getTapeChart(propertyId, range.from, range.to),
  })
  const chart: TapeChart | undefined = data?.data

  const moveTargets: MoveTarget[] = useMemo(
    () =>
      (chart?.groups ?? []).flatMap((g) =>
        g.units.map((u) => ({
          id: u.unitId,
          unitNumber: u.unitNumber,
          roomTypeName: g.roomTypeName,
        })),
      ),
    [chart],
  )

  const openStay = (stay: StayBar, unitId: string) => {
    setSelection({ stay, unitId })
    setDialogOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={frontDeskMessages.common.prev}
          onClick={() => setRange((r) => shiftRangeByDays(r.from, r.to, -DEFAULT_TAPE_CHART_DAYS))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Input
          type="date"
          className="w-40"
          value={range.from}
          onChange={(e) => {
            const from = e.target.value
            if (from) setRange({ from, to: addDaysIso(from, DEFAULT_TAPE_CHART_DAYS - 1) })
          }}
        />
        <span className="text-muted-foreground text-sm tabular-nums">→ {range.to}</span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={frontDeskMessages.common.next}
          onClick={() => setRange((r) => shiftRangeByDays(r.from, r.to, DEFAULT_TAPE_CHART_DAYS))}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setRange(defaultTapeChartRange())}>
          {frontDeskMessages.common.today}
        </Button>
        <StatusLegend />
      </div>

      {isError ? (
        <p className="text-destructive text-sm">{frontDeskMessages.common.loadFailed}</p>
      ) : isLoading || !chart ? (
        <p className="text-muted-foreground text-sm">…</p>
      ) : (
        <>
          <TapeChartGrid chart={chart} onSelectStay={openStay} />
          <UnassignedArrivalsTray arrivals={chart.unassignedArrivals} groups={chart.groups} />
        </>
      )}

      <StayDetailDialog
        stay={selection?.stay ?? null}
        currentUnitId={selection?.unitId ?? null}
        moveTargets={moveTargets}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}

function StatusLegend() {
  const m = frontDeskMessages.tapeChart.legend
  const items: { label: string; className: string }[] = [
    { label: m.reserved, className: "bg-sky-500/40" },
    { label: m.inHouse, className: "bg-emerald-500/40" },
    { label: m.checkedOut, className: "bg-muted-foreground/40" },
    { label: m.noShow, className: "bg-destructive/40" },
  ]
  return (
    <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px]">
      {items.map((it) => (
        <span key={it.label} className="text-muted-foreground flex items-center gap-1">
          <span className={`inline-block size-2.5 rounded-sm ${it.className}`} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

export function TapeChartPage() {
  return (
    <FrontDeskPageShell title={frontDeskMessages.tapeChart.title}>
      {(propertyId) => <TapeChartView propertyId={propertyId} />}
    </FrontDeskPageShell>
  )
}
