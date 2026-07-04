/**
 * The channel-connector seam (PLAN §4.7, Phase 6).
 *
 * `ChannelConnector` is the provider-pluggable contract every OTA / channel-manager
 * integration implements — one connector per channel, registered by name in the
 * deployment composition (`src/api/lib/channel-connectors.ts`) as a
 * `ChannelConnectorRegistry` record. It is deliberately minimal: this phase ships
 * the seam + one reference `mock` connector (`mock-connector.ts`), NOT a live
 * Booking.com integration.
 *
 * Two directions:
 *   - OUTBOUND — `pushAri(delta)` sends a rate/availability change to the channel.
 *     The push ledger (`pms_channel_ari_events`) drives this via
 *     `processPendingAriEvents`.
 *   - INBOUND — `parseReservation(payload)` normalizes a channel's raw webhook body
 *     into an `InboundReservation`; `verifyWebhook(req)` optionally checks a
 *     provider signature (the shared-secret header is checked separately, in the
 *     route, against `CHANNEL_WEBHOOK_SECRET`).
 *
 * Nothing here imports the db or Hono — a connector is pure transport + mapping, so
 * it is trivially unit-testable (see `mock-connector.test.ts`).
 */

/** One night's rate/availability change within an {@link AriDelta}. */
export interface AriDeltaDate {
  /** `YYYY-MM-DD`. */
  date: string
  /** Sellable capacity for the night. Omit to leave capacity unchanged. */
  capacity?: number
  /** Close/open the night to sale. Omit to leave the closed flag unchanged. */
  closed?: boolean
  /** Nightly sell price in minor units (requires `currency`). Omit for availability-only. */
  sellAmountCents?: number
  /** ISO-4217 currency for `sellAmountCents`. */
  currency?: string
}

/**
 * A normalized rate/availability delta destined for a single channel. Room-type
 * scoped; `ratePlanId` is present for rate changes and absent for availability-only
 * (capacity/close) changes.
 */
export interface AriDelta {
  propertyId: string
  roomTypeId: string
  ratePlanId?: string
  dates: AriDeltaDate[]
}

/** The outcome of an outbound push. `skipped` = connector declined (e.g. no mapping). */
export interface PushResult {
  status: "pushed" | "skipped" | "failed"
  /** The channel's own reference for the accepted push, if any. */
  ref?: string
  /** Present on `failed` / `skipped`. */
  error?: string
}

/**
 * A channel reservation normalized into the PMS's vocabulary. `roomTypeRef` /
 * `ratePlanRef` are the PMS-side ids the channel is mapped to (the connector owns
 * the channel-id → PMS-id mapping); the ingest path resolves them against the
 * owned-stay quote to build a real booking.
 */
export interface InboundReservation {
  channel: string
  /** The channel's own reservation id — the inbound idempotency key. */
  channelReservationId: string
  /** PMS property id, when the channel/connector resolves it. */
  propertyId?: string
  /** PMS room type id the channel mapped this reservation to. */
  roomTypeRef: string
  /** PMS rate plan id, when known. */
  ratePlanRef?: string
  /** `YYYY-MM-DD`. */
  checkIn: string
  /** `YYYY-MM-DD`. */
  checkOut: string
  occupancy: {
    adults: number
    children?: number
    infants?: number
  }
  guest: {
    name: string
    email?: string
    phone?: string
  }
  /** Total stay price in minor units, if the channel sends it. */
  totalAmountCents?: number
  currency: string
  status: "confirmed" | "modified" | "cancelled"
  /** The original channel payload, retained verbatim for audit/debug. */
  raw: unknown
}

/** A minimal, header-only view of the inbound request a connector may inspect. */
export interface WebhookRequest {
  headers: Record<string, string>
  body: unknown
}

/**
 * The provider-pluggable channel contract. One instance per channel, keyed by
 * {@link ChannelConnector.name} in the {@link ChannelConnectorRegistry}.
 */
export interface ChannelConnector {
  /** Stable channel key — matches the `channel` column + the webhook `:channel` param. */
  name: string
  /** Send a rate/availability delta to the channel. Must never throw for a normal
   *  rejection — return `{ status: "failed" | "skipped", error }` instead. */
  pushAri(delta: AriDelta): Promise<PushResult>
  /** Optional provider-signature check over the raw request (distinct from the
   *  deployment shared-secret header, which the route enforces separately). */
  verifyWebhook?(req: WebhookRequest): boolean
  /** Normalize a raw channel payload into an {@link InboundReservation}, or `null`
   *  if the payload is not a reservation this connector recognizes (→ `ignored`). */
  parseReservation(payload: unknown): InboundReservation | null
}

/** name → connector, assembled in the deployment composition. */
export type ChannelConnectorRegistry = Record<string, ChannelConnector>

/** Resolve a connector by channel name, or `undefined` if unregistered. */
export function resolveConnector(
  registry: ChannelConnectorRegistry,
  channel: string,
): ChannelConnector | undefined {
  return registry[channel]
}
