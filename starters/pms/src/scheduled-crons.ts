export const HOUSEKEEPING_GENERATE_CRON = "0 6 * * *"
export const NIGHT_AUDIT_CRON = "0 2 * * *"
// Outbound channel ARI push (PLAN §4.7) — every 15 min, offset off the :00/:15
// other scheduled work so it has a unique cron string (entry.ts dispatches by
// exact cron expression). Drains pending `pms_channel_ari_events`.
export const CHANNEL_ARI_PUSH_CRON = "3,18,33,48 * * * *"
