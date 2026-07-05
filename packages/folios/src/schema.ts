/**
 * Deployment-local schema for the `pms-folios` module (PLAN §4.4, Phase 5).
 *
 * The folio is the guest ledger — the OPERATIONAL account of a stay (or a house
 * account). It is distinct from the upstream FISCAL ledger in
 * `@voyant-travel/finance` (invoices/receipts): the folio is mutated continuously
 * during a stay by the night audit + front desk, and is projected to ONE finance
 * invoice at settlement (see docs/adr/0001-folio-finance-settlement-mapping.md).
 *
 * Three tables:
 *   - `pms_folios`          — one ledger per stay (booking item) or house account.
 *   - `pms_folio_postings`  — an immutable, append-only ledger line (charge,
 *                              tax, payment, adjustment, transfer). Never updated
 *                              or deleted; corrections are reversal postings.
 *   - `pms_business_dates`  — the property's rolling business date (what "today"
 *                              means to the night audit), one row per property.
 *
 * Picked up by `drizzle.deployment-migrations.config.ts` (glob
 * `./src/modules/<name>/schema.ts`) and migrated as a deployment source AFTER the
 * framework bundle. Cross-module references (property, booking, booking item,
 * upstream finance invoice, user) are LOOSE typeid text columns — never
 * `.references()` to an upstream table — per the repo guardrail. The one real FK
 * is intra-module (`folio_postings.folio_id → folios.id`), matching how
 * `pms-units` did its intra-module ref.
 *
 * TypeID prefixes (checked against @voyant-travel/schema-kit PREFIXES and the
 * PMS-local prefixes — all unused): `folo` (folio), `fpst` (folio posting), `bizd`
 * (business date). Generated via `newIdFromPrefix` because these prefixes are
 * deployment-local and therefore not in the closed upstream `PrefixKey` registry
 * that `typeId()` requires. (Upstream reserves a separate `hsfo`/`hsfl` stay-ops
 * folio family; ours is independent — no collision.)
 */

import { newIdFromPrefix } from "@voyant-travel/db/lib/typeid"
import { typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

/** Deployment-local primary key: text + auto-generated TypeID from a custom prefix. */
const localId = (prefix: string) =>
  text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(() => newIdFromPrefix(prefix))

// --- folios ------------------------------------------------------------------

/** Whether the folio belongs to a stay (booking item) or is a free house account. */
export const folioKindEnum = pgEnum("pms_folio_kind", ["stay", "house"])

/**
 * Folio lifecycle: `open` (accepting postings) → `settled` (invoice cut,
 * financeInvoiceId set for stay folios) → `closed` (archived). `voided` is a
 * terminal cancel for a folio opened in error. Postings themselves are never
 * deleted regardless of folio status.
 */
export const folioStatusEnum = pgEnum("pms_folio_status", ["open", "settled", "closed", "voided"])

export const folios = pgTable(
  "pms_folios",
  {
    id: localId("folo"),
    // Human-facing `F-<seq>` number, unique within the property (see service).
    folioNumber: text("folio_number").notNull(),
    propertyId: typeIdRef("property_id").notNull(),
    kind: folioKindEnum("kind").notNull().default("stay"),
    // Stay folios link the upstream booking + stay item (loose refs). Null for house.
    bookingId: typeIdRef("booking_id"),
    bookingItemId: typeIdRef("booking_item_id"),
    // Snapshot of the guest name at open time (folios outlive CRM edits).
    guestName: text("guest_name"),
    currency: text("currency").notNull(),
    status: folioStatusEnum("status").notNull().default("open"),
    // The upstream finance invoice minted at settlement (loose ref). Null until settled.
    financeInvoiceId: typeIdRef("finance_invoice_id"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Folio numbers are unique within a property.
    uniqueIndex("uidx_pms_folios_property_number").on(table.propertyId, table.folioNumber),
    // A stay item has at most ONE stay folio. Partial unique (kind = 'stay') so
    // many house folios (all NULL booking_item_id) never collide.
    uniqueIndex("uidx_pms_folios_stay_booking_item")
      .on(table.bookingItemId)
      .where(sql`${table.kind} = 'stay'`),
    index("idx_pms_folios_property_status").on(table.propertyId, table.status),
    index("idx_pms_folios_booking").on(table.bookingId),
  ],
)

// --- folio postings ----------------------------------------------------------

/**
 * The kind of ledger line. Charges are POSITIVE `amountCents`; payments and
 * credits are NEGATIVE. `transfer` moves an amount between folios; `adjustment`
 * is a manual correction; `payment` mirrors an upstream payment.
 */
export const folioPostingTypeEnum = pgEnum("pms_folio_posting_type", [
  "room",
  "tax",
  "fee",
  "extra",
  "payment",
  "adjustment",
  "transfer",
])

/** Where a posting originated — drives idempotency + audit. */
export const folioPostingSourceEnum = pgEnum("pms_folio_posting_source", [
  "night_audit",
  "manual",
  "transfer",
  "payment_sync",
])

export const folioPostings = pgTable(
  "pms_folio_postings",
  {
    id: localId("fpst"),
    // Intra-module FK (matches pms-units): dropping a folio removes its ledger.
    folioId: typeIdRef("folio_id")
      .notNull()
      .references((): AnyPgColumn => folios.id, { onDelete: "cascade" }),
    // The business date the posting accrues to (a room charge for the night of D).
    businessDate: date("business_date").notNull(),
    type: folioPostingTypeEnum("type").notNull(),
    description: text("description").notNull(),
    // Signed minor units: charges positive, payments/credits negative.
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitAmountCents: integer("unit_amount_cents"),
    source: folioPostingSourceEnum("source").notNull().default("manual"),
    // Deterministic idempotency key. NULL for ad-hoc manual postings; UNIQUE
    // allows many NULLs in Postgres, so night-audit / transfer postings dedupe
    // via ON CONFLICT while manual rows never collide.
    sourceKey: text("source_key"),
    // Self-ref to the posting this one reverses (void / transfer). Loose (nullable).
    reversalOfId: typeIdRef("reversal_of_id"),
    createdBy: typeIdRef("created_by"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Idempotency: one posting per deterministic source key.
    uniqueIndex("uidx_pms_folio_postings_source_key").on(table.sourceKey),
    // Folio ledger reads (postings + balance) ordered by business date.
    index("idx_pms_folio_postings_folio_date").on(table.folioId, table.businessDate),
    index("idx_pms_folio_postings_reversal_of").on(table.reversalOfId),
  ],
)

// --- business dates ----------------------------------------------------------

/**
 * The property's rolling business date. The night audit charges the current
 * business date's room-nights, then rolls `currentDate` to D+1. One row per
 * property; created lazily on first audit (defaults to the real calendar date).
 */
export const businessDates = pgTable(
  "pms_business_dates",
  {
    id: localId("bizd"),
    propertyId: typeIdRef("property_id").notNull(),
    currentDate: date("current_date").notNull(),
    lastAuditRunAt: timestamp("last_audit_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uidx_pms_business_dates_property").on(table.propertyId)],
)

export type FolioRow = typeof folios.$inferSelect
export type FolioPostingRow = typeof folioPostings.$inferSelect
export type BusinessDateRow = typeof businessDates.$inferSelect
