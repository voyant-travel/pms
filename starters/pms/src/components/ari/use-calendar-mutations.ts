"use client"

/**
 * Single-cell calendar edits. There is no per-cell write endpoint upstream, so
 * a cell edit is just a one-day bulk operation (`from === to === date`); this
 * keeps the write path identical to the bulk dialog and invalidates the whole
 * ARI tree on success (no optimistic updates — the grid refetches).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { toFriendlyError } from "@/lib/friendly-error"

import { ariKeys, bulkUpsertInventory, bulkUpsertRates } from "./ari-client"

export function useCalendarMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ariKeys.all })
  const onError = (err: unknown) => toast.error(toFriendlyError(err, "Save failed"))

  const saveInventory = useMutation({
    mutationFn: (input: { roomTypeId: string; date: string; capacity: number; closed: boolean }) =>
      bulkUpsertInventory([
        {
          roomTypeId: input.roomTypeId,
          from: input.date,
          to: input.date,
          capacity: input.capacity,
          closed: input.closed,
        },
      ]),
    onSuccess: invalidate,
    onError,
  })

  const saveRate = useMutation({
    mutationFn: (input: {
      ratePlanId: string
      roomTypeId: string
      date: string
      sellCurrency: string
      sellAmountCents: number
    }) =>
      bulkUpsertRates([
        {
          ratePlanId: input.ratePlanId,
          roomTypeId: input.roomTypeId,
          from: input.date,
          to: input.date,
          sellCurrency: input.sellCurrency,
          sellAmountCents: input.sellAmountCents,
        },
      ]),
    onSuccess: invalidate,
    onError,
  })

  return { saveInventory, saveRate }
}
