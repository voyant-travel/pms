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

import { ariKeys, deleteRatePlan, listRatePlans, type RatePlan } from "./ari-client"
import { CHARGE_FREQUENCY_OPTIONS, GUARANTEE_MODE_OPTIONS } from "./ari-constants"
import { ariMessages } from "./ari-messages"
import { AriPageShell } from "./ari-page-shell"
import { RatePlanDialog } from "./rate-plan-dialog"

const chargeLabel = (v: string) => CHARGE_FREQUENCY_OPTIONS.find((o) => o.value === v)?.label ?? v
const guaranteeLabel = (v: string) => GUARANTEE_MODE_OPTIONS.find((o) => o.value === v)?.label ?? v

function RatePlansTable({ propertyId }: { propertyId: string }) {
  const m = ariMessages
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<RatePlan | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ariKeys.ratePlans(propertyId),
    queryFn: () => listRatePlans(propertyId),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteRatePlan(id),
    onSuccess: () => {
      toast.success(m.common.deletedToast)
      void queryClient.invalidateQueries({ queryKey: ariKeys.ratePlans(propertyId) })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : m.common.loadFailed),
  })

  if (isError) return <p className="text-destructive text-sm">{m.common.loadFailed}</p>
  if (isLoading) return <p className="text-muted-foreground text-sm">…</p>

  const ratePlans = data?.data ?? []

  return (
    <>
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="size-4" /> {m.ratePlans.new}
        </Button>
      </div>

      {ratePlans.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.common.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.common.code}</TableHead>
              <TableHead>{m.common.name}</TableHead>
              <TableHead>{m.ratePlans.currency}</TableHead>
              <TableHead>{m.ratePlans.chargeFrequency}</TableHead>
              <TableHead>{m.ratePlans.guaranteeMode}</TableHead>
              <TableHead />
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {ratePlans.map((rp) => (
              <TableRow key={rp.id}>
                <TableCell className="font-mono text-xs">{rp.code}</TableCell>
                <TableCell className="font-medium">{rp.name}</TableCell>
                <TableCell>{rp.currencyCode}</TableCell>
                <TableCell className="text-muted-foreground">
                  {chargeLabel(rp.chargeFrequency)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {guaranteeLabel(rp.guaranteeMode)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {rp.refundable ? <Badge variant="secondary">Refundable</Badge> : null}
                    {rp.active === false ? <Badge variant="secondary">Inactive</Badge> : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(rp)
                        setDialogOpen(true)
                      }}
                    >
                      {m.common.edit}
                    </Button>
                    <ConfirmActionButton
                      buttonLabel={m.common.delete}
                      confirmLabel={m.common.deleteConfirm}
                      title={m.ratePlans.deleteTitle}
                      description={m.ratePlans.deleteBody}
                      variant="outline"
                      confirmVariant="destructive"
                      onConfirm={async () => {
                        await remove.mutateAsync(rp.id)
                      }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <RatePlanDialog
        propertyId={propertyId}
        ratePlan={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}

export function RatePlansPage() {
  return (
    <AriPageShell title={ariMessages.ratePlans.title}>
      {(propertyId) => <RatePlansTable propertyId={propertyId} />}
    </AriPageShell>
  )
}
