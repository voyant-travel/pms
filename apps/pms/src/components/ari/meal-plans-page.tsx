"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { ConfirmActionButton } from "@voyant-travel/ui/components/confirm-action-button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ariKeys, deleteMealPlan, listMealPlans, type MealPlan } from "./ari-client"
import { ariMessages } from "./ari-messages"
import { AriPageShell } from "./ari-page-shell"
import { MealPlanDialog } from "./meal-plan-dialog"

function mealSummary(plan: MealPlan): string {
  const parts: string[] = []
  if (plan.includesBreakfast) parts.push(ariMessages.mealPlans.breakfast)
  if (plan.includesLunch) parts.push(ariMessages.mealPlans.lunch)
  if (plan.includesDinner) parts.push(ariMessages.mealPlans.dinner)
  if (plan.includesDrinks) parts.push(ariMessages.mealPlans.drinks)
  return parts.join(", ") || "—"
}

function MealPlansTable({ propertyId }: { propertyId: string }) {
  const m = ariMessages
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<MealPlan | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ariKeys.mealPlans(propertyId),
    queryFn: () => listMealPlans(propertyId),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteMealPlan(id),
    onSuccess: () => {
      toast.success(m.common.deletedToast)
      void queryClient.invalidateQueries({ queryKey: ariKeys.mealPlans(propertyId) })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : m.common.loadFailed),
  })

  if (isError) return <p className="text-destructive text-sm">{m.common.loadFailed}</p>
  if (isLoading) return <p className="text-muted-foreground text-sm">…</p>

  const plans = data?.data ?? []

  return (
    <>
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="size-4" /> {m.mealPlans.new}
        </Button>
      </div>

      {plans.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.common.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.common.code}</TableHead>
              <TableHead>{m.common.name}</TableHead>
              <TableHead>Includes</TableHead>
              <TableHead />
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell className="font-mono text-xs">{plan.code}</TableCell>
                <TableCell className="font-medium">{plan.name}</TableCell>
                <TableCell className="text-muted-foreground">{mealSummary(plan)}</TableCell>
                <TableCell>
                  {plan.active === false ? <Badge variant="secondary">Inactive</Badge> : null}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(plan)
                        setDialogOpen(true)
                      }}
                    >
                      {m.common.edit}
                    </Button>
                    <ConfirmActionButton
                      buttonLabel={m.common.delete}
                      confirmLabel={m.common.deleteConfirm}
                      title={m.mealPlans.deleteTitle}
                      description={m.mealPlans.deleteBody}
                      variant="outline"
                      confirmVariant="destructive"
                      onConfirm={async () => {
                        await remove.mutateAsync(plan.id)
                      }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <MealPlanDialog
        propertyId={propertyId}
        plan={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}

export function MealPlansPage() {
  return (
    <AriPageShell title={ariMessages.mealPlans.title}>
      {(propertyId) => <MealPlansTable propertyId={propertyId} />}
    </AriPageShell>
  )
}
