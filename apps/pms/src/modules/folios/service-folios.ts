/**
 * Folio CRUD + auto-open (PLAN §4.4). A stay folio is opened explicitly
 * (`POST /folios`) or lazily on first posting / by the night audit
 * (`ensureStayFolio`). Cross-module refs (property, booking, booking item) are
 * loose text columns; the stay-folio existence check is service-layer.
 *
 * Folio numbers are `F-<seq>` per property, derived from a count query at open
 * time. Two concurrent opens can race to the same number; the
 * `(propertyId, folioNumber)` unique index makes the loser fail loudly (ADR 0001
 * documents this as a v1 acceptable risk — retry-on-conflict is a follow-up).
 */

import { type ListResponse, listResponse } from "@voyant-travel/types"
import { and, asc, count, desc, eq, type SQL } from "drizzle-orm"
import { summarizeFolio } from "./balance.js"
import type { FoliosDb } from "./db.js"
import { type FolioRow, folioPostings, folios } from "./schema.js"
import type { FolioListQuery, OpenFolioInput } from "./validation.js"

/** Compute the next `F-<seq>` folio number for a property (count + 1, zero-padded). */
export async function nextFolioNumber(db: FoliosDb, propertyId: string): Promise<string> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(folios)
    .where(eq(folios.propertyId, propertyId))
  return `F-${String(total + 1).padStart(4, "0")}`
}

export async function listFolios(
  db: FoliosDb,
  query: FolioListQuery,
): Promise<ListResponse<FolioRow>> {
  const clauses: SQL[] = []
  if (query.propertyId) clauses.push(eq(folios.propertyId, query.propertyId))
  if (query.status) clauses.push(eq(folios.status, query.status))
  if (query.bookingId) clauses.push(eq(folios.bookingId, query.bookingId))
  const where = clauses.length ? and(...clauses) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(folios)
      .where(where)
      .orderBy(desc(folios.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(folios).where(where),
  ])
  return listResponse(rows, { total, limit: query.limit, offset: query.offset })
}

export async function getFolio(db: FoliosDb, id: string): Promise<FolioRow | null> {
  const [row] = await db.select().from(folios).where(eq(folios.id, id)).limit(1)
  return row ?? null
}

export interface FolioWithPostings {
  folio: FolioRow
  postings: (typeof folioPostings.$inferSelect)[]
  summary: ReturnType<typeof summarizeFolio>
}

/** Load a folio with its full posting ledger + a balance summary. */
export async function getFolioWithPostings(
  db: FoliosDb,
  id: string,
): Promise<FolioWithPostings | null> {
  const folio = await getFolio(db, id)
  if (!folio) return null
  const postings = await db
    .select()
    .from(folioPostings)
    .where(eq(folioPostings.folioId, id))
    .orderBy(asc(folioPostings.businessDate), asc(folioPostings.createdAt))
  return { folio, postings, summary: summarizeFolio(postings) }
}

/** Open a folio explicitly. Allocates the next per-property folio number. */
export async function openFolio(db: FoliosDb, input: OpenFolioInput): Promise<FolioRow> {
  const folioNumber = await nextFolioNumber(db, input.propertyId)
  const [row] = await db
    .insert(folios)
    .values({
      folioNumber,
      propertyId: input.propertyId,
      kind: input.kind,
      bookingId: input.bookingId ?? null,
      bookingItemId: input.bookingItemId ?? null,
      guestName: input.guestName ?? null,
      currency: input.currency,
      metadata: input.metadata ?? null,
    })
    .returning()
  return row
}

export interface EnsureStayFolioInput {
  propertyId: string
  bookingId: string | null
  bookingItemId: string
  guestName?: string | null
  currency: string
}

/**
 * Find the stay folio for a booking item, opening one if absent. Used by the
 * night audit and lazy first-posting. Concurrency-safe against the partial unique
 * index: on a race, the second insert conflicts and we re-read the winner.
 */
export async function ensureStayFolio(
  db: FoliosDb,
  input: EnsureStayFolioInput,
): Promise<FolioRow> {
  const existing = await db
    .select()
    .from(folios)
    .where(and(eq(folios.bookingItemId, input.bookingItemId), eq(folios.kind, "stay")))
    .limit(1)
  if (existing[0]) return existing[0]

  const folioNumber = await nextFolioNumber(db, input.propertyId)
  try {
    const [row] = await db
      .insert(folios)
      .values({
        folioNumber,
        propertyId: input.propertyId,
        kind: "stay",
        bookingId: input.bookingId,
        bookingItemId: input.bookingItemId,
        guestName: input.guestName ?? null,
        currency: input.currency,
      })
      .returning()
    return row
  } catch {
    // Lost a race on the partial unique (stay bookingItemId) — read the winner.
    const [row] = await db
      .select()
      .from(folios)
      .where(and(eq(folios.bookingItemId, input.bookingItemId), eq(folios.kind, "stay")))
      .limit(1)
    if (row) return row
    throw new Error(`failed to open or find stay folio for booking item ${input.bookingItemId}`)
  }
}
