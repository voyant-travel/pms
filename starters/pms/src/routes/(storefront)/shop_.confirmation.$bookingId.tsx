import { createFileRoute, Link, useParams, useSearch } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { useEffect, useState } from "react"
import { z } from "zod"
import { getApiUrl } from "@/lib/env"
import { useStorefrontMessagesOrDefault } from "@/lib/storefront-i18n"

/**
 * Post-checkout confirmation page for the storefront flow.
 *
 * Renders one of four panels keyed off `?kind=`:
 *
 *   - `card_pending`  — "we're processing your card payment"
 *   - `bank_transfer` — proforma + IBAN/reference instructions,
 *                        pulled from sessionStorage where the
 *                        storefront wrapper stashed them.
 *   - `inquiry`        — "we'll get back to you" thanks page
 *   - `hold`           — "we've placed a hold" (operator brokered)
 *   - default          — generic confirmation when no kind is set
 *
 * Phase 6: poll the booking status and surface contract / invoice
 * download links once the workflow finishes.
 */

const confirmationSearchSchema = z.object({
  kind: z.enum(["card_pending", "bank_transfer", "inquiry", "hold"]).optional(),
  session: z.string().optional(),
  orderId: z.string().optional(),
  ref: z.string().optional(),
})

interface BankTransferStash {
  kind: "bank_transfer_instructions"
  bookingId: string
  proformaNumber: string | null
  instructions: BankTransferInstructions
}

interface BankTransferInstructions {
  beneficiary: string
  iban: string
  bankName: string
  reference: string
  amountCents: number
  currency: string
  dueAt: string | null
}

export const Route = createFileRoute("/(storefront)/shop_/confirmation/$bookingId")({
  component: ShopConfirmationRouteComponent,
  validateSearch: confirmationSearchSchema,
})

function ShopConfirmationRouteComponent(): React.ReactElement {
  const { bookingId } = useParams({ from: "/(storefront)/shop_/confirmation/$bookingId" })
  const search = useSearch({ from: "/(storefront)/shop_/confirmation/$bookingId" })
  const kind = search.kind ?? "default"

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {kind === "bank_transfer" ? (
        <BankTransferPanel bookingId={bookingId} />
      ) : kind === "card_pending" ? (
        <CardPendingPanel
          bookingId={bookingId}
          paymentRef={search.session ?? search.orderId ?? search.ref}
        />
      ) : kind === "inquiry" ? (
        <InquiryPanel bookingId={bookingId} />
      ) : kind === "hold" ? (
        <HoldPanel bookingId={bookingId} />
      ) : (
        <DefaultPanel bookingId={bookingId} />
      )}
      <BackLink />
    </div>
  )
}

function BankTransferPanel({ bookingId }: { bookingId: string }): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().confirmation
  const [stash, setStash] = useState<BankTransferStash | null>(null)
  const status = useCheckoutStatus(bookingId)
  const liveInstructions = status?.bankTransferInstructions ?? null
  const instructions = liveInstructions ?? stash?.instructions ?? null
  const proformaNumber = liveInstructions?.proformaNumber ?? stash?.proformaNumber ?? null

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return
    const raw = sessionStorage.getItem(`voyant.checkout.${bookingId}`)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as BankTransferStash
      if (parsed.kind === "bank_transfer_instructions") setStash(parsed)
    } catch {
      // Bad stash — ignore.
    }
  }, [bookingId])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.bankTransferTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p>{t.bankTransferIntro}</p>
        {instructions ? (
          <dl className="space-y-2 rounded border bg-muted/30 p-4">
            <Row label={t.bookingReference} value={bookingId} />
            {proformaNumber ? <Row label={t.proformaNumber} value={proformaNumber} /> : null}
            <Row label={t.beneficiary} value={instructions.beneficiary} />
            <Row label={t.bank} value={instructions.bankName} />
            <Row label={t.iban} value={instructions.iban} />
            <Row label={t.reference} value={instructions.reference} />
            <Row
              label={t.amount}
              value={formatMoney(instructions.amountCents, instructions.currency)}
            />
            {instructions.dueAt ? <Row label={t.dueBy} value={instructions.dueAt} /> : null}
          </dl>
        ) : (
          <p className="text-muted-foreground">{t.bankTransferEmailed}</p>
        )}
        <p className="text-muted-foreground">{t.bankTransferFollowUp}</p>
      </CardContent>
    </Card>
  )
}

interface CheckoutStatus {
  bookingId: string
  bookingNumber: string
  bookingStatus: string
  paymentStatus: "paid" | "pending" | "failed"
  session: {
    id: string
    status: string
    amountCents: number
    currency: string
    completedAt: string | null
  } | null
  bankTransferInstructions: (BankTransferInstructions & { proformaNumber: string | null }) | null
}

function CardPendingPanel({
  bookingId,
  paymentRef,
}: {
  bookingId: string
  paymentRef?: string
}): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().confirmation
  const status = useCheckoutStatus(bookingId, paymentRef)

  if (status?.paymentStatus === "paid") {
    return <PaymentSuccessPanel bookingId={bookingId} status={status} />
  }

  if (status?.paymentStatus === "failed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.paymentNotCompletedTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            {t.bookingReference}: <code>{status.bookingNumber || bookingId}</code>
          </p>
          <p className="text-muted-foreground">{t.paymentNotCompletedBody}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.processingTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          {t.bookingReference}: <code>{bookingId}</code>
        </p>
        <p className="text-muted-foreground">{t.processingBody}</p>
      </CardContent>
    </Card>
  )
}

function PaymentSuccessPanel({
  bookingId,
  status,
}: {
  bookingId: string
  status: CheckoutStatus
}): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().confirmation
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.confirmedTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          {t.bookingReference}: <code>{status.bookingNumber || bookingId}</code>
        </p>
        {status.session ? (
          <p>
            {t.paymentReceived}{" "}
            <strong>{formatMoney(status.session.amountCents, status.session.currency)}</strong>
          </p>
        ) : null}
        <p className="text-muted-foreground">{t.confirmedFollowUp}</p>
      </CardContent>
    </Card>
  )
}

function useCheckoutStatus(bookingId: string, paymentRef?: string): CheckoutStatus | null {
  const [status, setStatus] = useState<CheckoutStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    let timeoutId: number | undefined

    const poll = async () => {
      const url = new URL(
        `${getApiUrl()}/v1/public/bookings/${encodeURIComponent(bookingId)}/checkout-status`,
      )
      if (paymentRef) url.searchParams.set("ref", paymentRef)
      try {
        const res = await fetch(url, { credentials: "include" })
        if (res.ok) {
          const json = (await res.json()) as { data?: CheckoutStatus }
          if (!cancelled && json.data) {
            setStatus(json.data)
            if (json.data.paymentStatus !== "pending") return
          }
        }
      } catch {
        // Keep polling; transient local/dev errors should not pin the page forever.
      }

      if (!cancelled) {
        timeoutId = window.setTimeout(poll, 3000)
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [bookingId, paymentRef])

  return status
}

function InquiryPanel({ bookingId }: { bookingId: string }): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().confirmation
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.inquiryTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>{t.inquiryBody}</p>
        <p className="text-muted-foreground">
          {t.referenceLabel} <code>{bookingId}</code>
        </p>
      </CardContent>
    </Card>
  )
}

function HoldPanel({ bookingId }: { bookingId: string }): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().confirmation
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.holdTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          {t.bookingReference}: <code>{bookingId}</code>
        </p>
        <p className="text-muted-foreground">{t.holdBody}</p>
      </CardContent>
    </Card>
  )
}

function DefaultPanel({ bookingId }: { bookingId: string }): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().confirmation
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.defaultTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>
          {t.bookingReference}: <code>{bookingId}</code>
        </p>
        <p className="text-muted-foreground text-sm">{t.defaultBody}</p>
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">{label}</dt>
      <dd className="break-all font-medium">{value}</dd>
    </div>
  )
}

function BackLink(): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().confirmation
  return (
    <Link
      to="/shop"
      className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
    >
      {t.backToStorefront}
    </Link>
  )
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}
