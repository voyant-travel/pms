/**
 * Client-side data layer for the Folios admin pages. Thin wrappers over the
 * deployment-local `pms/folios` module mounted at `/v1/admin/pms/folios/*` (see
 * `packages/folios`), plus the shared query keys so a mutation invalidates the
 * right reads.
 *
 * Request/response shapes come from the module's zod-inferred input types and pure
 * return types (`import type` only — no runtime coupling to the server-only drizzle
 * schema). Stored rows are declared as plain interfaces here, mirroring
 * `housekeeping-client.ts` / `front-desk-client.ts`.
 */

import type {
  CreatePostingInput,
  DailyReport,
  FolioBalanceSummary,
  NightAuditResult,
  OpenFolioInput,
  SettleFolioInput,
  TransferPostingInput,
} from "@voyant-travel/pms-folios"
import { api } from "@/lib/api-client"

const BASE = "/v1/admin/pms/folios"

// --- enums (runtime constants for selects/filters) ---------------------------

export type FolioKind = "stay" | "house"
export type FolioStatus = "open" | "settled" | "closed" | "voided"
export type ManualPostingType = CreatePostingInput["type"]

/** Manual posting types the add-posting dialog offers (server `manualPostingTypeSchema`). */
export const MANUAL_POSTING_TYPES: readonly ManualPostingType[] = [
  "room",
  "tax",
  "fee",
  "extra",
  "adjustment",
  "payment",
]

/** Statuses the list filter offers. */
export const FOLIO_STATUSES: readonly FolioStatus[] = ["open", "settled", "closed", "voided"]

export type { CreatePostingInput, DailyReport, NightAuditResult, OpenFolioInput, SettleFolioInput }

// --- stored-row shapes -------------------------------------------------------

export interface Folio {
  id: string
  folioNumber: string
  propertyId: string
  kind: FolioKind
  bookingId: string | null
  bookingItemId: string | null
  guestName: string | null
  currency: string
  status: FolioStatus
  financeInvoiceId: string | null
  settledAt: string | null
  closedAt: string | null
  metadata: Record<string, unknown> | null
  /** Signed posting balance; present on list rows (`listFoliosWithBalances`). */
  balanceCents?: number
  createdAt?: string
  updatedAt?: string
}

export interface FolioPosting {
  id: string
  folioId: string
  businessDate: string
  type: string
  description: string
  amountCents: number
  currency: string
  quantity: number
  unitAmountCents: number | null
  source: string
  sourceKey: string | null
  reversalOfId: string | null
  createdBy: string | null
  metadata: Record<string, unknown> | null
  createdAt?: string
  updatedAt?: string
}

export interface BusinessDate {
  id: string
  propertyId: string
  currentDate: string
  lastAuditRunAt: string | null
  createdAt?: string
  updatedAt?: string
}

export interface FolioWithPostings {
  folio: Folio
  postings: FolioPosting[]
  summary: FolioBalanceSummary
}

export interface SettleResult {
  folio: Folio
  financeInvoiceId: string | null
  balanceCents: number
  reason?: string
}

export interface TransferResult {
  reversal: FolioPosting
  copy: FolioPosting
}

interface ListEnvelope<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}
interface ItemEnvelope<T> {
  data: T
}

// --- query keys --------------------------------------------------------------

export const foliosKeys = {
  all: ["folios"] as const,
  list: (propertyId: string, status?: string, bookingId?: string) =>
    [...foliosKeys.all, "list", propertyId, status ?? "", bookingId ?? ""] as const,
  detail: (id: string) => [...foliosKeys.all, "detail", id] as const,
  businessDate: (propertyId: string) => [...foliosKeys.all, "business-date", propertyId] as const,
  report: (propertyId: string, date: string) =>
    [...foliosKeys.all, "report", propertyId, date] as const,
}

// --- folios ------------------------------------------------------------------

export interface FolioListQueryInput {
  propertyId: string
  status?: FolioStatus
  bookingId?: string
}

export function listFolios(query: FolioListQueryInput): Promise<ListEnvelope<Folio>> {
  const params = new URLSearchParams({ limit: "500", offset: "0", propertyId: query.propertyId })
  if (query.status) params.set("status", query.status)
  if (query.bookingId) params.set("bookingId", query.bookingId)
  return api.get<ListEnvelope<Folio>>(`${BASE}/folios?${params.toString()}`)
}

export function getFolio(id: string): Promise<ItemEnvelope<FolioWithPostings>> {
  return api.get<ItemEnvelope<FolioWithPostings>>(`${BASE}/folios/${id}`)
}

export function openFolio(input: OpenFolioInput): Promise<ItemEnvelope<Folio>> {
  return api.post<ItemEnvelope<Folio>>(`${BASE}/folios`, input)
}

// --- postings (append-only) --------------------------------------------------

export function createPosting(
  folioId: string,
  input: CreatePostingInput,
): Promise<ItemEnvelope<FolioPosting>> {
  return api.post<ItemEnvelope<FolioPosting>>(`${BASE}/folios/${folioId}/postings`, input)
}

export function transferPosting(
  folioId: string,
  input: TransferPostingInput,
): Promise<ItemEnvelope<TransferResult>> {
  return api.post<ItemEnvelope<TransferResult>>(`${BASE}/folios/${folioId}/transfer`, input)
}

export function voidPosting(postingId: string): Promise<ItemEnvelope<FolioPosting>> {
  return api.post<ItemEnvelope<FolioPosting>>(`${BASE}/postings/${postingId}/void`)
}

// --- settlement --------------------------------------------------------------

export function settleFolio(
  folioId: string,
  input: SettleFolioInput,
): Promise<ItemEnvelope<SettleResult>> {
  return api.post<ItemEnvelope<SettleResult>>(`${BASE}/folios/${folioId}/settle`, input)
}

export function closeFolio(folioId: string): Promise<ItemEnvelope<Folio>> {
  return api.post<ItemEnvelope<Folio>>(`${BASE}/folios/${folioId}/close`)
}

// --- night audit + reports ---------------------------------------------------

export function getBusinessDate(propertyId: string): Promise<ItemEnvelope<BusinessDate | null>> {
  return api.get<ItemEnvelope<BusinessDate | null>>(
    `${BASE}/business-date?propertyId=${propertyId}`,
  )
}

export function runNightAudit(propertyId: string): Promise<ItemEnvelope<NightAuditResult>> {
  return api.post<ItemEnvelope<NightAuditResult>>(
    `${BASE}/night-audit/run?propertyId=${propertyId}`,
  )
}

export function getDailyReport(
  propertyId: string,
  date: string,
): Promise<ItemEnvelope<DailyReport>> {
  return api.get<ItemEnvelope<DailyReport>>(
    `${BASE}/reports/daily?propertyId=${propertyId}&date=${date}`,
  )
}
