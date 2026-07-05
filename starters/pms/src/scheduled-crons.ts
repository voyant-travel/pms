export const CHANNEL_PUSH_BOOKING_LINK_CRON = "*/15 * * * *"
export const CHANNEL_PUSH_AVAILABILITY_CRON = "0 * * * *"
export const CHANNEL_PUSH_CONTENT_CRON = "0 3 * * *"
export const DRAFT_REAPER_CRON = "5 * * * *"
export const PROMOTION_BOUNDARY_SCHEDULER_CRON = "*/5 * * * *"
export const OUTBOX_DRAIN_CRON = "*/2 * * * *"
export const HOUSEKEEPING_GENERATE_CRON = "0 6 * * *"
export const NIGHT_AUDIT_CRON = "0 2 * * *"
// Outbound channel ARI push (PLAN §4.7) — every 15 min, offset off the :00/:15
// distribution reconcilers so it does not share a cron STRING with them (entry.ts
// dispatches by exact cron expression). Drains pending `pms_channel_ari_events`.
export const CHANNEL_ARI_PUSH_CRON = "3,18,33,48 * * * *"
