"use client"

/**
 * Revenue panel: the business date's revenue broken down by posting type, plus
 * the total outstanding balance across open folios. Links go to the folios list
 * and the daily report. On the current business date (before the nightly
 * audit), room charges have not posted yet — an inline note explains the empty
 * breakdown rather than reading as a bug.
 */

import { dashboardMessages as M } from "./dashboard-messages"
import { formatMoney, revenueByTypeRows, sumOpenBalances } from "./dashboard-model"
import { DASHBOARD_CURRENCY, ErrorLine, PanelCard, PanelLink, SkeletonRows } from "./dashboard-ui"
import { useDailyReport, useOpenFolios } from "./use-dashboard-data"

const FOLIOS_HREF = "/folios/folios"
const REPORTS_HREF = "/folios/reports"

export function RevenuePanel({ propertyId, date }: { propertyId: string; date: string }) {
  const reportQuery = useDailyReport(propertyId, date)
  const foliosQuery = useOpenFolios(propertyId)

  const report = reportQuery.data?.data
  const rows = revenueByTypeRows(report?.revenueByType ?? {})
  const balances = sumOpenBalances(foliosQuery.data?.data ?? [])

  const isError = reportQuery.isError || foliosQuery.isError

  return (
    <PanelCard
      title={M.revenue.title}
      action={
        <div className="flex gap-3">
          <PanelLink href={FOLIOS_HREF}>{M.revenue.viewFolios}</PanelLink>
          <PanelLink href={REPORTS_HREF}>{M.revenue.viewReports}</PanelLink>
        </div>
      }
    >
      {isError ? (
        <ErrorLine>{M.common.loadFailed}</ErrorLine>
      ) : reportQuery.isLoading || foliosQuery.isLoading ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="flex flex-col gap-5">
          <div>
            <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              {M.revenue.byType}
            </div>
            {rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {M.revenue.noRevenue}{" "}
                <span className="text-muted-foreground/80">{M.revenue.postedNote}</span>
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {rows.map((row) => (
                  <li key={row.type} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="text-sm">{M.postingType[row.type] ?? row.type}</span>
                    <span className="text-sm tabular-nums">
                      {formatMoney(row.amountCents, DASHBOARD_CURRENCY)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-border flex items-end justify-between border-t pt-4">
            <div>
              <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {M.revenue.openBalances}
              </div>
              <div className="text-muted-foreground text-xs">
                {M.revenue.openBalancesHint(balances.count)}
              </div>
            </div>
            <span className="text-xl font-semibold tabular-nums">
              {formatMoney(balances.totalCents, DASHBOARD_CURRENCY)}
            </span>
          </div>
        </div>
      )}
    </PanelCard>
  )
}
