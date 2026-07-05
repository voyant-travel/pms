"use client"

/**
 * Folio write operations as react-query mutations: add posting, void, transfer,
 * settle, close, open house folio. Each invalidates the folios tree so the list
 * and the open detail refetch (no optimistic updates). Errors surface as toasts;
 * settle reports the minted invoice id or the house-account reason.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  type CreatePostingInput,
  closeFolio,
  createPosting,
  foliosKeys,
  type OpenFolioInput,
  openFolio,
  type SettleFolioInput,
  settleFolio,
  transferPosting,
  voidPosting,
} from "./folios-client"
import { foliosMessages } from "./folios-messages"

export function useFolioMutations() {
  const queryClient = useQueryClient()
  const m = foliosMessages
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: foliosKeys.all })
  }
  const onError = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : m.common.loadFailed)

  const addPosting = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreatePostingInput }) =>
      createPosting(id, input),
    onSuccess: () => {
      toast.success(m.common.savedToast)
      invalidate()
    },
    onError,
  })

  const void_ = useMutation({
    mutationFn: (postingId: string) => voidPosting(postingId),
    onSuccess: () => {
      toast.success(m.common.savedToast)
      invalidate()
    },
    onError,
  })

  const transfer = useMutation({
    mutationFn: ({
      id,
      postingId,
      targetFolioId,
    }: {
      id: string
      postingId: string
      targetFolioId: string
    }) => transferPosting(id, { postingId, targetFolioId }),
    onSuccess: () => {
      toast.success(m.common.savedToast)
      invalidate()
    },
    onError,
  })

  const settle = useMutation({
    mutationFn: ({ id, input }: { id: string; input: SettleFolioInput }) => settleFolio(id, input),
    onSuccess: ({ data }) => {
      if (data.financeInvoiceId) {
        toast.success(m.detail.settledInvoiceToast(data.financeInvoiceId))
      } else {
        toast.success(m.detail.settledHouseToast(data.reason ?? ""))
      }
      invalidate()
    },
    onError,
  })

  const close = useMutation({
    mutationFn: (id: string) => closeFolio(id),
    onSuccess: () => {
      toast.success(m.common.savedToast)
      invalidate()
    },
    onError,
  })

  const openHouse = useMutation({
    mutationFn: (input: OpenFolioInput) => openFolio(input),
    onSuccess: () => {
      toast.success(m.common.savedToast)
      invalidate()
    },
    onError,
  })

  return { addPosting, void_, transfer, settle, close, openHouse }
}
