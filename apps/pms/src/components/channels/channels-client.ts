/**
 * Client-side data layer for the Channels ledger admin page. Thin wrappers over
 * the deployment-local `pms/channels` module mounted at
 * `/v1/admin/pms/channels/*` (see `src/modules/channels`), plus the shared query
 * keys so a retry invalidates the right reads. Read-only ledgers + a retry action;
 * request/response shapes mirror the module's row + list-envelope types.
 */

import { api } from "@/lib/api-client"

const BASE = "/v1/admin/pms/channels"

export const ARI_EVENT_STATUSES = ["pending", "pushed", "failed", "skipped"] as const
export type AriEventStatus = (typeof ARI_EVENT_STATUSES)[number]

export const RESERVATION_STATUSES = ["received", "ingested", "failed", "ignored"] as const
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]

export interface AriEvent {
  id: string
  channel: string
  propertyId: string
  roomTypeId: string
  ratePlanId: string | null
  status: AriEventStatus
  attempts: number
  lastError: string | null
  dedupeKey: string
  pushedAt: string | null
  createdAt?: string
  updatedAt?: string
}

export interface ChannelReservation {
  id: string
  channel: string
  channelReservationId: string
  status: ReservationStatus
  bookingId: string | null
  error: string | null
  createdAt?: string
  updatedAt?: string
}

interface ListEnvelope<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}

export const channelsKeys = {
  all: ["channels"] as const,
  ariEvents: (status: string) => [...channelsKeys.all, "ari-events", status] as const,
  reservations: (status: string) => [...channelsKeys.all, "reservations", status] as const,
}

export function listAriEvents(status?: AriEventStatus): Promise<ListEnvelope<AriEvent>> {
  const params = new URLSearchParams({ limit: "200", offset: "0" })
  if (status) params.set("status", status)
  return api.get<ListEnvelope<AriEvent>>(`${BASE}/ari-events?${params.toString()}`)
}

export function listReservations(
  status?: ReservationStatus,
): Promise<ListEnvelope<ChannelReservation>> {
  const params = new URLSearchParams({ limit: "200", offset: "0" })
  if (status) params.set("status", status)
  return api.get<ListEnvelope<ChannelReservation>>(`${BASE}/reservations?${params.toString()}`)
}

export function retryReservationIngest(
  id: string,
): Promise<{ data: ChannelReservation; ingest?: { ok: boolean; reason?: string } }> {
  return api.post(`${BASE}/reservations/${id}/retry-ingest`)
}
