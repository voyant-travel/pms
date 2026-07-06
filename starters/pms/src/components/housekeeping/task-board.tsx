"use client"

import { useQuery } from "@tanstack/react-query"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { Plus } from "lucide-react"
import { useMemo, useState } from "react"

import { frontDeskKeys, listRoomUnits } from "../front-desk/front-desk-client"
import {
  canCloseTask,
  canStartTask,
  groupTasks,
  TASK_BUCKETS,
  type TaskView,
  toTaskView,
} from "./housekeeping-board-model"
import { housekeepingKeys, listTasks } from "./housekeeping-client"
import { housekeepingMessages } from "./housekeeping-messages"
import { TaskDialog } from "./task-dialog"
import { useHousekeepingMutations } from "./use-housekeeping-mutations"

const TYPE_VARIANT = {
  clean: "secondary",
  inspect: "default",
  turndown: "outline",
  deep_clean: "destructive",
} as const

function TaskRow({ task }: { task: TaskView }) {
  const m = housekeepingMessages.board
  const { taskStatus } = useHousekeepingMutations()
  const pending = taskStatus.isPending

  return (
    <div className="flex flex-col gap-1 rounded-md border p-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{task.unitNumber}</span>
        <div className="flex items-center gap-1.5">
          <Badge variant={TYPE_VARIANT[task.type]}>{m.taskType[task.type]}</Badge>
          {task.priority > 0 ? (
            <Badge variant="outline" className="tabular-nums">
              P{task.priority}
            </Badge>
          ) : null}
          <Badge variant="outline">{m.source[task.source]}</Badge>
        </div>
      </div>
      {task.assigneeUserId ? (
        <span className="text-muted-foreground text-xs">
          {m.assignedTo} {task.assigneeUserId}
        </span>
      ) : null}
      {task.notes ? <span className="text-muted-foreground text-xs">{task.notes}</span> : null}
      <div className="mt-1 flex gap-2">
        {canStartTask(task.status) ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => taskStatus.mutate({ id: task.id, status: "in_progress" })}
          >
            {m.start}
          </Button>
        ) : null}
        {canCloseTask(task.status) ? (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => taskStatus.mutate({ id: task.id, status: "done" })}
            >
              {m.complete}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => taskStatus.mutate({ id: task.id, status: "skipped" })}
            >
              {m.skip}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}

/** Task board panel: the day's tasks grouped into Open / In progress / closed. */
export function TaskBoard({ propertyId, date }: { propertyId: string; date: string }) {
  const m = housekeepingMessages.board
  const [dialogOpen, setDialogOpen] = useState(false)

  const tasksQuery = useQuery({
    queryKey: housekeepingKeys.tasks(propertyId, date),
    queryFn: () => listTasks({ propertyId, date }),
  })
  const unitsQuery = useQuery({
    queryKey: frontDeskKeys.units(propertyId),
    queryFn: () => listRoomUnits({ propertyId }),
  })

  const units = unitsQuery.data?.data ?? []
  const groups = useMemo(() => {
    const numberById = new Map(units.map((u) => [u.id, u.unitNumber]))
    const views = (tasksQuery.data?.data ?? []).map((task) =>
      toTaskView(task, (id) => numberById.get(id) ?? id),
    )
    return groupTasks(views)
  }, [tasksQuery.data, units])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{m.tasksPanel}</h2>
        <Button size="sm" disabled={units.length === 0} onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> {m.newTask}
        </Button>
      </div>

      {tasksQuery.isError ? (
        <p className="text-destructive text-sm">{housekeepingMessages.common.loadFailed}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {TASK_BUCKETS.map((bucket) => (
            <Card key={bucket} size="sm">
              <CardHeader>
                <CardTitle className="text-sm">
                  {m.columns[bucket]} ({groups[bucket].length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {groups[bucket].length === 0 ? (
                  <p className="text-muted-foreground text-xs">{m.emptyColumn}</p>
                ) : (
                  groups[bucket].map((task) => <TaskRow key={task.id} task={task} />)
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TaskDialog
        propertyId={propertyId}
        units={units}
        date={date}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}
