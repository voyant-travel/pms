// agent-quality: file-size exception -- owner: operator; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import { useMutation } from "@tanstack/react-query"
import { formatMessage } from "@voyant-travel/i18n"
import type { Trip, TripComponent } from "@voyant-travel/trips"
import {
  addTripComponent,
  createTrip,
  defaultFetcher,
  getTrip,
  priceTrip,
  reserveTrip,
  startTripCheckout,
  type VoyantApiError,
} from "@voyant-travel/trips-react"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { Separator } from "@voyant-travel/ui/components/separator"
import { Textarea } from "@voyant-travel/ui/components/textarea"
import {
  BedDouble,
  CalendarClock,
  Check,
  CircleAlert,
  CreditCard,
  Landmark,
  Loader2,
  Plus,
  Route,
  Sparkles,
} from "lucide-react"
import { useMemo, useState } from "react"

import { useAdminMessages } from "@/lib/admin-i18n"
import { getApiUrl } from "@/lib/env"

type ComponentTemplate = "product" | "stay" | "transfer"
type CheckoutIntent = "card" | "bank_transfer" | "hold" | "inquiry"

type StorefrontComposerMessages = ReturnType<typeof useAdminMessages>["trips"]["storefrontComposer"]

interface ComposerTripState {
  trip: Trip | null
  message: string | null
  error: string | null
}

const currency = "EUR"
// i18n-literal-ok: fixture payload for the storefront composer demo.
// These names + emails are sent as request bodies (and surface back in the
// trip's billing record), not rendered as operator-facing UI text.
const referenceTravelerParty = {
  // i18n-literal-ok
  billing: {
    // i18n-literal-ok
    buyerType: "B2C",
    // i18n-literal-ok
    contact: {
      // i18n-literal-ok
      firstName: "Mira",
      // i18n-literal-ok
      lastName: "Ionescu",
      // i18n-literal-ok
      email: "mira.ionescu@pixelmakers.com",
    },
    address: {},
  },
  travelers: [
    {
      localId: "traveler_1",
      // i18n-literal-ok
      firstName: "Mira",
      // i18n-literal-ok
      lastName: "Ionescu",
      // i18n-literal-ok
      email: "mira.ionescu@pixelmakers.com",
      role: "lead",
    },
  ],
}

export function StorefrontComposerBlock(): React.ReactElement {
  const t = useAdminMessages().trips.storefrontComposer
  const [state, setState] = useState<ComposerTripState>({
    trip: null,
    message: null,
    error: null,
  })
  const [template, setTemplate] = useState<ComponentTemplate>("product")
  const [componentTitle, setComponentTitle] = useState("Bucharest to Istanbul")
  const [entityId, setEntityId] = useState("")
  const [sourceKind, setSourceKind] = useState("owned")
  const [manualAmount, setManualAmount] = useState("95")
  const [notes, setNotes] = useState("5 days, 2 travelers")
  const [checkoutIntent, setCheckoutIntent] = useState<CheckoutIntent>("card")

  const client = useMemo(
    () => ({
      baseUrl: getApiUrl(),
      fetcher: defaultFetcher,
      surface: "public" as const,
    }),
    [],
  )
  const envelopeId = state.trip?.envelope.id

  const createMutation = useMutation({
    mutationFn: () =>
      createTrip(client, {
        // i18n-literal-ok: trip title persisted on the envelope, not user-displayed here.
        title: "Composed trip",
        description: notes,
        travelerParty: referenceTravelerParty,
        constraints: { channel: "storefront-reference" },
      }),
    onSuccess: (trip) => setState({ trip, message: t.statusMessages.tripCreated, error: null }),
    onError: (error) => setState((current) => ({ ...current, error: apiError(error, t) })),
  })

  const addMutation = useMutation({
    mutationFn: async () => {
      const trip =
        state.trip ??
        (await createTrip(client, {
          // i18n-literal-ok
          title: "Composed trip",
          travelerParty: referenceTravelerParty,
          constraints: { channel: "storefront-reference" },
        }))
      const component = await addTripComponent(client, trip.envelope.id, componentInput())
      const refreshed = await getTrip(client, trip.envelope.id)
      return { component, trip: refreshed }
    },
    onSuccess: ({ trip }) =>
      setState({ trip, message: t.statusMessages.componentAdded, error: null }),
    onError: (error) => setState((current) => ({ ...current, error: apiError(error, t) })),
  })

  const priceMutation = useMutation({
    mutationFn: async () => {
      if (!envelopeId) throw new Error(t.errors.createTripFirst)
      return priceTrip(client, envelopeId, {
        scope: { locale: "en-GB", audience: "customer", market: "default", currency },
      })
    },
    onSuccess: (result) =>
      setState({
        trip: { envelope: result.envelope, components: result.components },
        message: t.statusMessages.tripPriced,
        error: result.failures.length > 0 ? result.failures.map((f) => f.reason).join(", ") : null,
      }),
    onError: (error) => setState((current) => ({ ...current, error: apiError(error, t) })),
  })

  const reserveMutation = useMutation({
    mutationFn: async () => {
      if (!envelopeId) throw new Error(t.errors.priceTripFirst)
      return reserveTrip(client, envelopeId, {
        idempotencyKey: `reserve-${envelopeId}`,
      })
    },
    onSuccess: (result) =>
      setState({
        trip: { envelope: result.envelope, components: result.components },
        message: t.statusMessages.tripReserved,
        error: result.failures.length > 0 ? result.failures.map((f) => f.reason).join(", ") : null,
      }),
    onError: (error) => setState((current) => ({ ...current, error: apiError(error, t) })),
  })

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!envelopeId) throw new Error(t.errors.reserveTripFirst)
      return startTripCheckout(client, envelopeId, {
        intent: checkoutIntent,
        idempotencyKey: `checkout-${envelopeId}-${checkoutIntent}`,
        request: {
          returnOrigin: window.location.origin,
        },
      })
    },
    onSuccess: (result) => {
      setState({
        trip: { envelope: result.envelope, components: result.components },
        message: handoffMessage(result.target.checkoutUrl, result.target.paymentSessionId, t),
        error: result.failures.length > 0 ? result.failures.map((f) => f.reason).join(", ") : null,
      })
      if (result.target.checkoutUrl) {
        window.location.assign(result.target.checkoutUrl)
      }
    },
    onError: (error) => setState((current) => ({ ...current, error: apiError(error, t) })),
  })

  const trip = state.trip
  const components = trip?.components ?? []
  const aggregate = trip?.envelope.aggregatePricingSnapshot
  const isBusy =
    createMutation.isPending ||
    addMutation.isPending ||
    priceMutation.isPending ||
    reserveMutation.isPending ||
    checkoutMutation.isPending

  function componentInput() {
    const amountCents = Math.max(0, Math.round(Number.parseFloat(manualAmount || "0") * 100))
    if (template === "transfer") {
      return {
        kind: "manual_placeholder" as const,
        // i18n-literal-ok: persisted as the booking component's description.
        description: "Staff-confirmed ground transfer",
        estimatedPricing: {
          currency,
          subtotalAmountCents: amountCents,
          taxAmountCents: 0,
          totalAmountCents: amountCents,
        },
        metadata: { manualService: { name: componentTitle || "Transfer" }, template: "manual" },
      }
    }

    return {
      kind: "catalog_booking" as const,
      // i18n-literal-ok
      description: template === "stay" ? "Catalog-backed stay component" : "Catalog-backed tour",
      catalogRef: {
        entityModule: template === "stay" ? "accommodations" : "products",
        entityId,
        sourceKind: sourceKind || "owned",
      },
      metadata: {
        bookingDraftV1: {
          entity: {
            module: template === "stay" ? "accommodations" : "products",
            id: entityId,
            sourceKind: sourceKind || "owned",
          },
          configure:
            template === "stay"
              ? {
                  pax: { adult: 2 },
                  dateRange: { checkIn: "2026-06-05", checkOut: "2026-06-08" },
                }
              : { pax: { adult: 2 } },
          billing: {
            buyerType: "B2C",
            contact: {
              // i18n-literal-ok
              firstName: "Mira",
              // i18n-literal-ok
              lastName: "Ionescu",
              // i18n-literal-ok
              email: "mira.ionescu@pixelmakers.com",
            },
            address: {},
          },
          travelers: referenceTravelerParty.travelers,
          payment: { intent: checkoutIntent },
        },
      },
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Route className="size-6 text-primary" aria-hidden="true" />
            <h1 className="font-semibold text-3xl tracking-tight">{t.heading}</h1>
          </div>
          <p className="max-w-2xl text-muted-foreground">{t.subheading}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => createMutation.mutate()} disabled={isBusy || Boolean(trip)}>
            {createMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
            {t.actions.newTrip}
          </Button>
          <Button
            variant="outline"
            onClick={() => priceMutation.mutate()}
            disabled={isBusy || components.length === 0}
          >
            <CalendarClock className="size-4" aria-hidden="true" />
            {t.actions.price}
          </Button>
          <Button
            variant="outline"
            onClick={() => reserveMutation.mutate()}
            disabled={isBusy || trip?.envelope.status !== "priced"}
          >
            <Check className="size-4" aria-hidden="true" />
            {t.actions.reserve}
          </Button>
          <Button
            onClick={() => checkoutMutation.mutate()}
            disabled={isBusy || trip?.envelope.status !== "reserved"}
          >
            <CreditCard className="size-4" aria-hidden="true" />
            {t.actions.checkout}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-4">
          <ComposerForm
            template={template}
            setTemplate={setTemplate}
            componentTitle={componentTitle}
            setComponentTitle={setComponentTitle}
            entityId={entityId}
            setEntityId={setEntityId}
            sourceKind={sourceKind}
            setSourceKind={setSourceKind}
            manualAmount={manualAmount}
            setManualAmount={setManualAmount}
            notes={notes}
            setNotes={setNotes}
            checkoutIntent={checkoutIntent}
            setCheckoutIntent={setCheckoutIntent}
            onAdd={() => addMutation.mutate()}
            addDisabled={isBusy || (template !== "transfer" && !entityId)}
            addPending={addMutation.isPending}
            messages={t}
          />

          <div className="space-y-3">
            {components.length === 0 ? (
              <EmptyTimeline messages={t} />
            ) : (
              components.map((component, index) => (
                <ComponentCard
                  key={component.id}
                  component={component}
                  index={index}
                  messages={t}
                />
              ))
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.summary.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <SummaryCell
                  label={t.summary.status}
                  value={trip?.envelope.status ?? t.summary.notStarted}
                />
                <SummaryCell label={t.summary.items} value={String(components.length)} />
                <SummaryCell
                  label={t.summary.subtotal}
                  value={formatMoney(aggregate?.subtotalAmountCents, aggregate?.currency)}
                />
                <SummaryCell
                  label={t.summary.tax}
                  value={formatMoney(aggregate?.taxAmountCents, aggregate?.currency)}
                />
              </div>
              <Separator />
              <div className="flex items-end justify-between gap-3">
                <span className="text-muted-foreground text-sm">{t.summary.total}</span>
                <span className="font-semibold text-2xl">
                  {formatMoney(aggregate?.totalAmountCents, aggregate?.currency)}
                </span>
              </div>
              {state.message ? (
                <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-emerald-700 text-sm dark:text-emerald-300">
                  {state.message}
                </p>
              ) : null}
              {state.error ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                  {state.error}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function ComposerForm({
  template,
  setTemplate,
  componentTitle,
  setComponentTitle,
  entityId,
  setEntityId,
  sourceKind,
  setSourceKind,
  manualAmount,
  setManualAmount,
  notes,
  setNotes,
  checkoutIntent,
  setCheckoutIntent,
  onAdd,
  addDisabled,
  addPending,
  messages,
}: {
  template: ComponentTemplate
  setTemplate(value: ComponentTemplate): void
  componentTitle: string
  setComponentTitle(value: string): void
  entityId: string
  setEntityId(value: string): void
  sourceKind: string
  setSourceKind(value: string): void
  manualAmount: string
  setManualAmount(value: string): void
  notes: string
  setNotes(value: string): void
  checkoutIntent: CheckoutIntent
  setCheckoutIntent(value: CheckoutIntent): void
  onAdd(): void
  addDisabled: boolean
  addPending: boolean
  messages: StorefrontComposerMessages
}): React.ReactElement {
  const f = messages.composerForm
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{f.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>{f.typeLabel}</Label>
            <Select value={template} onValueChange={(value) => setTemplate(value as never)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product">{f.typeProduct}</SelectItem>
                <SelectItem value="stay">{f.typeStay}</SelectItem>
                <SelectItem value="transfer">{f.typeTransfer}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>{f.titleLabel}</Label>
            <Input
              value={componentTitle}
              onChange={(event) => setComponentTitle(event.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {template === "transfer" ? (
            <div className="space-y-2">
              <Label>{f.amountLabel}</Label>
              <Input
                inputMode="decimal"
                value={manualAmount}
                onChange={(event) => setManualAmount(event.target.value)}
              />
            </div>
          ) : (
            <>
              <div className="space-y-2 md:col-span-2">
                <Label>{f.catalogIdLabel}</Label>
                <Input value={entityId} onChange={(event) => setEntityId(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{f.sourceLabel}</Label>
                <Input value={sourceKind} onChange={(event) => setSourceKind(event.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label>{f.paymentLabel}</Label>
            <Select
              value={checkoutIntent}
              onValueChange={(value) => setCheckoutIntent(value as never)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="card">{f.paymentCard}</SelectItem>
                <SelectItem value="bank_transfer">{f.paymentBankTransfer}</SelectItem>
                <SelectItem value="hold">{f.paymentHold}</SelectItem>
                <SelectItem value="inquiry">{f.paymentInquiry}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{f.tripNotesLabel}</Label>
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>

        <Button onClick={onAdd} disabled={addDisabled}>
          {addPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="size-4" aria-hidden="true" />
          )}
          {f.addToTrip}
        </Button>
      </CardContent>
    </Card>
  )
}

function EmptyTimeline({ messages }: { messages: StorefrontComposerMessages }): React.ReactElement {
  return (
    <div className="rounded-lg border border-dashed px-6 py-12 text-center">
      <Route className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden="true" />
      <p className="font-medium">{messages.emptyTimeline}</p>
    </div>
  )
}

function ComponentCard({
  component,
  index,
  messages,
}: {
  component: TripComponent
  index: number
  messages: StorefrontComposerMessages
}): React.ReactElement {
  const Icon =
    component.kind === "manual_placeholder"
      ? Landmark
      : component.entityModule === "accommodations"
        ? BedDouble
        : Route
  return (
    <Card>
      <CardContent className="grid gap-4 p-4 md:grid-cols-[48px_minmax(0,1fr)_auto] md:items-center">
        <div className="flex size-12 items-center justify-center rounded-md bg-muted">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{componentDisplayName(component, index, messages)}</span>
            <Badge variant={component.status === "failed" ? "destructive" : "secondary"}>
              {component.status}
            </Badge>
          </div>
          <p className="truncate text-muted-foreground text-sm">
            {component.entityModule
              ? `${component.entityModule} · ${component.entityId}`
              : (component.description ?? component.kind)}
          </p>
          {component.warningCodes.length > 0 ? (
            <p className="flex items-center gap-1 text-amber-600 text-xs">
              <CircleAlert className="size-3" aria-hidden="true" />
              {component.warningCodes.join(", ")}
            </p>
          ) : null}
        </div>
        <div className="text-left md:text-right">
          <p className="font-semibold">
            {formatMoney(component.componentTotalAmountCents, component.componentCurrency)}
          </p>
          <p className="text-muted-foreground text-xs">
            {formatMessage(messages.componentTaxLine, {
              amount: formatMoney(component.componentTaxAmountCents, component.componentCurrency),
            })}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function componentDisplayName(
  component: TripComponent,
  index: number,
  messages: StorefrontComposerMessages,
): string {
  const metadata = component.metadata as
    | {
        manualService?: { name?: string | null }
        flightDraft?: { origin?: string | null; destination?: string | null }
      }
    | undefined
  const manualName = metadata?.manualService?.name?.trim()
  if (manualName) return manualName
  const origin = metadata?.flightDraft?.origin?.trim()
  const destination = metadata?.flightDraft?.destination?.trim()
  if (origin && destination) return `${origin} → ${destination}`
  if (component.entityId) return component.entityId
  return formatMessage(messages.componentFallback, { index: index + 1 })
}

function SummaryCell({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}

function handoffMessage(
  checkoutUrl: string | null,
  paymentSessionId: string | null,
  messages: StorefrontComposerMessages,
): string {
  if (checkoutUrl) return messages.statusMessages.redirecting
  if (paymentSessionId) return messages.statusMessages.paymentSessionStarted
  return messages.statusMessages.checkoutHandoff
}

function apiError(error: unknown, messages: StorefrontComposerMessages): string {
  const candidate = error as Partial<VoyantApiError>
  if (typeof candidate.message === "string") return candidate.message
  return error instanceof Error ? error.message : messages.errors.requestFailed
}

function formatMoney(
  amountCents: number | null | undefined,
  currencyCode: string | null | undefined,
) {
  if (amountCents == null) return "-"
  return (amountCents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: currencyCode ?? currency,
  })
}
