/**
 * Pure view-model helpers that turn a stored pricing rule into the plain-language
 * strings the Pricing page shows a non-technical manager ("Jun 1 – Aug 31 · +60%
 * · All rooms"). Kept dependency-free so the phrasing is unit-tested without
 * rendering React.
 */

export interface RuleView {
  kind: "season" | "weekday"
  fromDate: string | null
  toDate: string | null
  weekdays: number[] | null
  adjustmentType: "percent" | "absolute" | "set"
  adjustmentValue: number
  roomTypeIds: string[] | null
  ratePlanIds: string[] | null
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
/** ISO weekday (1=Mon … 7=Sun) → short label. Index 0 unused. */
const WEEKDAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const CURRENCY_SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", RON: "lei " }

/** Format integer cents as a friendly amount, e.g. 18000 EUR → "€180", 18050 → "€180.50". */
export function formatCents(cents: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `
  const whole = cents / 100
  const text = Number.isInteger(whole) ? String(whole) : whole.toFixed(2)
  return `${symbol}${text}`
}

/** Format a min–max cents range, collapsing equal bounds ("€120–€207" / "€180"). */
export function formatCentsRange(min: number | null, max: number | null, currency: string): string {
  if (min === null || max === null) return "—"
  if (min === max) return formatCents(min, currency)
  return `${formatCents(min, currency)}–${formatCents(max, currency)}`
}

/** "+60%", "-15%", "+€30", "-€30", "Set €120". */
export function adjustmentSummary(rule: RuleView, currency = "EUR"): string {
  const v = rule.adjustmentValue
  switch (rule.adjustmentType) {
    case "percent":
      return `${v >= 0 ? "+" : ""}${v}%`
    case "absolute":
      return `${v >= 0 ? "+" : "-"}${formatCents(Math.abs(v), currency)}`
    case "set":
      return `Set ${formatCents(v, currency)}`
  }
}

function formatDate(iso: string, withYear: boolean): string {
  const [y, m, d] = iso.split("-").map(Number)
  const base = `${MONTHS[m - 1]} ${d}`
  return withYear ? `${base}, ${y}` : base
}

/** "Jun 1 – Aug 31" (season) or "Fri & Sat" / "Mon–Fri" / "Every day" (weekday). */
export function whenSummary(rule: RuleView): string {
  if (rule.kind === "season") {
    if (!rule.fromDate || !rule.toDate) return "Any dates"
    const sameYear = rule.fromDate.slice(0, 4) === rule.toDate.slice(0, 4)
    return `${formatDate(rule.fromDate, !sameYear)} – ${formatDate(rule.toDate, true)}`
  }
  const days = [...(rule.weekdays ?? [])].sort((a, b) => a - b)
  if (days.length === 0) return "No days"
  if (days.length === 7) return "Every day"
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1)
  if (contiguous && days.length >= 3) {
    return `${WEEKDAY_SHORT[days[0]]}–${WEEKDAY_SHORT[days[days.length - 1]]}`
  }
  return days.map((d) => WEEKDAY_SHORT[d]).join(" & ")
}

/**
 * "All rooms", "Grand only", "Deluxe & Suite", "3 room types", optionally with a
 * plan clause. `nameOf` resolves an id to a display name (falls back to the id).
 */
export function scopeSummary(
  rule: RuleView,
  roomTypeName: (id: string) => string,
  ratePlanName: (id: string) => string,
): string {
  const rooms = rule.roomTypeIds
  let roomPart: string
  if (!rooms || rooms.length === 0) {
    roomPart = "All rooms"
  } else if (rooms.length === 1) {
    roomPart = `${roomTypeName(rooms[0])} only`
  } else if (rooms.length <= 3) {
    roomPart = rooms.map(roomTypeName).join(" & ")
  } else {
    roomPart = `${rooms.length} room types`
  }

  const plans = rule.ratePlanIds
  if (!plans || plans.length === 0) return roomPart
  const planPart = plans.length === 1 ? ratePlanName(plans[0]) : `${plans.length} rate plans`
  return `${roomPart} · ${planPart}`
}

/** The full one-line summary: "Jun 1 – Aug 31 · +60% · All rooms". */
export function ruleSummaryLine(
  rule: RuleView,
  roomTypeName: (id: string) => string = (id) => id,
  ratePlanName: (id: string) => string = (id) => id,
): string {
  return [
    whenSummary(rule),
    adjustmentSummary(rule),
    scopeSummary(rule, roomTypeName, ratePlanName),
  ].join(" · ")
}
