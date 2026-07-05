import { createFileRoute, Link, useParams, useSearch } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { z } from "zod"

import { Container } from "@/components/storefront/site/primitives"
import { getApiUrl } from "@/lib/env"
import { useStorefrontMessagesOrDefault } from "@/lib/storefront-i18n"

/**
 * Post-checkout confirmation page for the storefront flow — restyled to
 * feel like a hotel confirmation (a prominent booking reference, a clear
 * status headline, and next steps) while keeping the exact polling
 * behaviour and i18n strings.
 *
 * Renders one of several panels keyed off `?kind=`:
 *   - `card_pending`  — processing the card payment
 *   - `bank_transfer` — proforma + IBAN/reference instructions
 *   - `inquiry`       — "we'll get back to you"
 *   - `hold`          — "we've placed a hold"
 *   - default         — generic confirmation
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
    <div className="bg-[var(--acme-paper)]">
      <Container className="py-16 sm:py-24">
        <div className="mx-auto max-w-2xl">
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
          <div className="mt-8 text-center">
            <BackLink />
          </div>
        </div>
      </Container>
    </div>
  )
}

/** Branded panel shell with an optional status accent + eyebrow. */
function Panel({
  eyebrow,
  title,
  confirmed = false,
  children,
}: {
  eyebrow?: string
  title: string
  confirmed?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="rounded-sm border border-[var(--acme-line-strong)] bg-[var(--acme-surface)] p-8 shadow-sm sm:p-10">
      {confirmed ? (
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--acme-accent-soft)] text-[var(--acme-accent-strong)] text-2xl">
          ✓
        </div>
      ) : null}
      {eyebrow ? <p className="acme-eyebrow">{eyebrow}</p> : null}
      <h1 className="acme-serif mt-3 text-balance text-3xl leading-tight sm:text-4xl">{title}</h1>
      <div className="mt-6 space-y-4 text-[var(--acme-ink-soft)] text-sm leading-relaxed">
        {children}
      </div>
    </div>
  )
}

/** Prominent booking-reference block. */
function ReferenceBlock({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-sm border border-[var(--acme-line)] bg-[var(--acme-paper)] px-5 py-4">
      <div className="text-[var(--acme-ink-faint)] text-xs uppercase tracking-[0.14em]">
        {label}
      </div>
      <div className="acme-serif mt-1 text-2xl tracking-wide">{value}</div>
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
    <Panel eyebrow="Almost there" title={t.bankTransferTitle}>
      <p>{t.bankTransferIntro}</p>
      {instructions ? (
        <dl className="space-y-2 rounded-sm border border-[var(--acme-line)] bg-[var(--acme-paper)] p-4">
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
        <p className="text-[var(--acme-ink-faint)]">{t.bankTransferEmailed}</p>
      )}
      <p className="text-[var(--acme-ink-faint)]">{t.bankTransferFollowUp}</p>
    </Panel>
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
      <Panel eyebrow="Payment" title={t.paymentNotCompletedTitle}>
        <ReferenceBlock label={t.bookingReference} value={status.bookingNumber || bookingId} />
        <p className="text-[var(--acme-ink-faint)]">{t.paymentNotCompletedBody}</p>
      </Panel>
    )
  }

  return (
    <Panel eyebrow="One moment" title={t.processingTitle}>
      <ReferenceBlock label={t.bookingReference} value={bookingId} />
      <p className="text-[var(--acme-ink-faint)]">{t.processingBody}</p>
    </Panel>
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
    <Panel eyebrow="Confirmed" title={t.confirmedTitle} confirmed>
      <ReferenceBlock label={t.bookingReference} value={status.bookingNumber || bookingId} />
      {status.session ? (
        <p>
          {t.paymentReceived}{" "}
          <strong className="text-[var(--acme-ink)]">
            {formatMoney(status.session.amountCents, status.session.currency)}
          </strong>
        </p>
      ) : null}
      <p className="text-[var(--acme-ink-faint)]">{t.confirmedFollowUp}</p>
    </Panel>
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
    <Panel eyebrow="Received" title={t.inquiryTitle} confirmed>
      <p>{t.inquiryBody}</p>
      <ReferenceBlock label={t.referenceLabel.replace(/:$/, "")} value={bookingId} />
    </Panel>
  )
}

function HoldPanel({ bookingId }: { bookingId: string }): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().confirmation
  return (
    <Panel eyebrow="On hold" title={t.holdTitle} confirmed>
      <ReferenceBlock label={t.bookingReference} value={bookingId} />
      <p className="text-[var(--acme-ink-faint)]">{t.holdBody}</p>
    </Panel>
  )
}

function DefaultPanel({ bookingId }: { bookingId: string }): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().confirmation
  return (
    <Panel eyebrow="Confirmed" title={t.defaultTitle} confirmed>
      <ReferenceBlock label={t.bookingReference} value={bookingId} />
      <p className="text-[var(--acme-ink-faint)]">{t.defaultBody}</p>
    </Panel>
  )
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--acme-ink-faint)] text-xs uppercase tracking-wide">{label}</dt>
      <dd className="break-all font-medium text-[var(--acme-ink)]">{value}</dd>
    </div>
  )
}

function BackLink(): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().confirmation
  return (
    <Link to="/shop" className="acme-btn acme-btn-ink">
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
