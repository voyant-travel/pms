/**
 * Small formatting helpers shared by the confirmation + manage-booking
 * surfaces. Pure and locale-tolerant (fall back gracefully when Intl or a
 * date string is unusable) so a single bad value never blanks the page.
 */

export function formatMoney(cents: number | null | undefined, currency: string): string {
  if (cents == null) return "—"
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

/** ISO `YYYY-MM-DD` → e.g. "Sat, 4 Jul 2026". Parsed as UTC to avoid a
 *  timezone shifting a date-only value across a day boundary. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
  } catch {
    return iso
  }
}

/** ISO date → "Sat, 4 Jul" (no year) for compact nightly rows. */
export function formatDayMonth(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    })
  } catch {
    return iso
  }
}
