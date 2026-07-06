/**
 * Copy for the hotel dashboard (the property-scoped daily overview at `/`).
 *
 * All staff-facing wording uses the Reservations register (see
 * `src/lib/reservation-terminology.ts`): the record hotel staff manage is a
 * "reservation", never a guest-voice "booking". Hotel language throughout
 * (arrivals, departures, in-house, housekeeping, folios, ADR/RevPAR).
 *
 * Kept as a plain object (not the package i18n catalog) to mirror the sibling
 * `*-messages.ts` files in `front-desk` / `folios` / `housekeeping`.
 */

export const dashboardMessages = {
  title: "Dashboard",
  subtitle: "Today at a glance",
  /** Shown as the business-date chip label. */
  businessDate: "Business date",
  common: {
    loading: "Loading…",
    loadFailed: "Couldn't load this panel. Try again in a moment.",
    none: "Select a property to see its daily overview.",
    noProperties: "No properties found. Create a property first.",
    viewAll: "View all",
    dash: "—",
  },
  kpi: {
    occupancy: "Occupancy",
    occupancyHint: (occupied: number, sellable: number) => `${occupied} of ${sellable} rooms`,
    arrivals: "Arrivals",
    arrivalsHint: (unassigned: number) =>
      unassigned === 0 ? "All assigned" : `${unassigned} unassigned`,
    departures: "Departures",
    departuresHint: "Checking out today",
    inHouse: "In-house",
    inHouseHint: "Staying tonight",
    adr: "ADR",
    adrHint: "Average daily rate",
    revpar: "RevPAR",
    revparHint: "Revenue per available room",
  },
  frontDesk: {
    title: "Front desk",
    arrivals: "Arrivals",
    departures: "Departures",
    noArrivals: "No arrivals for this date.",
    noDepartures: "No departures for this date.",
    assign: "Assign",
    unit: (unitNumber: string) => `Room ${unitNumber}`,
    viewBoards: "Front desk boards",
  },
  housekeeping: {
    title: "Housekeeping",
    openTasks: "Open tasks",
    inProgressTasks: "In progress",
    rooms: "Rooms",
    dirty: "Dirty",
    clean: "Clean",
    inspected: "Inspected",
    untracked: "Not set",
    maintenance: "Active maintenance",
    noTasks: "No open tasks — housekeeping is clear.",
    viewBoard: "Housekeeping board",
    viewMaintenance: "Maintenance",
  },
  revenue: {
    title: "Revenue",
    byType: "Today's revenue",
    openBalances: "Open folio balances",
    openBalancesHint: (count: number) => (count === 1 ? "1 open folio" : `${count} open folios`),
    noRevenue: "No revenue posted for the business date yet.",
    postedNote: "Room charges post at the nightly audit.",
    viewFolios: "Folios",
    viewReports: "Daily report",
  },
  recent: {
    title: "Recent reservations",
    subtitle: "Latest across all properties",
    empty: "No reservations yet.",
    newReservation: "New reservation",
    viewAll: "All reservations",
  },
  /** Revenue posting-type labels (mirrors the folios detail register). */
  postingType: {
    room: "Room",
    tax: "Tax",
    fee: "Fee",
    extra: "Extra",
    adjustment: "Adjustment",
    payment: "Payment",
    transfer: "Transfer",
  } as Record<string, string>,
  /** Reservation status badge labels (staff-facing register). */
  reservationStatus: {
    draft: "Draft",
    on_hold: "On hold",
    awaiting_payment: "Awaiting payment",
    confirmed: "Confirmed",
    in_progress: "In-house",
    completed: "Checked out",
    expired: "Expired",
    cancelled: "Cancelled",
  } as Record<string, string>,
  /** Reservation source labels (direct vs OTA and friends). */
  reservationSource: {
    direct: "Direct",
    manual: "Front desk",
    affiliate: "Affiliate",
    ota: "OTA",
    reseller: "Reseller",
    api_partner: "API",
    internal: "Internal",
  } as Record<string, string>,
} as const
