/**
 * Translate raw server/validation error strings into hotel-staff-friendly toast
 * copy. Zod v4 surfaces technical messages like
 * `"Too small: expected number to be >=0"` straight through the API error body;
 * a front-desk supervisor should never see that. `mapValidationMessage` matches
 * the known technical shapes and returns plain English; anything it doesn't
 * recognise (e.g. a domain message such as "Folio not found") is passed through
 * unchanged so we never hide a meaningful server message.
 */

/**
 * Map a single known technical validation message to friendly copy, or return
 * `null` when the message is not a recognised zod/technical string (callers
 * then keep the original message).
 */
export function mapValidationMessage(message: string): string | null {
  const msg = message.trim()

  // zod v4 number/length lower-bound: "Too small: expected number to be >=0"
  const tooSmall = msg.match(/^too small.*?(?:>=?|greater than or equal to)\s*(-?\d+(?:\.\d+)?)/i)
  if (tooSmall) return `That value is too low — it must be at least ${tooSmall[1]}.`
  if (/^too small/i.test(msg)) return "That value is too low."

  // zod v4 upper-bound: "Too big: expected number to be <=100"
  const tooBig = msg.match(/^too big.*?(?:<=?|less than or equal to)\s*(-?\d+(?:\.\d+)?)/i)
  if (tooBig) return `That value is too high — it must be at most ${tooBig[1]}.`
  if (/^too big/i.test(msg)) return "That value is too high."

  // "Invalid input: expected number, received nan" / "...received undefined"
  if (/expected number.*received (nan|undefined|null|string)/i.test(msg))
    return "Please enter a valid number."
  if (/expected (date|string|boolean).*received/i.test(msg))
    return "Please check that field and try again."

  if (/^required$/i.test(msg) || /is required/i.test(msg))
    return "Please fill in the required fields."
  if (/^invalid input/i.test(msg)) return "Please check the highlighted fields and try again."
  if (/^invalid/i.test(msg) && /uuid|email|url|enum/i.test(msg))
    return "Please check that field and try again."

  return null
}

/**
 * Resolve any thrown value into user-facing toast copy: a friendly-mapped
 * validation string when recognised, otherwise the original message, falling
 * back to `fallback` for non-Error throws or empty messages.
 */
export function toFriendlyError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : ""
  if (!message) return fallback
  return mapValidationMessage(message) ?? message
}
