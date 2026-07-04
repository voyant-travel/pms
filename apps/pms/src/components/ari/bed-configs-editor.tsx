"use client"

/**
 * Bed configuration sub-editor for a room type. Bed configs are nested under a
 * saved room type (they need its id), so this only appears in edit mode; it
 * reads/writes the `/room-types/:id/bed-configs` endpoints directly and
 * invalidates its own list on each change.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@voyant-travel/ui/components/button"
import { Checkbox } from "@voyant-travel/ui/components/checkbox"
import { Input } from "@voyant-travel/ui/components/input"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ariKeys, createBedConfig, deleteBedConfig, listBedConfigs } from "./ari-client"
import { ariMessages } from "./ari-messages"

export function BedConfigsEditor({ roomTypeId }: { roomTypeId: string }) {
  const m = ariMessages.roomTypes
  const queryClient = useQueryClient()
  const [bedType, setBedType] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [isPrimary, setIsPrimary] = useState(false)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ariKeys.bedConfigs(roomTypeId) })

  const { data } = useQuery({
    queryKey: ariKeys.bedConfigs(roomTypeId),
    queryFn: () => listBedConfigs(roomTypeId),
  })

  const add = useMutation({
    mutationFn: () =>
      createBedConfig(roomTypeId, {
        bedType: bedType.trim(),
        quantity: Number(quantity) || 1,
        isPrimary,
      }),
    onSuccess: () => {
      setBedType("")
      setQuantity("1")
      setIsPrimary(false)
      void invalidate()
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteBedConfig(id),
    onSuccess: () => void invalidate(),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  })

  const beds = data?.data ?? []

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{m.bedConfigs}</p>
      {beds.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {beds.map((bed) => (
            <li
              key={bed.id}
              className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"
            >
              <span>
                {bed.quantity ?? 1} × {bed.bedType}
                {bed.isPrimary ? " (primary)" : ""}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => remove.mutate(bed.id)}
                aria-label={ariMessages.common.delete}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">{ariMessages.common.empty}</p>
      )}

      <div className="flex items-end gap-2">
        <Input
          placeholder={m.bedType}
          value={bedType}
          onChange={(e) => setBedType(e.target.value)}
          className="flex-1"
        />
        <Input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-20"
          aria-label={m.quantity}
        />
        <div className="flex items-center gap-1.5 whitespace-nowrap text-sm">
          <Checkbox
            id="bed-primary"
            checked={isPrimary}
            onCheckedChange={(v) => setIsPrimary(v === true)}
          />
          <label htmlFor="bed-primary">Primary</label>
        </div>
        <Button
          variant="outline"
          onClick={() => add.mutate()}
          disabled={add.isPending || !bedType.trim()}
        >
          {m.addBed}
        </Button>
      </div>
    </div>
  )
}
