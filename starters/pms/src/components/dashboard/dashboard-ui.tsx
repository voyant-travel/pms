"use client"

/**
 * Small presentational building blocks shared across the dashboard panels: the
 * KPI tile, the panel card frame (title + optional "view all" link), the
 * loading skeletons and the empty/error states. Kept dependency-light (UI
 * primitives only) so the panels stay focused on data shaping.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import type { ReactNode } from "react"

/** Property currency for money on the dashboard (EUR across the Acme demo). */
export const DASHBOARD_CURRENCY = "EUR"

/** A single KPI tile: label, big value, and a muted hint line. */
export function KpiTile({
  label,
  value,
  hint,
  loading,
}: {
  label: string
  value: string
  hint?: string
  loading?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-1.5">
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
        )}
        {hint ? <div className="text-muted-foreground mt-0.5 text-xs">{hint}</div> : null}
      </CardContent>
    </Card>
  )
}

/** Panel frame with a title row and an optional trailing link/action slot. */
export function PanelCard({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** A cross-section link styled as a quiet action (app-owned routes are grafted
 *  at runtime, so a plain anchor — matching `NewReservationButton`). */
export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="text-muted-foreground hover:text-foreground text-xs font-medium whitespace-nowrap underline-offset-4 hover:underline"
    >
      {children}
    </a>
  )
}

/** N skeleton list rows, for a loading panel body. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => `sk-${i}`).map((key) => (
        <div key={key} className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

/** A muted single-line placeholder used for empty/guidance states. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground py-2 text-sm">{children}</p>
}

/** Destructive single-line placeholder for a failed panel read. */
export function ErrorLine({ children }: { children: ReactNode }) {
  return <p className="text-destructive py-2 text-sm">{children}</p>
}
