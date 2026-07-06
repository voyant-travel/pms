"use client"

/**
 * Attach/detach room types to a rate plan — the sellable join. Available only
 * once the rate plan is saved (the join needs its id). Each room type in the
 * property is a toggle: checking it POSTs a join, unchecking DELETEs it by the
 * join row id.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Checkbox } from "@voyant-travel/ui/components/checkbox"
import { useMemo } from "react"
import { toast } from "sonner"
import { toFriendlyError } from "@/lib/friendly-error"

import {
  ariKeys,
  attachRatePlanRoomType,
  detachRatePlanRoomType,
  listRatePlanRoomTypes,
  listRoomTypes,
} from "./ari-client"
import { ariMessages } from "./ari-messages"

export function RatePlanRoomTypesEditor({
  ratePlanId,
  propertyId,
}: {
  ratePlanId: string
  propertyId: string
}) {
  const m = ariMessages.ratePlans
  const queryClient = useQueryClient()

  const { data: roomTypesData } = useQuery({
    queryKey: ariKeys.roomTypes(propertyId),
    queryFn: () => listRoomTypes(propertyId),
  })
  const { data: joinsData } = useQuery({
    queryKey: ariKeys.ratePlanRoomTypes(ratePlanId),
    queryFn: () => listRatePlanRoomTypes(ratePlanId),
  })

  const joinByRoomType = useMemo(() => {
    const map = new Map<string, string>()
    for (const join of joinsData?.data ?? []) map.set(join.roomTypeId, join.id)
    return map
  }, [joinsData])

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ariKeys.ratePlanRoomTypes(ratePlanId) })

  const toggle = useMutation({
    mutationFn: async ({ roomTypeId, attach }: { roomTypeId: string; attach: boolean }) => {
      if (attach) return attachRatePlanRoomType(ratePlanId, { roomTypeId })
      const joinId = joinByRoomType.get(roomTypeId)
      if (joinId) return detachRatePlanRoomType(joinId)
    },
    onSuccess: () => void invalidate(),
    onError: (err) => toast.error(toFriendlyError(err, "Failed")),
  })

  const roomTypes = roomTypesData?.data ?? []

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{m.roomTypes}</p>
      {roomTypes.length === 0 ? (
        <p className="text-muted-foreground text-xs">{m.noRoomTypes}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {roomTypes.map((rt) => {
            const attached = joinByRoomType.has(rt.id)
            return (
              <li
                key={rt.id}
                className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
              >
                <Checkbox
                  id={`rp-rt-${rt.id}`}
                  checked={attached}
                  disabled={toggle.isPending}
                  onCheckedChange={(v) => toggle.mutate({ roomTypeId: rt.id, attach: v === true })}
                />
                <label
                  htmlFor={`rp-rt-${rt.id}`}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <span className="font-medium">{rt.name}</span>
                  {rt.code ? (
                    <span className="text-muted-foreground font-mono text-xs">{rt.code}</span>
                  ) : null}
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
