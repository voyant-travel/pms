/**
 * Reservations terminology overrides for the PMS admin.
 *
 * Hotel staff surfaces call the staff-facing record a "reservation"; the guest
 * storefront and the underlying framework keep saying "booking" (API paths,
 * schema, code identifiers, the guest-voice booking journey, and the internal
 * "booking engine" all stay unchanged). This module is the single source of the
 * deployment-owned message overrides that re-register packaged admin copy from
 * "booking(s)" to "reservation(s)".
 *
 * Each map targets one package's `*UiMessageDefinitions` catalog and is wired
 * through that package's `*UiMessagesProvider overrides` prop in
 * `admin-extensions.tsx` (plus the operator nav label through the admin shell).
 *
 * Only the `en` locale is remapped: the packaged Romanian catalogs already say
 * "rezervare/rezervari" natively, so a `shared` override would wrongly stamp the
 * English word over Romanian. Keeping everything under `locales.en` leaves `ro`
 * untouched.
 *
 * Intentionally NOT overridden (documented so the split stays deliberate):
 * - `bookingJourney.*` in bookings-react — the guest-voice checkout wizard /
 *   "booking engine" shared with the storefront.
 * - "Captured at booking time" snapshot subtitles — refers to the moment of the
 *   transaction, not the record.
 * - catalog-react's `catalogBookingPage` / `bookingMode`, commerce pricing
 *   "per booking" units, and distribution "booking link" primitives — product
 *   config / distribution concepts, not the reservation record.
 *
 * Every override key is asserted to EXIST in its package catalog by
 * `reservation-terminology.test.ts`, so an upstream catalog rename fails our
 * tests instead of silently reverting a surface to "booking".
 */
import type { BookingsUiMessageOverrides } from "@voyant-travel/bookings-react/i18n"
import type { FinanceUiMessageOverrides } from "@voyant-travel/finance-react/i18n"
import type { LegalUiMessageOverrides } from "@voyant-travel/legal-react/i18n"
import type { CrmUiMessageOverrides } from "@voyant-travel/relationships-react/i18n"
import type { AdminMessageOverrides } from "@/lib/admin-i18n"

/**
 * bookings-react — the primary packaged booking admin surface (list, detail,
 * create dialog, status/cancellation/group dialogs). Guest-voice journey copy is
 * intentionally excluded.
 */
export const bookingsReservationOverrides: BookingsUiMessageOverrides = {
  locales: {
    en: {
      bookingsPage: {
        title: "Reservations",
        description: "Manage reservations, confirmations, and travelers.",
      },
      bookingCreatePage: {
        title: "New reservation",
        description:
          "Create a reservation, select the billed customer, add travelers, and schedule payment.",
      },
      bookingCombobox: {
        placeholder: "Search reservations...",
        empty: "No reservations found.",
        loading: "Loading reservations...",
      },
      bookingQuickViewSheet: {
        loadingTitle: "Reservation",
        viewFullAction: "View full reservation",
      },
      bookingDetailPage: {
        notFound: "Reservation not found",
        backToBookings: "Back to reservations",
        breadcrumbBookings: "Reservations",
        cancelBookingAction: "Cancel reservation",
        deleteConfirm: "Delete this reservation?",
        deleteConfirmDescription:
          "Reservation {number} will be permanently removed along with its items, travelers, and finance records. This cannot be undone.",
        deleteConfirmDescriptionFallback:
          "This reservation will be permanently removed along with its items, travelers, and finance records. This cannot be undone.",
        deleteConfirmAction: "Delete reservation",
        metadataSection: {
          bookingId: "Reservation ID",
          bookingNumber: "Reservation number",
        },
        documentsSlotEmpty: "Provide a documents slot to render reservation documents.",
      },
      travelerList: {
        actions: {
          deleteConfirm: {
            description:
              "The traveler will be removed from this reservation. This action cannot be undone.",
          },
        },
      },
      voucherPickerSection: {
        reasonMessages: {
          booking_mismatch: "Voucher is assigned to a different reservation.",
          currency_mismatch: "Voucher currency does not match the reservation.",
        },
      },
      sharedRoomSection: {
        labels: {
          createHint:
            "A new shared room will be created with this reservation as the primary member.",
        },
      },
      bookingDocumentDialog: {
        placeholders: {
          travelerUnassigned: "Reservation-wide",
        },
      },
      statusChangeDialog: {
        title: "Change reservation status",
      },
      bookingItemList: {
        actions: {
          deleteConfirm: {
            description:
              "This removes the item from the reservation. This action cannot be undone.",
          },
        },
      },
      bookingPaymentScheduleList: {
        actions: {
          deleteConfirm: {
            description:
              "This removes the schedule entry from the reservation. This action cannot be undone.",
          },
        },
      },
      bookingCancellationDialog: {
        title: "Cancel reservation",
        summary: {
          booking: "Reservation",
        },
        policy: {
          missing: "No cancellation policy configured for this reservation.",
          missingHint:
            "Proceeding will cancel without a refund preview. Paid reservations will be marked for settlement review.",
          noTotalAmount: "Reservation has no total amount. Refund cannot be calculated.",
        },
        paidSettlement: {
          title: "Paid reservation settlement required",
        },
        placeholders: {
          reason: "Why is this reservation being cancelled?",
        },
      },
      bookingGroupLinkDialog: {
        title: "Link reservation to shared room",
        hints: {
          productFiltered: "Filtered to groups for the reservation's product.",
          primaryMember: "This reservation will be marked as the primary member.",
        },
        validation: {
          linkFailed: "Failed to link reservation",
        },
      },
      bookingGroupSection: {
        empty: "This reservation is not linked to a shared-room group.",
        siblingBookings: "Sibling reservations ({count})",
        noSiblingBookings:
          "No other reservations linked yet. Share the group id with another reservation to link them.",
        actions: {
          removeConfirm: "Remove this reservation from the shared-room group?",
        },
      },
      bookingDialog: {
        editTitle: "Edit reservation",
        fields: {
          bookingNumber: "Reservation number",
        },
        validation: {
          bookingNumberRequired: "Reservation number is required",
        },
      },
      bookingCreateDialog: {
        title: "New reservation",
        fields: {
          confirmAfterCreate: "Confirm reservation after creating",
          confirmAfterCreateHint: "Transitions the new reservation to confirmed.",
          createAsDraftHint:
            "Otherwise the reservation lands in {status} based on whether any payment is already marked paid.",
        },
        placeholders: {
          internalNotes: "Context for this reservation...",
        },
        validation: {
          confirmFailedPrefix: "Reservation created but confirm failed: {message}",
          confirmFailed: "Reservation created but confirm failed",
          createFailed: "Failed to create reservation",
          payloadResolverMismatchDetails:
            "Reservation options are out of sync. Review these lines: {details}.",
          payloadResolverMismatchFallback:
            "Reservation options are out of sync. Review the selected traveler and option lines.",
        },
        actions: {
          createDraftBooking: "Create draft reservation",
          createConfirmedBooking: "Create confirmed reservation",
          createAwaitingPaymentBooking: "Create reservation",
        },
        labels: {
          sharedRoomCreateHint:
            "A new shared room will be created with this reservation as the primary member.",
        },
      },
      bookingList: {
        searchPlaceholder: "Search by reservation #, payer, email, phone, or item…",
        newBooking: "New reservation",
        columns: {
          bookingNumber: "Reservation #",
        },
        loadingError: "Failed to load reservations.",
        empty: "No reservations found.",
      },
      bookingPaymentsSummary: {
        columns: {
          fx: "Reservation equivalent",
        },
      },
      bookingActivityTimeline: {
        activityTitles: {
          booking_created: "Reservation created",
          booking_reserved: "Reservation held",
          booking_converted: "Reservation converted",
          booking_confirmed: "Reservation confirmed",
        },
      },
    },
  },
}

/**
 * finance-react — invoice / payment / supplier-invoice / profitability surfaces
 * that label or link the reservation record ("Booking" field, "View booking",
 * "booking-derived totals", cost-allocation target, payment-policy copy).
 */
export const financeReservationOverrides: FinanceUiMessageOverrides = {
  locales: {
    en: {
      invoiceDialog: {
        fields: {
          bookingId: "Reservation",
        },
        placeholders: {
          bookingId: "Search by reservation number, customer, or product",
        },
        validation: {
          bookingIdRequired: "Reservation is required",
        },
        lineItems: {
          empty: "No line items. Add rows to override the reservation-derived totals.",
        },
      },
      invoiceDetailPage: {
        actions: {
          viewBooking: "View reservation",
        },
        fields: {
          booking: "Reservation",
        },
      },
      supplierInvoiceDetail: {
        allocation: {
          targetTypeLabels: {
            booking: "Reservation",
          },
        },
      },
      supplierPaymentDialog: {
        fields: {
          bookingId: "Reservation",
        },
        placeholders: {
          bookingId: "Search by reservation number, customer, or product",
        },
        validation: {
          bookingIdRequired: "Reservation is required",
        },
      },
      paymentDetailPage: {
        actions: {
          viewBooking: "View reservation",
        },
        fields: {
          booking: "Reservation",
        },
      },
      paymentPolicy: {
        form: {
          depositHints: {
            fixed_cents:
              "Capped at the reservation total when the reservation is smaller than this amount.",
          },
          days: {
            minDaysHelp:
              "If departure is closer than this, the reservation requires the full amount up front.",
          },
        },
        preview: {
          sample: "Sample: {amount} reservation, departure in {days} days",
        },
        supplierCard: {
          description:
            "When set, sourced reservations against this supplier inherit these terms instead of the operator default. Leave inheriting to fall back to the deployment-wide policy.",
        },
      },
      taxesPage: {
        taxClassSectionDescription:
          "The assignable classification stored on products and reservation lines.",
      },
      recordBookingPaymentDialog: {
        noInvoices: "No unpaid invoices on this reservation.",
      },
      profitability: {
        travelers: {
          columns: {
            booking: "Reservation",
          },
        },
      },
    },
  },
}

/**
 * relationships-react (CRM) — the person / organization detail "Bookings" tab
 * (which hosts the reservation list widget) and the merge-dialog copy.
 */
export const relationshipsReservationOverrides: CrmUiMessageOverrides = {
  locales: {
    en: {
      organizationDetail: {
        tabs: {
          bookings: "Reservations",
        },
      },
      personDetail: {
        mergeDialog: {
          description:
            "Move reservations, invoices, notes, and CRM history from a duplicate into this person.",
        },
        tabs: {
          bookings: "Reservations",
        },
      },
    },
  },
}

/**
 * legal-react — the reservation-detail contract card and the contract / policy
 * detail "Booking" reference fields.
 */
export const legalReservationOverrides: LegalUiMessageOverrides = {
  locales: {
    en: {
      bookingContractCard: {
        empty: "No contract has been generated for this reservation yet.",
      },
      contractDetailPage: {
        fields: {
          booking: "Reservation",
        },
      },
      policyDetailPage: {
        fields: {
          bookingId: "Reservation",
        },
      },
    },
  },
}

/**
 * Operator admin nav label. The "Bookings" group in the base operator navigation
 * is package-owned (`operatorAdminMessageDefinitions.nav.bookings`); this remaps
 * only the `en` label (the packaged `ro` nav already reads "Rezervari").
 */
export const navReservationOverrides: AdminMessageOverrides = {
  locales: {
    en: {
      nav: {
        bookings: "Reservations",
      },
    },
  },
}

type PlainObject = Record<string, unknown>

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function deepMerge<T extends PlainObject>(base: T, override: PlainObject): T {
  const result: PlainObject = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key]
    result[key] =
      isPlainObject(existing) && isPlainObject(value) ? deepMerge(existing, value) : value
  }
  return result as T
}

/**
 * Deep-merge two `LocaleMessageOverrides` objects (deployment terminology as the
 * base, the caller's overrides winning on conflicting keys). Used to fold the
 * per-user `uiPrefs` admin overrides on top of the reservation nav override.
 */
export function mergeAdminMessageOverrides(
  base: AdminMessageOverrides,
  extra: AdminMessageOverrides | undefined | null,
): AdminMessageOverrides {
  if (!extra) return base
  return deepMerge(
    base as unknown as PlainObject,
    extra as unknown as PlainObject,
  ) as AdminMessageOverrides
}
