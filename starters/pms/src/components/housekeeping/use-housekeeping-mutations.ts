"use client"

/**
 * Housekeeping board write operations as react-query mutations: task status
 * transitions, room-status changes, and the day's task generation. On settle we
 * invalidate the whole housekeeping tree so the task board and room-status strip
 * refetch (no optimistic updates). Errors surface as toasts; the room-status 409
 * (inspected requires clean) is pre-empted in the UI but still handled here.
 *
 * Maintenance-block mutations live with the maintenance page (their own inline
 * mutations) since they carry a distinct `recomputedRoomTypeId` side-effect.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  generateTasks,
  housekeepingKeys,
  type RoomStatus,
  setRoomStatus,
  setTaskStatus,
  type TaskStatus,
} from "./housekeeping-client"
import { housekeepingMessages } from "./housekeeping-messages"

export function useHousekeepingMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: housekeepingKeys.all })
  const onError = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : housekeepingMessages.common.loadFailed)

  const taskStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => setTaskStatus(id, status),
    onSuccess: () => {
      toast.success(housekeepingMessages.common.savedToast)
      invalidate()
    },
    onError,
  })

  const roomStatus = useMutation({
    mutationFn: ({ unitId, status }: { unitId: string; status: RoomStatus }) =>
      setRoomStatus(unitId, status),
    onSuccess: () => {
      toast.success(housekeepingMessages.common.savedToast)
      invalidate()
    },
    onError,
  })

  const generate = useMutation({
    mutationFn: ({ propertyId, date }: { propertyId: string; date: string }) =>
      generateTasks(propertyId, date),
    onSuccess: ({ data }) => {
      toast.success(
        housekeepingMessages.board.generateResult(data.inserted, data.departures, data.stayovers),
      )
      invalidate()
    },
    onError,
  })

  return { taskStatus, roomStatus, generate }
}
