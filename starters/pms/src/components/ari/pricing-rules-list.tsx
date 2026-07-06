"use client"

/**
 * Plain-language list of pricing rules ("Jun 1 – Aug 31 · +60% · All rooms"),
 * ordered by application priority, with create / edit / delete. Names (not ids)
 * are resolved for the scope summary via the room-type and rate-plan lists.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { ConfirmActionButton } from "@voyant-travel/ui/components/confirm-action-button"
import { Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { toFriendlyError } from "@/lib/friendly-error"

import {
  ariKeys,
  deletePricingRule,
  listPricingRules,
  listRatePlans,
  listRoomTypes,
  type PricingRule,
} from "./ari-client"
import { ariMessages } from "./ari-messages"
import { PricingRuleDialog } from "./pricing-rule-dialog"
import { ruleSummaryLine } from "./pricing-summary"

export function PricingRulesList({ propertyId }: { propertyId: string }) {
  const m = ariMessages.pricing.rules
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<PricingRule | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const rulesQuery = useQuery({
    queryKey: ariKeys.pricingRules(propertyId),
    queryFn: () => listPricingRules(propertyId),
  })
  const roomTypesQuery = useQuery({
    queryKey: ariKeys.roomTypes(propertyId),
    queryFn: () => listRoomTypes(propertyId),
  })
  const ratePlansQuery = useQuery({
    queryKey: ariKeys.ratePlans(propertyId),
    queryFn: () => listRatePlans(propertyId),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deletePricingRule(id),
    onSuccess: () => {
      toast.success(ariMessages.common.deletedToast)
      void queryClient.invalidateQueries({ queryKey: ariKeys.pricingRules(propertyId) })
    },
    onError: (err) => toast.error(toFriendlyError(err, ariMessages.common.loadFailed)),
  })

  const roomTypeName = new Map((roomTypesQuery.data?.data ?? []).map((r) => [r.id, r.name]))
  const ratePlanName = new Map((ratePlansQuery.data?.data ?? []).map((r) => [r.id, r.name]))
  const rules = rulesQuery.data?.data ?? []

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{m.title}</h2>
          <p className="text-muted-foreground text-sm">{m.subtitle}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="size-4" /> {m.new}
        </Button>
      </div>

      {rules.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.empty}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center justify-between gap-4 rounded-md border p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{rule.name}</span>
                  {rule.active === false ? <Badge variant="secondary">{m.inactive}</Badge> : null}
                </div>
                <p className="text-muted-foreground text-sm">
                  {ruleSummaryLine(
                    rule,
                    (id) => roomTypeName.get(id) ?? id,
                    (id) => ratePlanName.get(id) ?? id,
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(rule)
                    setDialogOpen(true)
                  }}
                >
                  {ariMessages.common.edit}
                </Button>
                <ConfirmActionButton
                  buttonLabel={ariMessages.common.delete}
                  confirmLabel={ariMessages.common.deleteConfirm}
                  title={m.deleteTitle}
                  description={m.deleteBody}
                  variant="outline"
                  confirmVariant="destructive"
                  onConfirm={async () => {
                    await remove.mutateAsync(rule.id)
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}

      <PricingRuleDialog
        propertyId={propertyId}
        rule={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}
