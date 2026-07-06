"use client"

import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { useState } from "react"

import { IsoDateField } from "../admin-shared/iso-date-field"
import { todayIso } from "../front-desk/front-desk-dates"
import { type DailyReport, foliosKeys, getDailyReport } from "./folios-client"
import { foliosMessages } from "./folios-messages"
import { formatMajor, formatPercent, revenueByTypeRows } from "./folios-model"
import { FoliosPageShell } from "./folios-page-shell"

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? <div className="text-muted-foreground text-xs">{hint}</div> : null}
      </CardContent>
    </Card>
  )
}

function ReportBody({ report }: { report: DailyReport }) {
  const m = foliosMessages.reports
  const detailM = foliosMessages.detail
  const rows = revenueByTypeRows(report.revenueByType)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label={m.occupancy}
          value={formatPercent(report.occupancy)}
          hint={m.units(report.occupiedUnits, report.sellableUnits)}
        />
        <KpiCard label={m.roomsSold} value={String(report.roomsSold)} />
        <KpiCard label={m.adr} value={formatMajor(report.adrCents)} />
        <KpiCard label={m.revpar} value={formatMajor(report.revParCents)} />
        <KpiCard label={m.totalRevenue} value={formatMajor(report.totalRevenueCents)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.revenueByType}</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{m.noRevenue}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.colType}</TableHead>
                  <TableHead className="text-right">{m.colAmount}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.type}>
                    <TableCell>
                      {detailM.postingType[row.type as keyof typeof detailM.postingType] ??
                        row.type}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMajor(row.amountCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ReportsView({ propertyId }: { propertyId: string }) {
  const m = foliosMessages
  const [date, setDate] = useState<string>(() => todayIso())

  const query = useQuery({
    queryKey: foliosKeys.report(propertyId, date),
    queryFn: () => getDailyReport(propertyId, date),
  })
  const report = query.data?.data

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">{m.reports.date}</span>
        <IsoDateField
          value={date}
          onChange={(v) => setDate(v || todayIso())}
          required
          containerClassName="w-44"
        />
      </div>

      {query.isError ? (
        <p className="text-destructive text-sm">{m.common.loadFailed}</p>
      ) : !report ? (
        <p className="text-muted-foreground text-sm">{m.common.loading}</p>
      ) : (
        <ReportBody report={report} />
      )}
    </div>
  )
}

export function ReportsPage() {
  return (
    <FoliosPageShell title={foliosMessages.reports.title}>
      {(propertyId) => <ReportsView propertyId={propertyId} />}
    </FoliosPageShell>
  )
}
