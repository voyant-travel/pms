import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import {
  type LookupFormErrors,
  validateLookupForm,
} from "@/components/storefront/booking/booking-view-model"
import { ManageBookingView } from "@/components/storefront/booking/manage-booking-view"
import { StorefrontDocument } from "@/components/storefront/site/primitives"
import { getApiUrl } from "@/lib/env"
import { useStorefrontMessagesOrDefault } from "@/lib/storefront-i18n"

/**
 * Find-my-booking / manage entry point.
 *
 * A guest enters their booking reference + email; we POST them to the
 * upstream, rate-limited `/v1/public/bookings/guest-lookup` (which validates
 * the email against a traveler on the booking and resolves the opaque
 * bookingId). On success we render the manage view keyed by that bookingId +
 * the verified email — never by a client-guessable value. No account, no
 * password: the reference + email pair IS the credential, matching a mature
 * hotel's "find my reservation" flow.
 */
export const Route = createFileRoute("/(storefront)/shop_/booking")({
  component: ShopBookingRouteComponent,
})

interface GuestLookupResponse {
  data?: { overview?: { bookingId?: string } }
}

type Phase = "form" | "loading" | "found"

function ShopBookingRouteComponent(): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().manageBooking
  const [bookingReference, setBookingReference] = useState("")
  const [email, setEmail] = useState("")
  const [errors, setErrors] = useState<LookupFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>("form")
  const [found, setFound] = useState<{ bookingId: string; email: string } | null>(null)

  function errorText(kind: string | undefined): string | undefined {
    if (!kind) return undefined
    if (kind === "required") return undefined
    if (kind === "invalid") return t.emailInvalid
    return undefined
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setFormError(null)
    const result = validateLookupForm({ bookingReference, email })
    if (!result.ok || !result.normalized) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    setPhase("loading")
    try {
      const res = await fetch(`${getApiUrl()}/v1/public/bookings/guest-lookup`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result.normalized),
      })
      if (res.status === 404 || res.status === 400) {
        setFormError(t.notFound)
        setPhase("form")
        return
      }
      if (res.status === 429) {
        setFormError(t.lookupError)
        setPhase("form")
        return
      }
      if (!res.ok) {
        setFormError(t.lookupError)
        setPhase("form")
        return
      }
      const json = (await res.json()) as GuestLookupResponse
      const bookingId = json.data?.overview?.bookingId
      if (!bookingId) {
        setFormError(t.notFound)
        setPhase("form")
        return
      }
      setFound({ bookingId, email: result.normalized.email })
      setPhase("found")
    } catch {
      setFormError(t.lookupError)
      setPhase("form")
    }
  }

  function reset(): void {
    setFound(null)
    setPhase("form")
    setFormError(null)
  }

  if (phase === "found" && found) {
    return (
      <StorefrontDocument>
        <ManageBookingView bookingId={found.bookingId} email={found.email} onReset={reset} />
      </StorefrontDocument>
    )
  }

  return (
    <StorefrontDocument>
      <div className="mx-auto max-w-lg">
        <p className="acme-eyebrow">{t.eyebrow}</p>
        <h1 className="acme-serif mt-3 text-3xl leading-tight sm:text-4xl">{t.findTitle}</h1>
        <p className="mt-3 text-[var(--acme-ink-soft)] text-sm leading-relaxed">{t.findIntro}</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
          <div>
            <label htmlFor="booking-ref" className="acme-field-label">
              {t.referenceLabel}
            </label>
            <input
              id="booking-ref"
              type="text"
              value={bookingReference}
              onChange={(e) => setBookingReference(e.target.value)}
              placeholder={t.referencePlaceholder}
              autoComplete="off"
              className="acme-input mt-1 w-full"
              aria-invalid={Boolean(errors.bookingReference)}
            />
            {errors.bookingReference ? (
              <p className="mt-1 text-[#a4442f] text-xs">{t.referenceRequired}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="booking-email" className="acme-field-label">
              {t.emailLabel}
            </label>
            <input
              id="booking-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.emailPlaceholder}
              autoComplete="email"
              className="acme-input mt-1 w-full"
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email ? (
              <p className="mt-1 text-[#a4442f] text-xs">
                {errorText(errors.email) ?? t.emailRequired}
              </p>
            ) : null}
          </div>

          {formError ? (
            <div className="rounded-sm border border-[#e3c7bd] bg-[#f7ece8] px-4 py-3 text-[#8a3a28] text-sm">
              {formError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={phase === "loading"}
            className="acme-btn acme-btn-primary w-full"
          >
            {phase === "loading" ? t.lookingUp : t.lookupCta}
          </button>
        </form>
      </div>
    </StorefrontDocument>
  )
}
