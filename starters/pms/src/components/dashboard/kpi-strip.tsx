"use client"

/**
 * The dashboard's KPI tile strip: occupancy, arrivals (with the unassigned
 * count), departures, in-house, ADR and RevPAR for the business date. Occupancy
 * / ADR / RevPAR come from the folios daily report; the arrivals / departures /
 * in-house counts come from the front-desk boards.
 */

import { dashboardMessages as M } from "./dashboard-messages"
import { buildKpiSummary, formatMoney, formatPercent } from "./dashboard-model"
import { DASHBOARD_CURRENCY, KpiTile } from "./dashboard-ui"
import { useBoards, useDailyReport } from "./use-dashboard-data"

export function KpiStrip({ propertyId, date }: { propertyId: string; date: string }) {
  const reportQuery = useDailyReport(propertyId, date)
  const boardsQuery = useBoards(propertyId, date)

  const report = reportQuery.data?.data
  const boards = boardsQuery.data?.data
  const kpi = buildKpiSummary(report, boards)

  const reportLoading = reportQuery.isLoading
  const boardsLoading = boardsQuery.isLoading

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        label={M.kpi.occupancy}
        value={formatPercent(kpi.occupancy)}
        hint={M.kpi.occupancyHint(kpi.occupiedUnits, kpi.sellableUnits)}
        loading={reportLoading}
      />
      <KpiTile
        label={M.kpi.arrivals}
        value={String(kpi.arrivals)}
        hint={M.kpi.arrivalsHint(kpi.unassignedArrivals)}
        loading={boardsLoading}
      />
      <KpiTile
        label={M.kpi.departures}
        value={String(kpi.departures)}
        hint={M.kpi.departuresHint}
        loading={boardsLoading}
      />
      <KpiTile
        label={M.kpi.inHouse}
        value={String(kpi.inHouse)}
        hint={M.kpi.inHouseHint}
        loading={boardsLoading}
      />
      <KpiTile
        label={M.kpi.adr}
        value={formatMoney(kpi.adrCents, DASHBOARD_CURRENCY)}
        hint={M.kpi.adrHint}
        loading={reportLoading}
      />
      <KpiTile
        label={M.kpi.revpar}
        value={formatMoney(kpi.revParCents, DASHBOARD_CURRENCY)}
        hint={M.kpi.revparHint}
        loading={reportLoading}
      />
    </div>
  )
}
