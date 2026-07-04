// agent-quality: file-size exception -- owner: operator; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
/**
 * Default mapping from a `BookingDraftV1` (+ live quote pricing +
 * resolved entity summary + operator / acceptance context) to the
 * variable bag the operator's contract templates render against.
 *
 * The variable surface is designed around Voyant's domain model:
 *
 *   - sell vs cost money split (`sellAmountCents`, `sellCurrency`,
 *     `costAmountCents`, `costCurrency`, `baseCurrency`)
 *   - vertical-aware schedule blocks — `departureSlot` for products,
 *     `sailing` for cruises, `stay` for accommodations
 *   - pax-bands as a record (Voyant doesn't lock you into adult /
 *     child / infant — descriptors can declare any band code)
 *   - sourced vs owned booking arms (`booking.source.kind`,
 *     `booking.source.supplier`)
 *   - CRM customer + lead traveler split, kept distinct because the
 *     buyer + the lead passenger are often different people
 *
 * Naming is camelCase by default. A handful of snake_case aliases
 * are emitted for keys the seeded `customer-sales-agreement`
 * template references (`contract.date`, `booking.startDate`,
 * `travelers[].participantType` …) so authored templates render
 * out-of-the-box.
 *
 * Notes on what is + isn't filled at preview time:
 *
 *   - The booking row has not been created yet — `booking.bookingId`,
 *     `booking.bookingNumber`, the persisted status, and
 *     `contract.contractNumber` / `contract.signedAt` are empty. The
 *     server-side auto-generate-contract subscriber re-renders the
 *     same template on `booking.confirmed` with the persisted values
 *     filled in.
 *   - `acceptance.ipAddress` / `userAgent` are captured server-side
 *     at `/checkout/start` from request headers. Empty during preview.
 *   - `operator.*` reads from the `operatorInfo` block injected by the
 *     storefront wrapper (fetched from `/v1/public/operator-profile`).
 *     Anything not configured renders as the empty string.
 *   - Vertical-specific blocks (`sailing`, `stay`, `departureSlot`)
 *     are populated only when `entitySummary` carries enough context.
 */

import type { BookingEntitySummary } from "@voyant-travel/bookings-react/journey"
import type { BookingDraftV1, PricingBreakdownV1 } from "@voyant-travel/catalog/booking-engine"
import type {
  ComputedScheduleEntry,
  PaymentPolicySource,
} from "@voyant-travel/finance/payment-policy"

export interface OperatorInfoVariables {
  /** Trading name shown to customers. */
  name?: string
  /** Legal company name when different from `name`. */
  legalName?: string
  /** Tax / VAT id. */
  vatId?: string
  /** Trade register number (RO: J-number; UK: company number; …). */
  registrationNumber?: string
  /** Postal address — single string or markdown for the contract block. */
  address?: string
  phone?: string
  email?: string
  website?: string
  iban?: string
  bank?: string
  /** License number — tour-operator license, hotel rating registry,
   *  cruise flag-state number, depending on what the operator is. */
  license?: string
  /** Issuing authority for the license. */
  licenseAuthority?: string
  /** Human whose name appears on the operator-side signature line. */
  signatoryName?: string
  /** Their role / title (e.g. "Managing Director"). */
  signatoryRole?: string
}

export interface AcceptanceContextVariables {
  ipAddress?: string
  userAgent?: string
  acceptedAt?: string
  marketingConsent?: boolean
  templateSlug?: string
  templateId?: string
}

interface ResolveContractVariablesContext {
  entityModule: string
  entityId: string
  entitySummary?: BookingEntitySummary
  pricing?: PricingBreakdownV1 | null
  /** Operator profile — fetched from `/v1/public/operator-profile` by
   *  the storefront wrapper. Anything missing renders as empty. */
  operatorInfo?: OperatorInfoVariables
  /** Acceptance fingerprint — populated only on server-side renders
   *  (post-confirm contract auto-generation). At preview time the
   *  storefront leaves this undefined and the variables render
   *  empty. */
  acceptance?: AcceptanceContextVariables
  /** Pre-computed schedule from `computePaymentSchedule()`. The
   *  storefront wrapper computes this in real time as the customer
   *  picks their date so the contract preview shows live deposit
   *  / balance numbers. */
  paymentSchedule?: ComputedScheduleEntry[] | null
  /** Which layer of the cascade the active policy came from. Used
   *  for traceability in contract templates. */
  paymentPolicySource?: PaymentPolicySource
}

export function resolveContractVariables(
  draft: BookingDraftV1,
  ctx: ResolveContractVariablesContext,
): Record<string, unknown> {
  const billing = draft.billing
  const contact = billing.contact
  const address = billing.address
  const summary = ctx.entitySummary
  const pricing = ctx.pricing ?? null
  const operatorInfo = ctx.operatorInfo ?? {}
  const acceptance = ctx.acceptance ?? {}

  const travelers = draft.travelers.map((t, i) => {
    const fullName = [t.firstName, t.lastName].filter(Boolean).join(" ").trim()
    const docs = t.documents ?? {}
    return {
      index: i + 1,
      band: t.band,
      // The seeded template branches on `participantType != "traveler"`.
      // We map adult → traveler, everything else passes through.
      participantType: t.band === "adult" ? "traveler" : t.band,
      isLead: i === 0,
      firstName: t.firstName,
      lastName: t.lastName,
      fullName,
      email: t.email ?? "",
      phone: t.phone ?? "",
      dateOfBirth: t.dateOfBirth ?? "",
      document: {
        type: stringFromDoc(docs, "documentType"),
        number: stringFromDoc(docs, "documentNumber"),
        country: stringFromDoc(docs, "documentCountry"),
        issuingAuthority: stringFromDoc(docs, "issuingAuthority"),
        issueDate: stringFromDoc(docs, "issueDate"),
        expiryDate: stringFromDoc(docs, "documentExpiry"),
      },
    }
  })

  const paxBands = draft.configure?.pax ?? {}
  const paxTotal = Object.values(paxBands).reduce((acc, count) => acc + (count ?? 0), 0)

  // Prefer raw ISO from entitySummary (set by the detail page from
  // departures[].starts_at / sailings[].start_date / search.checkIn)
  // over the slot id we keep in the draft.
  const startDate =
    summary?.startDate ??
    draft.configure?.dateRange?.checkIn ??
    draft.configure?.departureDate ??
    ""
  const endDate =
    summary?.endDate ?? draft.configure?.dateRange?.checkOut ?? draft.configure?.departureDate ?? ""
  const durationNights = computeNights(startDate, endDate)

  const customerFullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim()
  const leadTraveler =
    contact.firstName || contact.lastName
      ? {
          firstName: contact.firstName,
          lastName: contact.lastName,
          fullName: customerFullName,
          email: contact.email ?? "",
          phone: contact.phone ?? "",
        }
      : null

  // Quote line items map to the contract's `items[]` collection.
  const items = (pricing?.lines ?? []).map((line, idx) => ({
    index: idx + 1,
    kind: line.kind,
    description: line.label ?? line.kind ?? "",
    quantity: line.quantity ?? 1,
    unitAmountCents: line.unitAmount,
    totalAmountCents: line.totalAmount,
    taxIncluded: line.taxIncluded ?? false,
    currency: pricing?.currency ?? "",
  }))

  const addons = items.filter((i) => i.kind === "addon" || i.kind === "supplement")

  const totalCents = pricing?.total ?? 0
  const subtotalCents = pricing?.subtotal ?? 0
  const taxTotalCents = pricing?.taxTotal ?? 0
  const sellCurrency = pricing?.currency ?? ""

  const accommodationRooms = (draft.accommodation?.rooms ?? []).map((r) => ({
    optionUnitId: r.optionUnitId,
    quantity: r.quantity,
    ratePlanId: r.ratePlanId ?? "",
  }))

  const vertical = summary?.vertical ?? ctx.entityModule
  const vehiclesAndStay = buildVerticalBlocks({
    vertical,
    summary,
    draft,
    accommodationRooms,
    durationNights,
    startDate,
    endDate,
  })

  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const todayIsoDateTime = today.toISOString()
  const todayTime = today.toISOString().slice(11, 19)

  // Map the precomputed schedule into the deposit / balance / full
  // shapes contract templates read. `"full"` collapses to the
  // balance-row slot (it's the single payment due in that scenario).
  const schedule = ctx.paymentSchedule ?? []
  const depositRow = schedule.find((r) => r.scheduleType === "deposit")
  const balanceRow =
    schedule.find((r) => r.scheduleType === "balance") ??
    schedule.find((r) => r.scheduleType === "full")

  return {
    // ───────── Top-level clocks ─────────
    today: todayIso,
    currentDate: todayIso,
    currentDateTime: todayIsoDateTime,
    currentTime: todayTime,

    // ───────── Contract metadata ─────────
    contract: {
      contractNumber: "",
      number: "",
      contractDate: todayIso,
      // snake-cased alias used by the seeded customer-sales-agreement
      // template (`{{ contract.date | format_date: "long" }}`)
      date: todayIso,
      signedAt: acceptance.acceptedAt ?? "",
      isManual: false,
      series: "",
      channel: "storefront",
      source: "self_service",
    },

    // ───────── Booking ─────────
    booking: {
      // Identity (filled in once the booking row exists; empty at preview)
      bookingId: "",
      bookingNumber: "",
      // alias used by templates that read `{{ booking.number }}`
      number: "",
      status: "draft",

      // Entity context
      entityModule: ctx.entityModule,
      entityId: ctx.entityId,
      vertical,
      productName: summary?.name ?? ctx.entityId,
      productSubtitle: summary?.subtitle ?? "",
      destination: summary?.destination ?? summary?.locationLabel ?? "",
      whenLabel: summary?.whenLabel ?? "",
      locationLabel: summary?.locationLabel ?? "",

      // Pax — bands map keeps Voyant's flexible band model intact
      pax: paxTotal,
      paxTotal,
      paxBands,
      paxAdult: paxBands.adult ?? 0,
      paxChild: paxBands.child ?? 0,
      paxInfant: paxBands.infant ?? 0,

      // Configure (raw inputs for verticals that need slot ids)
      departureSlotId: draft.configure?.departureSlotId ?? "",
      cabinCategoryId: draft.configure?.cabinCategoryId ?? "",
      cabinNumberId: draft.configure?.cabinNumberId ?? "",
      airArrangement: draft.configure?.airArrangement ?? "",

      // Trip dates (vertical-agnostic) — primary names + the
      // snake_case aliases the seeded template references
      travelDates: {
        start: startDate,
        end: endDate,
        durationNights,
      },
      startDate,
      endDate,
      checkIn: draft.configure?.dateRange?.checkIn ?? "",
      checkOut: draft.configure?.dateRange?.checkOut ?? "",
      departureDate: draft.configure?.departureDate ?? "",

      // Money (Voyant's sell vs cost split)
      sellCurrency,
      sellAmountCents: totalCents,
      sellSubtotalCents: subtotalCents,
      sellTaxAmountCents: taxTotalCents,
      sellDiscountAmountCents: 0,
      // Cost-side fields are operator-private and only emitted by
      // server-side renders that pass them in via context. Empty
      // during the customer-facing preview by design.
      costCurrency: "",
      costAmountCents: 0,
      baseCurrency: "",

      // Common alias shapes used by templates we ship with the
      // operator starter
      currency: sellCurrency,
      totalAmountCents: totalCents,
      subtotalAmountCents: subtotalCents,
      taxAmountCents: taxTotalCents,
      discountAmountCents: 0,

      // Settlement state — empty at preview, post-confirm renders
      // can fill these from the booking + payments table
      paidAmountCents: 0,
      balanceDueCents: totalCents,

      // Payment-schedule-derived deposit / balance. The storefront
      // wrapper runs `computePaymentSchedule()` against the
      // operator's policy + the draft's pricing/dates and passes
      // the result via `paymentSchedule`, so the contract preview
      // shows the same numbers the post-confirm schedule will
      // generate (modulo per-layer overrides applied later).
      depositAmountCents: depositRow?.amountCents ?? 0,
      depositDueDate: depositRow?.dueDate ?? "",
      balanceAmountCents: balanceRow?.amountCents ?? 0,
      balanceDueDate: balanceRow?.dueDate ?? "",
      paymentPolicy: {
        source: ctx.paymentPolicySource ?? "operator_default",
      },

      // Best-effort accommodation summary. Server-side resolver
      // overrides with the persisted booking_items rows.
      roomsSummary: buildRoomsSummary(draft),

      // Source provenance — populated post-book on owned arm; the
      // sourced arm overrides this from the snapshot
      source: {
        kind: "owned",
        connectionId: "",
        ref: "",
        supplier: {
          id: "",
          name: "",
        },
      },

      // Notes
      internalNotes: draft.internalNotes ?? "",
      customerNotes: draft.customerNotes ?? "",
    },

    // ───────── Customer / Buyer ─────────
    customer: {
      type: billing.buyerType,
      firstName: contact.firstName,
      lastName: contact.lastName,
      fullName: customerFullName,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      dateOfBirth: travelers[0]?.dateOfBirth ?? "",
      companyName: billing.company?.name ?? "",
      vatId: billing.company?.vatId ?? "",
      registrationNumber: billing.company?.registrationNumber ?? "",
      address: {
        line1: address.line1 ?? "",
        line2: address.line2 ?? "",
        city: address.city ?? "",
        postal: address.postal ?? "",
        country: address.country ?? "",
      },
      // Lead traveler's identity document, used as the buyer's
      // identity doc for B2C flows
      document: travelers[0]?.document ?? {
        type: "",
        number: "",
        country: "",
        issuingAuthority: "",
        issueDate: "",
        expiryDate: "",
      },
    },

    // ───────── Lead traveler ─────────
    leadTraveler,

    // ───────── Travelers ─────────
    travelers,
    // `passengers` is a common alias used by templates ported from
    // other systems
    passengers: travelers,

    // ───────── Pricing line items ─────────
    items,
    addons,

    // ───────── Product (subject of the booking) ─────────
    product: {
      title: summary?.name ?? "",
      subtitle: summary?.subtitle ?? "",
      destination: summary?.destination ?? summary?.locationLabel ?? "",
      module: ctx.entityModule,
      id: ctx.entityId,
      vertical,
      heroImageUrl: summary?.heroImageUrl ?? "",
    },

    // ───────── Vertical-specific schedule blocks ─────────
    ...vehiclesAndStay,

    // ───────── Payment ─────────
    payment: {
      intent: draft.payment.intent,
      method: paymentMethodLabel(draft.payment.intent),
      amountCents: totalCents,
      currency: sellCurrency,
      schedule: schedule.map((row, idx) => ({
        index: idx + 1,
        type: row.scheduleType,
        amountCents: row.amountCents,
        currency: row.currency,
        dueDate: row.dueDate,
        status: "pending",
      })),
      capturedAt: "",
      // Alias used by templates that prefer `payment.created_at`-style naming.
      createdAt: "",
    },

    // ───────── Operator ─────────
    operator: {
      name: operatorInfo.name ?? "",
      legalName: operatorInfo.legalName ?? operatorInfo.name ?? "",
      vatId: operatorInfo.vatId ?? "",
      registrationNumber: operatorInfo.registrationNumber ?? "",
      address: operatorInfo.address ?? "",
      phone: operatorInfo.phone ?? "",
      email: operatorInfo.email ?? "",
      website: operatorInfo.website ?? "",
      iban: operatorInfo.iban ?? "",
      bank: operatorInfo.bank ?? "",
      license: operatorInfo.license ?? "",
      licenseAuthority: operatorInfo.licenseAuthority ?? "",
      signatoryName: operatorInfo.signatoryName ?? "",
      signatoryRole: operatorInfo.signatoryRole ?? "",
    },

    // ───────── Acceptance fingerprint ─────────
    acceptance: {
      ipAddress: acceptance.ipAddress ?? "",
      userAgent: acceptance.userAgent ?? "",
      acceptedAt: acceptance.acceptedAt ?? "",
      marketingConsent: acceptance.marketingConsent ?? false,
      templateSlug: acceptance.templateSlug ?? "",
      templateId: acceptance.templateId ?? "",
    },
  }
}

function stringFromDoc(documents: Record<string, unknown> | undefined, key: string): string {
  const value = documents?.[key]
  return typeof value === "string" ? value : ""
}

// These labels are emitted into contract PDFs as template variable values,
// not rendered in the operator UI. Contract localization is driven by the
// contract's `language` field on render and lives in the template body —
// not the operator's UI locale — so these stay in English at this layer.
function paymentMethodLabel(intent: BookingDraftV1["payment"]["intent"]): string {
  switch (intent) {
    case "card":
      // i18n-literal-ok
      return "Card payment"
    case "bank_transfer":
      // i18n-literal-ok
      return "Bank transfer"
    case "inquiry":
      // i18n-literal-ok
      return "Inquiry / Hold"
    case "hold":
      // i18n-literal-ok
      return "Hold"
    case "ticket_on_credit":
      // i18n-literal-ok
      return "Ticket on credit"
    default:
      return ""
  }
}

/**
 * Build a "1× DBL (BB)"-style summary from the draft's accommodation
 * rooms. Server-side renders override this with a richer summary
 * derived from the persisted booking_items.
 */
function buildRoomsSummary(draft: BookingDraftV1): string {
  const rooms = draft.accommodation?.rooms ?? []
  if (rooms.length === 0) return ""
  return rooms
    .map((r) => `${r.quantity}× ${r.optionUnitId}${r.ratePlanId ? ` (${r.ratePlanId})` : ""}`)
    .join(", ")
}

function computeNights(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0
  try {
    const start = new Date(startDate)
    const end = new Date(endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
    const ms = end.getTime() - start.getTime()
    return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
  } catch {
    return 0
  }
}

interface VerticalContext {
  vertical: string
  summary?: BookingEntitySummary
  draft: BookingDraftV1
  accommodationRooms: Array<{ optionUnitId: string; quantity: number; ratePlanId: string }>
  durationNights: number
  startDate: string
  endDate: string
}

/**
 * Build vertical-specific top-level blocks. Verticals that don't
 * apply emit empty objects so `{{ sailing.ship }}` renders blank
 * rather than throwing in a strict templating engine.
 */
function buildVerticalBlocks(ctx: VerticalContext): Record<string, unknown> {
  const { vertical, summary, draft, accommodationRooms, durationNights, startDate, endDate } = ctx
  const blocks: Record<string, unknown> = {
    departureSlot: {
      slotId: draft.configure?.departureSlotId ?? "",
      startAt: startDate,
      endAt: endDate,
      durationDays: durationNights,
    },
    sailing: {
      sailingId: "",
      ship: "",
      embarkationPort: "",
      disembarkationPort: "",
      airArrangement: draft.configure?.airArrangement ?? "",
      startDate: "",
      endDate: "",
    },
    stay: {
      checkIn: draft.configure?.dateRange?.checkIn ?? "",
      checkOut: draft.configure?.dateRange?.checkOut ?? "",
      nights: durationNights,
      rooms: accommodationRooms,
    },
  }

  if (vertical === "products") {
    blocks.departureSlot = {
      slotId: draft.configure?.departureSlotId ?? "",
      startAt: startDate,
      endAt: endDate,
      durationDays: durationNights,
      departureCity: summary?.locationLabel ?? "",
    }
  } else if (vertical === "cruises") {
    const route = summary?.locationLabel ?? ""
    const [embarkation, disembarkation] = route.split("→").map((s) => s.trim())
    blocks.sailing = {
      sailingId: draft.configure?.departureSlotId ?? "",
      ship: summary?.subtitle ?? "",
      embarkationPort: embarkation ?? "",
      disembarkationPort: disembarkation ?? embarkation ?? "",
      airArrangement: draft.configure?.airArrangement ?? "",
      startDate,
      endDate,
      cabinCategoryId: draft.configure?.cabinCategoryId ?? "",
      cabinNumberId: draft.configure?.cabinNumberId ?? "",
    }
  } else if (vertical === "accommodations") {
    blocks.stay = {
      checkIn: draft.configure?.dateRange?.checkIn ?? "",
      checkOut: draft.configure?.dateRange?.checkOut ?? "",
      nights: durationNights,
      rooms: accommodationRooms,
      destination: summary?.locationLabel ?? "",
    }
  }

  return blocks
}
