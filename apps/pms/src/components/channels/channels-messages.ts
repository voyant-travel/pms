/**
 * English message namespace for the Channels ledger admin page. A single flat
 * catalog keeps strings out of the component — swap for a hook to localize later.
 * Mirrors `folios-messages.ts` / `housekeeping-messages.ts`.
 */

export const channelsMessages = {
  section: "Channels",
  nav: {
    ledger: "Ledger",
  },
  common: {
    loadFailed: "Failed to load",
    none: "—",
    filterAll: "All statuses",
    retry: "Retry ingest",
    retried: "Ingest retried",
  },
  page: {
    title: "Channel connectivity",
    subtitle:
      "Outbound ARI pushes and inbound OTA reservations. Skeleton phase — the reference 'mock' connector is the only one registered.",
    tabs: {
      reservations: "Reservations",
      ariEvents: "ARI events",
    },
  },
  reservations: {
    empty: "No channel reservations yet.",
    colChannel: "Channel",
    colRef: "Channel ref",
    colStatus: "Status",
    colBooking: "Booking",
    colError: "Error",
    status: {
      received: "Received",
      ingested: "Ingested",
      failed: "Failed",
      ignored: "Ignored",
    },
  },
  ariEvents: {
    empty: "No outbound ARI events yet.",
    colChannel: "Channel",
    colRoomType: "Room type",
    colRatePlan: "Rate plan",
    colStatus: "Status",
    colAttempts: "Attempts",
    colError: "Error",
    status: {
      pending: "Pending",
      pushed: "Pushed",
      failed: "Failed",
      skipped: "Skipped",
    },
  },
} as const

export type ChannelsMessages = typeof channelsMessages
