"use client"

/**
 * Front Desk → New reservation. A hotel-native, single-page progressive flow:
 * property (from the shell) → dates + party → availability grid (room type ×
 * rate plan with prices) → pick → guest details → summary → create. On success a
 * confirmation view surfaces the STAY- reservation number with follow-on actions.
 *
 * v1 books ONE room type per reservation (with a room quantity when `rooms > 1`);
 * no payment is collected here — the folio handles charges. The grid, pricing and
 * availability all come from the front-desk `/reservations/availability` route,
 * which reuses the owned-stay quote engine.
 */

import { useMutation } from "@tanstack/react-query"
import type { ReservationAvailability } from "@voyant-travel/pms-front-desk"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button, buttonVariants } from "@voyant-travel/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import { Separator } from "@voyant-travel/ui/components/separator"
import { Textarea } from "@voyant-travel/ui/components/textarea"
import { CalendarCheck, Check, Minus, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { IsoDateField } from "../admin-shared/iso-date-field"
import { formatMoney } from "../ari/calendar-grid-model"
import { createReservation, getReservationAvailability } from "./front-desk-client"
import { addDaysIso, todayIso } from "./front-desk-dates"
import { frontDeskMessages } from "./front-desk-messages"
import { FrontDeskPageShell } from "./front-desk-page-shell"
import {
  buildCreateBody,
  canSearch,
  emptyGuest,
  type GuestForm,
  isGuestValid,
  type NewReservationForm,
  type ReservationPick,
} from "./new-reservation-model"

const m = frontDeskMessages.newReservation

function defaultForm(): NewReservationForm {
  const checkIn = todayIso()
  return { checkIn, checkOut: addDaysIso(checkIn, 1), adults: 2, children: 0, rooms: 1 }
}

/** Small +/- stepper for the party fields. */
function Stepper({
  label,
  value,
  min,
  onChange,
}: {
  label: string
  value: number
  min: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`${label} -`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <Minus className="size-3.5" />
        </Button>
        <span className="w-8 text-center text-sm tabular-nums">{value}</span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`${label} +`}
          onClick={() => onChange(value + 1)}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

function AvailabilityGrid({
  availability,
  pick,
  onPick,
}: {
  availability: ReservationAvailability
  pick: ReservationPick | null
  onPick: (pick: ReservationPick) => void
}) {
  const rooms = availability.roomTypes
  const anyOffer = rooms.some((rt) => rt.ratePlans.length > 0)
  if (!anyOffer) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="text-sm font-medium">{m.noResults}</p>
        <p className="text-muted-foreground mt-1 text-sm">{m.noResultsHint}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {rooms.map((rt) => (
        <Card key={rt.roomTypeId}>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base">{rt.roomTypeName}</CardTitle>
            <div className="flex items-center gap-2">
              {rt.maxOccupancy != null ? (
                <Badge variant="outline">Sleeps {rt.maxOccupancy}</Badge>
              ) : null}
              {rt.available ? (
                <Badge variant="secondary">{m.remaining(rt.remaining)}</Badge>
              ) : (
                <Badge variant="destructive">{m.soldOut}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {rt.ratePlans.length === 0 ? (
              <p className="text-muted-foreground text-sm">{m.noRates}</p>
            ) : (
              <div className="flex flex-col divide-y">
                {rt.ratePlans.map((rp) => {
                  const isSelected =
                    pick?.roomTypeId === rt.roomTypeId && pick?.ratePlanId === rp.ratePlanId
                  const disabled = !rp.available
                  return (
                    <div
                      key={rp.ratePlanId}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{rp.ratePlanName}</div>
                        <div className="text-muted-foreground text-xs">
                          {m.perStay(availability.nights)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums">
                          {formatMoney(rp.totalAmountCents, rp.currency)}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant={isSelected ? "default" : "outline"}
                          disabled={disabled}
                          onClick={() =>
                            onPick({
                              roomTypeId: rt.roomTypeId,
                              roomTypeName: rt.roomTypeName,
                              ratePlanId: rp.ratePlanId,
                              ratePlanName: rp.ratePlanName,
                              totalAmountCents: rp.totalAmountCents,
                              currency: rp.currency,
                            })
                          }
                        >
                          {isSelected ? (
                            <>
                              <Check className="size-4" /> {m.selected}
                            </>
                          ) : (
                            m.select
                          )}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function GuestAndSummary({
  propertyId,
  form,
  pick,
  onCreated,
}: {
  propertyId: string
  form: NewReservationForm
  pick: ReservationPick
  onCreated: (result: { bookingId: string; bookingNumber: string | null }) => void
}) {
  const [guest, setGuest] = useState<GuestForm>(emptyGuest)
  const create = useMutation({
    mutationFn: () => createReservation(buildCreateBody(propertyId, form, pick, guest)),
    onSuccess: ({ data }) => onCreated(data),
    onError: (err) => toast.error(err instanceof Error ? err.message : m.createFailed),
  })

  const set = (patch: Partial<GuestForm>) => setGuest((g) => ({ ...g, ...patch }))

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.guestHeading}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">{m.firstName} *</Label>
            <Input
              value={guest.firstName}
              onChange={(e) => set({ firstName: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">{m.lastName} *</Label>
            <Input
              value={guest.lastName}
              onChange={(e) => set({ lastName: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">{m.email}</Label>
            <Input
              type="email"
              value={guest.email}
              onChange={(e) => set({ email: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">{m.phone}</Label>
            <Input
              value={guest.phone}
              onChange={(e) => set({ phone: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label className="text-sm">{m.notes}</Label>
            <Textarea
              value={guest.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder={m.notesPlaceholder}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">{m.summaryHeading}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <SummaryRow label={m.summaryRoom} value={pick.roomTypeName} />
          <SummaryRow label={m.summaryRatePlan} value={pick.ratePlanName} />
          <SummaryRow label={m.summaryDates} value={`${form.checkIn} → ${form.checkOut}`} />
          <SummaryRow
            label={m.summaryGuests}
            value={m.guestSummary(form.adults, form.children, form.rooms)}
          />
          <Separator className="my-1" />
          <div className="flex items-center justify-between">
            <span className="font-medium">{m.summaryTotal}</span>
            <span className="font-semibold tabular-nums">
              {formatMoney(pick.totalAmountCents * form.rooms, pick.currency)}
            </span>
          </div>
          <Button
            className="mt-2"
            disabled={!isGuestValid(guest) || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? m.creating : m.create}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

function SuccessView({
  bookingId,
  bookingNumber,
  onReset,
}: {
  bookingId: string
  bookingNumber: string | null
  onReset: () => void
}) {
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader className="items-center text-center">
        <div className="bg-emerald-500/15 mb-2 flex size-12 items-center justify-center rounded-full">
          <CalendarCheck className="size-6 text-emerald-600" />
        </div>
        <CardTitle>{m.createdTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <div className="text-center">
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            {m.createdRef}
          </div>
          <div className="font-mono text-lg font-semibold">{bookingNumber ?? bookingId}</div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <a href="/front-desk/tape-chart" className={buttonVariants({ variant: "default" })}>
            {m.assignUnit}
          </a>
          <a href={`/bookings/${bookingId}`} className={buttonVariants({ variant: "outline" })}>
            {m.viewReservation}
          </a>
          <Button variant="ghost" onClick={onReset}>
            {m.another}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function NewReservationFlow({ propertyId }: { propertyId: string }) {
  const [form, setForm] = useState<NewReservationForm>(defaultForm)
  const [availability, setAvailability] = useState<ReservationAvailability | null>(null)
  const [pick, setPick] = useState<ReservationPick | null>(null)
  const [created, setCreated] = useState<{
    bookingId: string
    bookingNumber: string | null
  } | null>(null)

  const search = useMutation({
    mutationFn: () =>
      getReservationAvailability({
        propertyId,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        adults: form.adults,
        children: form.children,
        rooms: form.rooms,
      }),
    onSuccess: ({ data }) => {
      setAvailability(data)
      setPick(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : m.createFailed),
  })

  const setField = (patch: Partial<NewReservationForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    // Any change invalidates the shown availability/selection.
    setAvailability(null)
    setPick(null)
  }

  if (created) {
    return (
      <SuccessView
        bookingId={created.bookingId}
        bookingNumber={created.bookingNumber}
        onReset={() => {
          setCreated(null)
          setAvailability(null)
          setPick(null)
          setForm(defaultForm())
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.stayHeading}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">{m.checkIn}</Label>
            <IsoDateField
              value={form.checkIn}
              min={todayIso()}
              onChange={(checkIn) => {
                if (!checkIn) return
                const checkOut = checkIn >= form.checkOut ? addDaysIso(checkIn, 1) : form.checkOut
                setField({ checkIn, checkOut })
              }}
              required
              className="w-44"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">{m.checkOut}</Label>
            <IsoDateField
              value={form.checkOut}
              min={addDaysIso(form.checkIn, 1)}
              onChange={(checkOut) => checkOut && setField({ checkOut })}
              required
              className="w-44"
            />
          </div>
          <Stepper
            label={m.adults}
            value={form.adults}
            min={1}
            onChange={(adults) => setField({ adults })}
          />
          <Stepper
            label={m.children}
            value={form.children}
            min={0}
            onChange={(children) => setField({ children })}
          />
          <Stepper
            label={m.rooms}
            value={form.rooms}
            min={1}
            onChange={(rooms) => setField({ rooms })}
          />
          <Button disabled={!canSearch(form) || search.isPending} onClick={() => search.mutate()}>
            {search.isPending ? m.searching : m.search}
          </Button>
        </CardContent>
      </Card>

      {availability ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{m.resultsHeading}</h2>
          <AvailabilityGrid availability={availability} pick={pick} onPick={setPick} />
        </div>
      ) : null}

      {pick ? (
        <GuestAndSummary propertyId={propertyId} form={form} pick={pick} onCreated={setCreated} />
      ) : null}
    </div>
  )
}

export function NewReservationPage() {
  return (
    <FrontDeskPageShell title={m.title}>
      {(propertyId) => <NewReservationFlow propertyId={propertyId} />}
    </FrontDeskPageShell>
  )
}
