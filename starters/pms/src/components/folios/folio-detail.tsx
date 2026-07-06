"use client"

import { useQuery } from "@tanstack/react-query"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { ConfirmActionButton } from "@voyant-travel/ui/components/confirm-action-button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { ArrowLeft, ArrowLeftRight, Plus } from "lucide-react"
import { useMemo, useState } from "react"

import { type Folio, type FolioPosting, foliosKeys, getFolio, listFolios } from "./folios-client"
import { foliosMessages } from "./folios-messages"
import {
  canAddPosting,
  canCloseFolio,
  canSettleFolio,
  canTransferPosting,
  canVoidPosting,
  type FolioStatus,
  formatMoney,
  type LedgerRow,
  toLedgerRows,
} from "./folios-model"
import { PostingDialog } from "./posting-dialog"
import { TransferDialog } from "./transfer-dialog"
import { useFolioMutations } from "./use-folio-mutations"

const STATUS_VARIANT: Record<FolioStatus, "default" | "secondary" | "outline" | "destructive"> = {
  open: "default",
  settled: "secondary",
  closed: "outline",
  voided: "destructive",
}

function PostingTypeBadge({ type }: { type: string }) {
  const label =
    foliosMessages.detail.postingType[type as keyof typeof foliosMessages.detail.postingType] ??
    type
  return (
    <Badge variant={type === "payment" ? "secondary" : "outline"} className="font-normal">
      {label}
    </Badge>
  )
}

function LedgerActions({
  row,
  status,
  onTransfer,
  onVoid,
  voidPending,
}: {
  row: LedgerRow<FolioPosting>
  status: FolioStatus
  onTransfer: () => void
  onVoid: () => Promise<void>
  voidPending: boolean
}) {
  const m = foliosMessages.detail
  if (!canVoidPosting(status, row)) {
    return row.isReversed ? <span className="text-muted-foreground text-xs">{m.voided}</span> : null
  }
  return (
    <div className="flex justify-end gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={!canTransferPosting(status, row)}
        onClick={onTransfer}
      >
        <ArrowLeftRight className="size-4" /> {m.transfer}
      </Button>
      <ConfirmActionButton
        buttonLabel={m.void}
        confirmLabel={m.void}
        title={m.voidTitle}
        description={m.voidBody}
        variant="ghost"
        confirmVariant="destructive"
        disabled={voidPending}
        onConfirm={onVoid}
      />
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  )
}

/** Full folio detail: header, actions, and the immutable posting ledger. */
export function FolioDetail({ folioId, onBack }: { folioId: string; onBack: () => void }) {
  const m = foliosMessages
  const [postingOpen, setPostingOpen] = useState(false)
  const [transferPosting, setTransferPosting] = useState<FolioPosting | null>(null)
  const { void_, settle, close } = useFolioMutations()

  const detailQuery = useQuery({
    queryKey: foliosKeys.detail(folioId),
    queryFn: () => getFolio(folioId),
  })
  const folio = detailQuery.data?.data.folio
  const postings = detailQuery.data?.data.postings ?? []
  const summary = detailQuery.data?.data.summary

  // Candidate transfer targets: other open folios in the same property + currency.
  const targetsQuery = useQuery({
    queryKey: foliosKeys.list(folio?.propertyId ?? "", "open"),
    queryFn: () => listFolios({ propertyId: folio?.propertyId ?? "", status: "open" }),
    enabled: Boolean(folio && folio.status === "open"),
  })
  const transferTargets: Folio[] = useMemo(
    () =>
      (targetsQuery.data?.data ?? []).filter(
        (f) => f.id !== folioId && f.currency === folio?.currency,
      ),
    [targetsQuery.data, folioId, folio?.currency],
  )

  const rows = useMemo(() => toLedgerRows(postings), [postings])

  const back = (
    <Button variant="ghost" size="sm" onClick={onBack}>
      <ArrowLeft className="size-4" /> {m.common.back}
    </Button>
  )

  if (detailQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <p className="text-destructive text-sm">{m.common.loadFailed}</p>
      </div>
    )
  }
  if (!folio || !summary) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <p className="text-muted-foreground text-sm">{m.common.loading}</p>
      </div>
    )
  }

  const status = folio.status
  const settleBody = folio.kind === "stay" ? m.detail.settleStayBody : m.detail.settleHouseBody

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        <div className="flex flex-wrap items-center gap-2">
          {canAddPosting(status) ? (
            <Button size="sm" onClick={() => setPostingOpen(true)}>
              <Plus className="size-4" /> {m.detail.addPosting}
            </Button>
          ) : null}
          {canSettleFolio(status) ? (
            <ConfirmActionButton
              buttonLabel={m.detail.settle}
              confirmLabel={m.detail.settle}
              title={m.detail.settleTitle}
              description={settleBody}
              disabled={settle.isPending}
              onConfirm={async () => {
                await settle.mutateAsync({ id: folioId, input: {} })
              }}
            />
          ) : null}
          {canCloseFolio(status) ? (
            <ConfirmActionButton
              buttonLabel={m.detail.close}
              confirmLabel={m.detail.close}
              title={m.detail.closeTitle}
              description={m.detail.closeBody}
              variant="outline"
              disabled={close.isPending}
              onConfirm={async () => {
                await close.mutateAsync(folioId)
              }}
            />
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle className="font-mono text-xl">{folio.folioNumber}</CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{m.list.kind[folio.kind]}</Badge>
              <Badge variant={STATUS_VARIANT[status]}>{m.list.status[status]}</Badge>
              {folio.guestName ? <span>{folio.guestName}</span> : null}
            </div>
            <div className="text-muted-foreground flex flex-col gap-0.5 text-xs">
              {(folio.bookingNumber ?? folio.bookingId) ? (
                <span>
                  {m.detail.booking}:{" "}
                  <span className="font-mono">{folio.bookingNumber ?? folio.bookingId}</span>
                </span>
              ) : null}
              {folio.financeInvoiceId ? (
                <span>
                  {m.detail.invoice}: <span className="font-mono">{folio.financeInvoiceId}</span>
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex gap-6">
            <SummaryStat
              label={m.detail.charges}
              value={formatMoney(summary.chargesCents, folio.currency)}
            />
            <SummaryStat
              label={m.detail.paid}
              value={formatMoney(summary.paidCents, folio.currency)}
            />
            <SummaryStat
              label={m.detail.balance}
              value={formatMoney(summary.balanceCents, folio.currency)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-2 text-sm font-medium">{m.detail.ledger}</p>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{m.common.empty}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.detail.colDate}</TableHead>
                  <TableHead>{m.detail.colType}</TableHead>
                  <TableHead>{m.detail.colDescription}</TableHead>
                  <TableHead className="text-right">{m.detail.colQty}</TableHead>
                  <TableHead className="text-right">{m.detail.colAmount}</TableHead>
                  <TableHead className="text-right">{m.detail.balance}</TableHead>
                  <TableHead>{m.detail.colSource}</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const p = row.posting
                  return (
                    <TableRow key={p.id} className={row.isReversal ? "text-muted-foreground" : ""}>
                      <TableCell className="font-mono text-xs">{p.businessDate}</TableCell>
                      <TableCell>
                        <PostingTypeBadge type={p.type} />
                      </TableCell>
                      <TableCell className={row.isReversed ? "line-through" : ""}>
                        {p.description}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(p.amountCents, p.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.runningBalanceCents, folio.currency)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {m.detail.source[p.source as keyof typeof m.detail.source] ?? p.source}
                      </TableCell>
                      <TableCell>
                        <LedgerActions
                          row={row}
                          status={status}
                          voidPending={void_.isPending}
                          onTransfer={() => setTransferPosting(p)}
                          onVoid={async () => {
                            await void_.mutateAsync(p.id)
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PostingDialog
        folioId={folioId}
        currency={folio.currency}
        open={postingOpen}
        onOpenChange={setPostingOpen}
      />
      <TransferDialog
        folioId={folioId}
        posting={transferPosting}
        targets={transferTargets}
        open={transferPosting !== null}
        onOpenChange={(next) => {
          if (!next) setTransferPosting(null)
        }}
      />
    </div>
  )
}
