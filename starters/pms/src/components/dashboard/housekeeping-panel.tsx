"use client"

/**
 * Housekeeping panel: open / in-progress task counts, a dirty · clean ·
 * inspected room-status mini bar, and the active-maintenance count. Links go to
 * the housekeeping board and the maintenance page.
 */

import { dashboardMessages as M } from "./dashboard-messages"
import { housekeepingSummary } from "./dashboard-model"
import { EmptyLine, ErrorLine, PanelCard, PanelLink, SkeletonRows } from "./dashboard-ui"
import { useActiveMaintenance, useHousekeepingTasks, useRoomStatus } from "./use-dashboard-data"

const BOARD_HREF = "/housekeeping/board"
const MAINTENANCE_HREF = "/housekeeping/maintenance"

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  )
}

function StatusBar({
  dirty,
  clean,
  inspected,
  untracked,
}: {
  dirty: number
  clean: number
  inspected: number
  untracked: number
}) {
  const total = dirty + clean + inspected + untracked
  const segments: Array<{ key: string; label: string; value: number; className: string }> = [
    { key: "dirty", label: M.housekeeping.dirty, value: dirty, className: "bg-destructive" },
    { key: "clean", label: M.housekeeping.clean, value: clean, className: "bg-primary" },
    {
      key: "inspected",
      label: M.housekeeping.inspected,
      value: inspected,
      className: "bg-emerald-500",
    },
    {
      key: "untracked",
      label: M.housekeeping.untracked,
      value: untracked,
      className: "bg-muted-foreground/30",
    },
  ]
  return (
    <div className="flex flex-col gap-2">
      <div className="bg-muted flex h-2 w-full overflow-hidden rounded-full">
        {total === 0
          ? null
          : segments
              .filter((s) => s.value > 0)
              .map((s) => (
                <div
                  key={s.key}
                  className={s.className}
                  style={{ width: `${(s.value / total) * 100}%` }}
                />
              ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <span key={s.key} className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span className={`inline-block size-2 rounded-full ${s.className}`} />
            {s.label} <span className="text-foreground tabular-nums">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function HousekeepingPanel({ propertyId, date }: { propertyId: string; date: string }) {
  const tasksQuery = useHousekeepingTasks(propertyId, date)
  const roomStatusQuery = useRoomStatus(propertyId)
  const maintenanceQuery = useActiveMaintenance(propertyId)

  const isLoading = tasksQuery.isLoading || roomStatusQuery.isLoading || maintenanceQuery.isLoading
  const isError = tasksQuery.isError || roomStatusQuery.isError || maintenanceQuery.isError

  const summary = housekeepingSummary({
    tasks: tasksQuery.data?.data ?? [],
    roomStatus: roomStatusQuery.data?.data ?? [],
    maintenance: maintenanceQuery.data?.data ?? [],
  })

  const noRooms = summary.dirty + summary.clean + summary.inspected + summary.untracked === 0

  return (
    <PanelCard
      title={M.housekeeping.title}
      action={
        <div className="flex gap-3">
          <PanelLink href={BOARD_HREF}>{M.housekeeping.viewBoard}</PanelLink>
          <PanelLink href={MAINTENANCE_HREF}>{M.housekeeping.viewMaintenance}</PanelLink>
        </div>
      }
    >
      {isError ? (
        <ErrorLine>{M.common.loadFailed}</ErrorLine>
      ) : isLoading ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-3 gap-4">
            <Stat label={M.housekeeping.openTasks} value={summary.openTasks} />
            <Stat label={M.housekeeping.inProgressTasks} value={summary.inProgressTasks} />
            <Stat label={M.housekeeping.maintenance} value={summary.activeMaintenance} />
          </div>
          <div>
            <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              {M.housekeeping.rooms}
            </div>
            {noRooms ? (
              <EmptyLine>{M.housekeeping.noTasks}</EmptyLine>
            ) : (
              <StatusBar
                dirty={summary.dirty}
                clean={summary.clean}
                inspected={summary.inspected}
                untracked={summary.untracked}
              />
            )}
          </div>
        </div>
      )}
    </PanelCard>
  )
}
