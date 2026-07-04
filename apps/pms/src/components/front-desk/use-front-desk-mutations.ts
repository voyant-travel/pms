"use client"

/**
 * Front-desk write operations (check-in / check-out / no-show, assign / move /
 * unassign a unit) as react-query mutations. Each op returns non-blocking
 * `warnings: string[]` from the backend (e.g. room-type mismatch, missing unit
 * for a serialized type) — we surface those as warning toasts and still treat
 * the call as a success. On settle we invalidate the whole front-desk tree so
 * the tape chart and boards refetch (no optimistic updates).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { CheckInInput, CheckOutInput, NoShowInput } from "../../modules/front-desk"
import type { InsertAssignmentInput, UpdateAssignmentInput } from "../../modules/units"
import {
  assignUnit,
  checkIn,
  checkOut,
  frontDeskKeys,
  moveAssignment,
  noShow,
  unassign,
  type WarningEnvelope,
} from "./front-desk-client"
import { frontDeskMessages } from "./front-desk-messages"

function surfaceWarnings(warnings: string[]): void {
  for (const warning of warnings) toast.warning(warning)
}

export function useFrontDeskMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: frontDeskKeys.all })
  const onError = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : frontDeskMessages.common.loadFailed)

  function withWarnings<T>(result: WarningEnvelope<T>): WarningEnvelope<T> {
    if (result.warnings.length > 0) surfaceWarnings(result.warnings)
    else toast.success(frontDeskMessages.common.savedToast)
    return result
  }

  const checkInMutation = useMutation({
    mutationFn: (input: CheckInInput) => checkIn(input),
    onSuccess: (result) => {
      withWarnings(result)
      invalidate()
    },
    onError,
  })

  const checkOutMutation = useMutation({
    mutationFn: (input: CheckOutInput) => checkOut(input),
    onSuccess: (result) => {
      withWarnings(result)
      invalidate()
    },
    onError,
  })

  const noShowMutation = useMutation({
    mutationFn: (input: NoShowInput) => noShow(input),
    onSuccess: (result) => {
      withWarnings(result)
      invalidate()
    },
    onError,
  })

  const assignMutation = useMutation({
    mutationFn: (input: InsertAssignmentInput) => assignUnit(input),
    onSuccess: (result) => {
      withWarnings(result)
      invalidate()
    },
    onError,
  })

  const moveMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAssignmentInput }) =>
      moveAssignment(id, input),
    onSuccess: (result) => {
      withWarnings(result)
      invalidate()
    },
    onError,
  })

  const unassignMutation = useMutation({
    mutationFn: (id: string) => unassign(id),
    onSuccess: () => {
      toast.success(frontDeskMessages.common.deletedToast)
      invalidate()
    },
    onError,
  })

  return {
    checkIn: checkInMutation,
    checkOut: checkOutMutation,
    noShow: noShowMutation,
    assign: assignMutation,
    move: moveMutation,
    unassign: unassignMutation,
  }
}
