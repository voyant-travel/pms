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
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { usePropertyOptions } from "../ari/property-selector"
import {
  deactivateStaff,
  housekeepingKeys,
  listStaff,
  type Staff,
  updateStaff,
} from "./housekeeping-client"
import { housekeepingMessages } from "./housekeeping-messages"
import { StaffDialog } from "./staff-dialog"

function StaffRowActions({ staff, onEdit }: { staff: Staff; onEdit: () => void }) {
  const m = housekeepingMessages.staff
  const queryClient = useQueryClient()
  const onDone = () => {
    toast.success(housekeepingMessages.common.savedToast)
    void queryClient.invalidateQueries({ queryKey: housekeepingKeys.all })
  }
  const onError = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : housekeepingMessages.common.loadFailed)

  const reactivate = useMutation({
    mutationFn: () => updateStaff(staff.id, { active: true }),
    onSuccess: onDone,
    onError,
  })
  const deactivate = useMutation({
    mutationFn: () => deactivateStaff(staff.id),
    onSuccess: onDone,
    onError,
  })

  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" onClick={onEdit}>
        {housekeepingMessages.common.edit}
      </Button>
      {staff.active ? (
        <ConfirmActionButton
          buttonLabel={m.deactivate}
          confirmLabel={m.deactivate}
          title={m.deactivateTitle}
          description={m.deactivateBody}
          variant="outline"
          confirmVariant="destructive"
          disabled={deactivate.isPending}
          onConfirm={async () => {
            await deactivate.mutateAsync()
          }}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={reactivate.isPending}
          onClick={() => reactivate.mutate()}
        >
          {m.reactivate}
        </Button>
      )}
    </div>
  )
}

export function StaffPage() {
  const m = housekeepingMessages.staff
  const [editing, setEditing] = useState<Staff | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const staffQuery = useQuery({
    queryKey: housekeepingKeys.staff("all"),
    queryFn: () => listStaff({}),
  })
  const { data: properties } = usePropertyOptions()
  const allPropertiesLabel = m.allProperties
  const propertyLabel = useMemo(() => {
    const byId = new Map((properties ?? []).map((p) => [p.id, p.label]))
    return (id: string | null) => (id ? (byId.get(id) ?? id) : allPropertiesLabel)
  }, [properties, allPropertiesLabel])

  const rows = staffQuery.data?.data ?? []

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{m.title}</h1>
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

      {staffQuery.isError ? (
        <p className="text-destructive text-sm">{housekeepingMessages.common.loadFailed}</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.colName}</TableHead>
              <TableHead>{m.colRole}</TableHead>
              <TableHead>{m.colProperty}</TableHead>
              <TableHead>{m.colStatus}</TableHead>
              <TableHead className="w-48" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((staff) => (
              <TableRow key={staff.id} className={staff.active ? undefined : "opacity-60"}>
                <TableCell className="font-medium">{staff.name}</TableCell>
                <TableCell className="text-muted-foreground">{m.roleLabels[staff.role]}</TableCell>
                <TableCell className="text-muted-foreground">
                  {propertyLabel(staff.propertyId)}
                </TableCell>
                <TableCell>
                  <Badge variant={staff.active ? "default" : "outline"}>
                    {staff.active ? m.active : m.inactive}
                  </Badge>
                </TableCell>
                <TableCell>
                  <StaffRowActions
                    staff={staff}
                    onEdit={() => {
                      setEditing(staff)
                      setDialogOpen(true)
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <StaffDialog
        staff={editing}
        properties={properties ?? []}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}
