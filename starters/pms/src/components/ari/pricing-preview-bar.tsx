"use client"

/**
 * Preview & apply bar: pick a date horizon (default today → +1 year), preview
 * what the current base prices + rules would write (read-only, per room type
 * "N nights updated, before → after"), then apply — which OVERWRITES the daily
 * rates in the range. The confirm dialog states the overwrite semantics loudly.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@voyant-travel/ui/components/button"
import { ConfirmActionButton } from "@voyant-travel/ui/components/confirm-action-button"
import { AlertTriangle } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { toFriendlyError } from "@/lib/friendly-error"

import { IsoDateField } from "../admin-shared/iso-date-field"
import { applyPricing, ariKeys, listRoomTypes, previewPricing } from "./ari-client"
import { ariMessages } from "./ari-messages"
import { formatCentsRange } from "./pricing-summary"

/** ISO date `n` days from today (UTC calendar date). */
function isoOffset(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

interface RoomRollup {
  roomTypeId: string
  nights: number
  minBefore: number | null
  maxBefore: number | null
  minAfter: number | null
  maxAfter: number | null
  currency: string
}

function minOf(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.min(a, b)
}
function maxOf(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.max(a, b)
}

export function PricingPreviewBar({ propertyId }: { propertyId: string }) {
  const m = ariMessages.pricing.apply
  const queryClient = useQueryClient()
  const [from, setFrom] = useState(() => isoOffset(0))
  const [to, setTo] = useState(() => isoOffset(365))

  const roomTypesQuery = useQuery({
    queryKey: ariKeys.roomTypes(propertyId),
    queryFn: () => listRoomTypes(propertyId),
  })
  const roomTypeName = new Map((roomTypesQuery.data?.data ?? []).map((r) => [r.id, r.name]))

  const preview = useMutation({
    mutationFn: () => previewPricing(propertyId, from, to),
    onError: (err) => toast.error(toFriendlyError(err, "Preview failed")),
  })

  const apply = useMutation({
    mutationFn: () => applyPricing(propertyId, from, to),
    onSuccess: (res) => {
      toast.success(m.applied(res.data.upserted))
      // Refresh the calendar reads so the new rates show immediately.
      void queryClient.invalidateQueries({ queryKey: ariKeys.all })
      preview.reset()
    },
    onError: (err) => toast.error(toFriendlyError(err, "Apply failed")),
  })

  const result = preview.data?.data

  // Roll up per-pair deltas into per-room-type summaries for a friendly panel.
  const rollups = new Map<string, RoomRollup>()
  for (const pair of result?.pairs ?? []) {
    const prev = rollups.get(pair.roomTypeId)
    if (prev) {
      prev.nights += pair.datesChanged
      prev.minBefore = minOf(prev.minBefore, pair.minBefore)
      prev.maxBefore = maxOf(prev.maxBefore, pair.maxBefore)
      prev.minAfter = minOf(prev.minAfter, pair.minAfter)
      prev.maxAfter = maxOf(prev.maxAfter, pair.maxAfter)
    } else {
      rollups.set(pair.roomTypeId, {
        roomTypeId: pair.roomTypeId,
        nights: pair.datesChanged,
        minBefore: pair.minBefore,
        maxBefore: pair.maxBefore,
        minAfter: pair.minAfter,
        maxAfter: pair.maxAfter,
        currency: pair.currency,
      })
    }
  }
  const rows = [...rollups.values()]

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div>
        <h2 className="text-lg font-semibold">{m.title}</h2>
        <p className="text-muted-foreground text-sm">{m.overwriteNote}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <IsoDateField
          label={m.from}
          value={from}
          onChange={setFrom}
          required
          containerClassName="w-44"
        />
        <IsoDateField label={m.to} value={to} onChange={setTo} required containerClassName="w-44" />
        <Button variant="outline" onClick={() => preview.mutate()} disabled={preview.isPending}>
          {preview.isPending ? m.previewing : m.preview}
        </Button>
        <ConfirmActionButton
          buttonLabel={m.apply}
          confirmLabel={m.confirmCta}
          title={m.confirmTitle}
          description={m.confirmBody}
          confirmVariant="destructive"
          disabled={apply.isPending || !result || result.totalDatesChanged === 0}
          onConfirm={async () => {
            await apply.mutateAsync()
          }}
        />
      </div>

      {result ? (
        result.totalDatesChanged === 0 ? (
          <p className="text-muted-foreground text-sm">{m.noChanges}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4 text-amber-500" />
              {m.summaryHead(result.totalDatesChanged)}
            </p>
            <ul className="flex flex-col gap-1.5">
              {rows.map((r) => (
                <li
                  key={r.roomTypeId}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm"
                >
                  <span className="font-medium">
                    {roomTypeName.get(r.roomTypeId) ?? r.roomTypeId}
                  </span>
                  <span className="text-muted-foreground">
                    {m.pairNights(r.nights)} · {m.before}{" "}
                    {formatCentsRange(r.minBefore, r.maxBefore, r.currency)} → {m.after}{" "}
                    <span className="text-foreground font-medium">
                      {formatCentsRange(r.minAfter, r.maxAfter, r.currency)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
    </div>
  )
}
