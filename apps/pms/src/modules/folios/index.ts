/**
 * `pms-folios` — guest folios (operational ledger) + night audit (PLAN §4.4,
 * Phase 5).
 *
 * Owns three deployment-local tables (`pms_folios`, `pms_folio_postings`,
 * `pms_business_dates` — see `schema.ts`). The folio is the OPERATIONAL ledger of
 * a stay or house account (lifecycle open → settled → closed); the upstream
 * `@voyant-travel/finance` package remains the FISCAL ledger. Settlement projects
 * a folio's non-payment postings to ONE finance invoice
 * (docs/adr/0001-folio-finance-settlement-mapping.md). The night audit posts each
 * in-house stay's nightly room + tax charge from upstream `stay_daily_rates`
 * (idempotent by `source_key`), computes the day's KPIs, and rolls the property's
 * business date; it runs nightly via the cron in `entry.ts` + on demand.
 *
 * Auto-discovered by `modulesFromGlob` in `src/api/composition.ts`; the module
 * name `pms/folios` mounts admin routes at `/v1/admin/pms/folios/*`. Pure helpers
 * are re-exported for the admin UI half + the cron job.
 */

import { defineDeploymentModule } from "@voyant-travel/framework"

import { foliosAdminRoutes } from "./routes.js"

export default defineDeploymentModule({
  module: { name: "pms/folios" },
  adminRoutes: foliosAdminRoutes,
})

export {
  chargesBalanceCents,
  type FolioBalanceSummary,
  folioBalanceCents,
  netByType,
  type PostingAmount,
  paidCents,
  summarizeFolio,
} from "./balance.js"
export type { FoliosDb } from "./db.js"
export {
  type AuditStay,
  type NightAuditPlan,
  type PlannedPosting,
  planNightAuditPostings,
  resolveNightlyAmountCents,
  roomSourceKey,
  spansNight,
  taxSourceKey,
} from "./night-audit.js"
export {
  buildDailyReport,
  computeAdrCents,
  computeOccupancy,
  computeRevParCents,
  type DailyReport,
  sumRevenueByType,
} from "./reports.js"
export type {
  BusinessDateRow,
  FolioPostingRow,
  FolioRow,
} from "./schema.js"
export {
  type EnsureStayFolioInput,
  ensureStayFolio,
  type FolioWithPostings,
  getFolioWithPostings,
  nextFolioNumber,
} from "./service-folios.js"
export {
  getOrInitBusinessDate,
  type NightAuditResult,
  readBusinessDate,
  runNightAudit,
} from "./service-night-audit.js"
export { getDailyReport } from "./service-reports.js"
export { closeFolio, type SettleResult, settleFolio } from "./service-settlement.js"
export {
  type BuildFolioInvoiceResult,
  buildFolioInvoiceInput,
  type FolioInvoiceInput,
  type FolioInvoiceLine,
  invoiceNumberForFolio,
} from "./settlement.js"
export {
  buildTransferPostings,
  buildVoidPosting,
  type NewPosting,
  type SourcePosting,
  transferSourceKey,
  voidSourceKey,
} from "./transfer.js"
export * from "./validation.js"
