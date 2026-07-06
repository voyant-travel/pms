"use client"

/**
 * Base "starting price" grid: room types down the side, rate plans across the
 * top, each cell an inline-editable "from €X /night" price that upserts
 * `pms_rate_base`. This is the foundation every pricing rule builds on.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Input } from "@voyant-travel/ui/components/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { toFriendlyError } from "@/lib/friendly-error"

import {
  ariKeys,
  listRateBases,
  listRatePlans,
  listRoomTypes,
  type RateBase,
  upsertRateBase,
} from "./ari-client"
import { ariMessages } from "./ari-messages"

/** Parse a euros string ("180", "180.50") into integer cents, or null if blank/invalid. */
function eurosToCents(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === "") return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}

function centsToEuros(cents: number | undefined): string {
  if (cents === undefined) return ""
  const whole = cents / 100
  return Number.isInteger(whole) ? String(whole) : whole.toFixed(2)
}

function BaseRateCell({
  propertyId,
  ratePlanId,
  roomTypeId,
  currency,
  existing,
}: {
  propertyId: string
  ratePlanId: string
  roomTypeId: string
  currency: string
  existing: RateBase | undefined
}) {
  const m = ariMessages.pricing.baseRates
  const queryClient = useQueryClient()
  const [value, setValue] = useState(() => centsToEuros(existing?.baseAmountCents))

  // Keep the cell in sync when the underlying data changes (e.g. after refetch).
  useEffect(() => {
    setValue(centsToEuros(existing?.baseAmountCents))
  }, [existing?.baseAmountCents])

  const save = useMutation({
    mutationFn: (cents: number) =>
      upsertRateBase({ propertyId, ratePlanId, roomTypeId, currency, baseAmountCents: cents }),
    onSuccess: () => {
      toast.success(m.saved)
      void queryClient.invalidateQueries({ queryKey: ariKeys.rateBases(propertyId) })
    },
    onError: (err) => toast.error(toFriendlyError(err, "Save failed")),
  })

  const commit = () => {
    const cents = eurosToCents(value)
    if (cents === null) {
      // Reset an invalid/blank edit back to the stored value.
      setValue(centsToEuros(existing?.baseAmountCents))
      return
    }
    if (cents === existing?.baseAmountCents) return
    save.mutate(cents)
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground text-xs">from</span>
      <Input
        aria-label={`Base price ${ratePlanId} ${roomTypeId}`}
        inputMode="decimal"
        className="h-8 w-24"
        value={value}
        placeholder={m.notSet}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
        }}
        disabled={save.isPending}
      />
      <span className="text-muted-foreground text-xs">{m.perNight}</span>
    </div>
  )
}

export function PricingBaseRates({ propertyId }: { propertyId: string }) {
  const m = ariMessages.pricing.baseRates
  const roomTypesQuery = useQuery({
    queryKey: ariKeys.roomTypes(propertyId),
    queryFn: () => listRoomTypes(propertyId),
  })
  const ratePlansQuery = useQuery({
    queryKey: ariKeys.ratePlans(propertyId),
    queryFn: () => listRatePlans(propertyId),
  })
  const rateBasesQuery = useQuery({
    queryKey: ariKeys.rateBases(propertyId),
    queryFn: () => listRateBases(propertyId),
  })

  const roomTypes = roomTypesQuery.data?.data ?? []
  const ratePlans = ratePlansQuery.data?.data ?? []
  const bases = rateBasesQuery.data?.data ?? []
  const baseByPair = new Map(bases.map((b) => [`${b.ratePlanId}|${b.roomTypeId}`, b]))

  if (roomTypes.length === 0 || ratePlans.length === 0) {
    return <p className="text-muted-foreground text-sm">{m.empty}</p>
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-40">Room</TableHead>
            {ratePlans.map((rp) => (
              <TableHead key={rp.id}>
                {rp.name}
                <span className="ml-1 text-muted-foreground text-xs">({rp.currencyCode})</span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {roomTypes.map((rt) => (
            <TableRow key={rt.id}>
              <TableCell className="font-medium">{rt.name}</TableCell>
              {ratePlans.map((rp) => (
                <TableCell key={rp.id}>
                  <BaseRateCell
                    propertyId={propertyId}
                    ratePlanId={rp.id}
                    roomTypeId={rt.id}
                    currency={rp.currencyCode}
                    existing={baseByPair.get(`${rp.id}|${rt.id}`)}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
