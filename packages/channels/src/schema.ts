/**
 * Deployment-local schema for the `pms-channels` module (PLAN §4.7, Phase 6).
 *
 * Channel connectivity is a SKELETON in this phase: no live OTA credentials
 * exist, so these two ledgers are the provider-pluggable seam's persistence half
 * (the connector interface lives in `connector.ts`). They are deliberately thin
 * append-oriented ledgers — the real per-channel push transport is a future
 * plugin (`packages/plugins/channel-*`).
 *
 * Two tables:
 *   - `pms_channel_ari_events`   — the OUTBOUND push ledger. Each row is one
 *                                   rate/availability delta destined for a channel;
 *                                   `processPendingAriEvents` hands it to the
 *                                   channel's `ChannelConnector.pushAri` and counts
 *                                   attempts. Idempotent by a deterministic
 *                                   `dedupe_key` (channel + roomType + ratePlan +
 *                                   date-range hash, `buildAriDedupeKey`).
 *   - `pms_channel_reservations` — the INBOUND ledger. Each row is one reservation
 *                                   a channel delivered via the public webhook;
 *                                   idempotent per (channel, channelReservationId).
 *                                   After a successful ingest the row carries the
 *                                   created `booking_id` (loose ref).
 *
 * Picked up by `drizzle.deployment-migrations.config.ts` (glob
 * `./src/modules/<name>/schema.ts`) and migrated as a deployment source AFTER the
 * framework bundle. Cross-module references (property, room type, rate plan,
 * booking) are LOOSE typeid text columns — never `.references()` to an upstream
 * table — per the repo guardrail.
 *
 * TypeID prefixes (checked against @voyant-travel/schema-kit PREFIXES and the
 * PMS-local prefixes — both unused; upstream's distribution `channel*` family uses
 * `chan`/`chbl`/`chwe`/… never `chae`/`chrz`): `chae` (channel ari event), `chrz`
 * (channel reservation). Generated via `newIdFromPrefix` because these prefixes
 * are deployment-local and therefore not in the closed upstream `PrefixKey`
 * registry that `typeId()` requires.
 */

import { newIdFromPrefix } from "@voyant-travel/db/lib/typeid"
import { typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import {
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

// --- outbound ARI push ledger ------------------------------------------------

/**
 * Lifecycle of an outbound ARI push:
 *   `pending` (enqueued, not yet pushed) → `pushed` (connector accepted it) |
 *   `failed` (connector rejected it after max attempts) | `skipped` (connector
 *   declined / no-op, e.g. no mapping for the room type on that channel).
 */
export const channelAriEventStatusEnum = pgEnum("pms_channel_ari_event_status", [
  "pending",
  "pushed",
  "failed",
  "skipped",
])

export const channelAriEvents = pgTable(
  "pms_channel_ari_events",
  {
    id: localId("chae"),
    // The channel connector name this delta targets (e.g. "mock", "booking-com").
    channel: text("channel").notNull(),
    propertyId: typeIdRef("property_id").notNull(),
    roomTypeId: typeIdRef("room_type_id").notNull(),
    // Rate plan is optional — an availability-only delta (capacity/close) has none.
    ratePlanId: typeIdRef("rate_plan_id"),
    // The full serialized `AriDelta` (see connector.ts) — the connector re-reads it.
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: channelAriEventStatusEnum("status").notNull().default("pending"),
    // Push attempts so far; `processPendingAriEvents` fails the row at max attempts.
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    // Deterministic idempotency key (buildAriDedupeKey) — a re-enqueue of the same
    // (channel, roomType, ratePlan, date-range) collapses onto the existing row
    // rather than fanning out duplicate pushes. UNIQUE (one pending row per key).
    dedupeKey: text("dedupe_key").notNull(),
    pushedAt: timestamp("pushed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uidx_pms_channel_ari_events_dedupe").on(table.dedupeKey),
    // The push worker scans pending rows per channel oldest-first.
    index("idx_pms_channel_ari_events_channel_status").on(table.channel, table.status),
    index("idx_pms_channel_ari_events_property").on(table.propertyId),
  ],
)

// --- inbound reservation ledger ----------------------------------------------

/**
 * Lifecycle of an inbound channel reservation:
 *   `received` (recorded, not yet turned into a booking) → `ingested` (a real PMS
 *   booking was created, `booking_id` set) | `failed` (ingest raised — retry via
 *   the admin route) | `ignored` (a delivery we intentionally drop, e.g. a channel
 *   test ping or an unmapped status).
 */
export const channelReservationStatusEnum = pgEnum("pms_channel_reservation_status", [
  "received",
  "ingested",
  "failed",
  "ignored",
])

export const channelReservations = pgTable(
  "pms_channel_reservations",
  {
    id: localId("chrz"),
    channel: text("channel").notNull(),
    // The channel's own reservation id — unique per channel (composite unique).
    channelReservationId: text("channel_reservation_id").notNull(),
    status: channelReservationStatusEnum("status").notNull().default("received"),
    // The normalized `InboundReservation` (see connector.ts), stored verbatim so a
    // retry re-ingests from the recorded shape without re-parsing the raw payload.
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    // The PMS booking created at ingest (loose ref). Null until `ingested`.
    bookingId: typeIdRef("booking_id"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Idempotency: a channel's reservation id appears at most once.
    uniqueIndex("uidx_pms_channel_reservations_channel_ref").on(
      table.channel,
      table.channelReservationId,
    ),
    index("idx_pms_channel_reservations_channel_status").on(table.channel, table.status),
    index("idx_pms_channel_reservations_booking").on(table.bookingId),
  ],
)

export type ChannelAriEventRow = typeof channelAriEvents.$inferSelect
export type ChannelReservationRow = typeof channelReservations.$inferSelect
