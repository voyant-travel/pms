/**
 * Human date formatting for the admin surfaces. Guests and front-desk staff read
 * "Mon, 6 Jul 2026", never "2026-07-06". Dates arrive as ISO `YYYY-MM-DD` day
 * strings (no time / zone); we parse them as UTC noon to avoid any local-timezone
 * date rollover, and fall back to the raw string if it is not a valid date.
 */

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
})

/** Format an ISO `YYYY-MM-DD` day as e.g. "Mon, 6 Jul 2026". */
export function formatDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12))
  if (Number.isNaN(date.getTime())) return iso
  return DAY_FORMAT.format(date)
}

/** Format an inclusive ISO day range as e.g. "Mon, 6 Jul 2026 – Wed, 8 Jul 2026". */
export function formatDayRange(fromIso: string, toIso: string): string {
  return `${formatDay(fromIso)} – ${formatDay(toIso)}`
}
