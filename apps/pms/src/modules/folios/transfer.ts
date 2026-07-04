/**
 * PURE reversal + transfer posting builders (PLAN §4.4). Postings are immutable
 * (no update/delete): a void appends a reversal of the same type with the negated
 * amount; a transfer appends a same-type reversal on the source folio plus a
 * matching copy on the target. Both link back via `reversalOfId` and a shared
 * deterministic `sourceKey` (idempotency + audit). No db — the service persists
 * the returned rows with ON CONFLICT DO NOTHING.
 */

/** The subset of an existing posting a reversal/copy is derived from (structural). */
export interface SourcePosting {
  id: string
  folioId: string
  businessDate: string
  type: string
  description: string
  amountCents: number
  currency: string
  quantity: number
  unitAmountCents: number | null
}

/** A new posting row to insert (id + timestamps are defaulted by the schema). */
export interface NewPosting {
  folioId: string
  businessDate: string
  type: string
  description: string
  amountCents: number
  currency: string
  quantity: number
  unitAmountCents: number | null
  source: "night_audit" | "manual" | "transfer" | "payment_sync"
  sourceKey: string | null
  reversalOfId: string | null
  createdBy: string | null
}

/** Deterministic key for a void reversal — one reversal per original posting. */
export function voidSourceKey(originalId: string): string {
  return `void:${originalId}`
}

/** Deterministic key pair for a transfer of a posting to a target folio. */
export function transferSourceKey(originalId: string, targetFolioId: string): string {
  return `transfer:${originalId}:${targetFolioId}`
}

/**
 * Build the reversal posting that voids `original`. Same type + business date, so
 * it nets the original to zero within its type (and thus vanishes from a settled
 * invoice). `amountCents` is negated; `reversalOfId` points at the original.
 */
export function buildVoidPosting(original: SourcePosting, createdBy: string | null): NewPosting {
  return {
    folioId: original.folioId,
    businessDate: original.businessDate,
    type: original.type,
    description: `Void: ${original.description}`,
    amountCents: -original.amountCents,
    currency: original.currency,
    quantity: original.quantity,
    unitAmountCents: original.unitAmountCents === null ? null : -original.unitAmountCents,
    source: "manual",
    sourceKey: voidSourceKey(original.id),
    reversalOfId: original.id,
    createdBy,
  }
}

/**
 * Build the two postings that move `original` to `targetFolioId`: a reversal on
 * the SOURCE folio (negated, `reversalOfId` = original) and a copy on the TARGET
 * folio (same sign). Both carry the shared transfer key, so a re-issued transfer
 * is a no-op. `type` is coerced to `transfer` on both legs so the move is legible
 * on each ledger without inflating room/tax revenue on either side.
 */
export function buildTransferPostings(
  original: SourcePosting,
  targetFolioId: string,
  createdBy: string | null,
): { reversal: NewPosting; copy: NewPosting } {
  const key = transferSourceKey(original.id, targetFolioId)
  const reversal: NewPosting = {
    folioId: original.folioId,
    businessDate: original.businessDate,
    type: "transfer",
    description: `Transfer out: ${original.description}`,
    amountCents: -original.amountCents,
    currency: original.currency,
    quantity: 1,
    unitAmountCents: null,
    source: "transfer",
    sourceKey: `${key}:out`,
    reversalOfId: original.id,
    createdBy,
  }
  const copy: NewPosting = {
    folioId: targetFolioId,
    businessDate: original.businessDate,
    type: "transfer",
    description: `Transfer in: ${original.description}`,
    amountCents: original.amountCents,
    currency: original.currency,
    quantity: 1,
    unitAmountCents: null,
    source: "transfer",
    sourceKey: `${key}:in`,
    reversalOfId: original.id,
    createdBy,
  }
  return { reversal, copy }
}
