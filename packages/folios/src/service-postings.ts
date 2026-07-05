/**
 * Posting operations over `pms_folio_postings` (PLAN §4.4). Postings are
 * IMMUTABLE — the only mutations are appends: a manual charge/adjustment/payment,
 * a transfer (reversal on source + copy on target), and a void (a same-type
 * reversal). No PATCH/DELETE. Guards live here; the reversal/transfer row-building
 * is the PURE `transfer.ts`.
 */

import { ApiHttpError } from "@voyant-travel/hono"
import { eq } from "drizzle-orm"

import type { FoliosDb } from "./db.js"
import { type FolioPostingRow, folioPostings, folios } from "./schema.js"

type NewPostingRow = typeof folioPostings.$inferInsert

import { buildTransferPostings, buildVoidPosting, type SourcePosting } from "./transfer.js"
import type { CreatePostingInput, TransferPostingInput } from "./validation.js"

async function loadOpenFolio(db: FoliosDb, folioId: string) {
  const [folio] = await db.select().from(folios).where(eq(folios.id, folioId)).limit(1)
  if (!folio) {
    throw new ApiHttpError(`folio ${folioId} not found`, { status: 404, code: "not_found" })
  }
  if (folio.status !== "open") {
    throw new ApiHttpError(`folio ${folioId} is ${folio.status}; cannot post to it`, {
      status: 409,
      code: "folio_not_open",
    })
  }
  return folio
}

export async function listPostings(db: FoliosDb, folioId: string): Promise<FolioPostingRow[]> {
  return db
    .select()
    .from(folioPostings)
    .where(eq(folioPostings.folioId, folioId))
    .orderBy(folioPostings.businessDate)
}

/** Append a manual posting to an OPEN folio. Payments carry the upstream ref. */
export async function createPosting(
  db: FoliosDb,
  folioId: string,
  input: CreatePostingInput,
  userId?: string,
): Promise<FolioPostingRow> {
  const folio = await loadOpenFolio(db, folioId)
  const [row] = await db
    .insert(folioPostings)
    .values({
      folioId,
      businessDate: input.businessDate,
      type: input.type,
      description: input.description,
      amountCents: input.amountCents,
      currency: folio.currency,
      quantity: input.quantity,
      unitAmountCents: input.unitAmountCents ?? null,
      source: input.type === "payment" && input.paymentRef ? "payment_sync" : "manual",
      // A payment carries its upstream payment id as the idempotency key so a
      // re-synced payment never double-posts (ADR 0001).
      sourceKey:
        input.type === "payment" && input.paymentRef ? `payment:${input.paymentRef}` : null,
      metadata: input.metadata ?? null,
      createdBy: userId ?? null,
    })
    .returning()
  return row
}

async function loadPosting(db: FoliosDb, postingId: string): Promise<SourcePosting> {
  const [row] = await db
    .select()
    .from(folioPostings)
    .where(eq(folioPostings.id, postingId))
    .limit(1)
  if (!row) {
    throw new ApiHttpError(`posting ${postingId} not found`, { status: 404, code: "not_found" })
  }
  return row
}

/** Void a posting: append a same-type reversal (idempotent by `void:<id>`). */
export async function voidPosting(
  db: FoliosDb,
  postingId: string,
  userId?: string,
): Promise<FolioPostingRow> {
  const original = await loadPosting(db, postingId)
  await loadOpenFolio(db, original.folioId) // only void on an open folio
  const reversal = buildVoidPosting(original, userId ?? null)
  const [row] = await db
    .insert(folioPostings)
    .values(reversal as NewPostingRow)
    .onConflictDoNothing({ target: folioPostings.sourceKey })
    .returning()
  if (row) return row
  // Already voided — return the existing reversal (idempotent).
  const [existing] = await db
    .select()
    .from(folioPostings)
    .where(eq(folioPostings.sourceKey, reversal.sourceKey as string))
    .limit(1)
  return existing
}

export interface TransferResult {
  reversal: FolioPostingRow
  copy: FolioPostingRow
}

/**
 * Move a posting to another folio: reversal on the source + copy on the target,
 * linked by a shared transfer key (idempotent). Both folios must be open, both in
 * the same currency, and the target must differ from the source.
 */
export async function transferPosting(
  db: FoliosDb,
  sourceFolioId: string,
  input: TransferPostingInput,
  userId?: string,
): Promise<TransferResult> {
  const original = await loadPosting(db, input.postingId)
  if (original.folioId !== sourceFolioId) {
    throw new ApiHttpError(`posting ${input.postingId} does not belong to folio ${sourceFolioId}`, {
      status: 409,
      code: "posting_folio_mismatch",
    })
  }
  if (input.targetFolioId === sourceFolioId) {
    throw new ApiHttpError("cannot transfer a posting to the same folio", {
      status: 409,
      code: "transfer_same_folio",
    })
  }
  const source = await loadOpenFolio(db, sourceFolioId)
  const target = await loadOpenFolio(db, input.targetFolioId)
  if (source.currency !== target.currency) {
    throw new ApiHttpError("cannot transfer between folios in different currencies", {
      status: 409,
      code: "transfer_currency_mismatch",
    })
  }

  const { reversal, copy } = buildTransferPostings(original, input.targetFolioId, userId ?? null)
  const inserted = await db
    .insert(folioPostings)
    .values([reversal, copy] as NewPostingRow[])
    .onConflictDoNothing({ target: folioPostings.sourceKey })
    .returning()

  // On a re-issued (already-applied) transfer the inserts no-op; read both legs.
  const byKey = async (key: string) =>
    inserted.find((r) => r.sourceKey === key) ??
    (await db.select().from(folioPostings).where(eq(folioPostings.sourceKey, key)).limit(1))[0]

  return {
    reversal: await byKey(reversal.sourceKey as string),
    copy: await byKey(copy.sourceKey as string),
  }
}
