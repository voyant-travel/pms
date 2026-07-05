"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { ConfirmActionButton } from "@voyant-travel/ui/components/confirm-action-button"
import { useState } from "react"
import { toast } from "sonner"

import { foliosKeys, getBusinessDate, type NightAuditResult, runNightAudit } from "./folios-client"
import { foliosMessages } from "./folios-messages"
import { FoliosPageShell } from "./folios-page-shell"

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function NightAuditView({ propertyId }: { propertyId: string }) {
  const m = foliosMessages.nightAudit
  const queryClient = useQueryClient()
  const [result, setResult] = useState<NightAuditResult | null>(null)

  const businessDateQuery = useQuery({
    queryKey: foliosKeys.businessDate(propertyId),
    queryFn: () => getBusinessDate(propertyId),
  })
  const businessDate = businessDateQuery.data?.data ?? null

  const audit = useMutation({
    mutationFn: () => runNightAudit(propertyId),
    onSuccess: ({ data }) => {
      setResult(data)
      toast.success(m.doneToast(data.posted, data.inHouse))
      void queryClient.invalidateQueries({ queryKey: foliosKeys.all })
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : foliosMessages.common.loadFailed),
  })

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">{m.businessDate}</span>
            <span className="font-mono text-2xl font-semibold">
              {businessDate ? businessDate.currentDate : foliosMessages.common.loading}
            </span>
            {businessDate ? (
              <span className="text-muted-foreground text-xs">
                {m.lastRun}:{" "}
                {businessDate.lastAuditRunAt
                  ? new Date(businessDate.lastAuditRunAt).toLocaleString()
                  : m.never}
              </span>
            ) : (
              !businessDateQuery.isLoading && (
                <span className="text-muted-foreground text-xs">{m.notInitialized}</span>
              )
            )}
          </div>
          <ConfirmActionButton
            buttonLabel={m.run}
            confirmLabel={m.run}
            title={m.runTitle}
            description={m.runBody}
            disabled={audit.isPending}
            onConfirm={async () => {
              await audit.mutateAsync()
            }}
          />
        </CardHeader>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>{m.resultTitle}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-wrap gap-10">
              <Stat label={m.inHouse} value={result.inHouse} />
              <Stat label={m.posted} value={result.posted} />
              <Stat label={m.rolledTo} value={result.rolledTo} />
            </div>
            {result.unpriced.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">
                  {m.unpriced} ({result.unpriced.length})
                </span>
                <p className="text-muted-foreground text-xs">{m.unpricedHint}</p>
                <div className="flex flex-wrap gap-2">
                  {result.unpriced.map((id) => (
                    <Badge key={id} variant="destructive" className="font-mono font-normal">
                      {id}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export function NightAuditPage() {
  return (
    <FoliosPageShell title={foliosMessages.nightAudit.title}>
      {(propertyId) => <NightAuditView propertyId={propertyId} />}
    </FoliosPageShell>
  )
}
