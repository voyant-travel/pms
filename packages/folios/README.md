# @voyant-travel/pms-folios

The guest ledger and night audit for the Voyant PMS. A **folio** is the
operational account of a stay (or a house account): the running total of room
charges, taxes, extras, fees, payments, and transfers. Postings are immutable
and append-only; the **night audit** posts each in-house stay's nightly room +
tax charge and rolls the property's business date; **settlement** projects a
folio to exactly one upstream finance invoice. The folio is the operational
ledger; `@voyant-travel/finance` remains the fiscal one.

## Status

Pre-release. Part of the PMS package graduation (PLAN §4.4, Phase 5); shaped for
npm publishing but **not yet published**. Consume it as a workspace package.
Depends on `@voyant-travel/pms-units`.

## Install

```jsonc
"dependencies": {
  "@voyant-travel/pms-folios": "workspace:*"
}
```

## Registering the module

The default export is a `ModuleFactory` (via `defineDeploymentModule`). Register
it in the deployment composition; its module name `pms/folios` mounts admin
routes at `/v1/admin/pms/folios/*`.

```ts
import foliosModule from "@voyant-travel/pms-folios"

const pmsDomainModules = {
  folios: foliosModule,
  // …other pms-* modules
}
```

## HTTP routes

All under `/v1/admin/pms/folios`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/folios` | list folios with balances / open a folio |
| GET | `/folios/:id` | fetch a folio with its postings |
| POST | `/folios/:id/postings` | append a posting (immutable) |
| POST | `/folios/:id/transfer` | transfer an amount to another folio (reversal + copy) |
| POST | `/postings/:id/void` | void a posting (appends a reversal, never deletes) |
| POST | `/folios/:id/settle` | settle → mint one finance invoice |
| POST | `/folios/:id/close` | close a settled folio |
| GET | `/business-date` | read a property's current business date |
| POST | `/night-audit/run` | run the night audit for a property |
| GET | `/reports/daily` | daily report (occupancy, ADR, RevPAR, revenue by type) |

### Night audit

`runNightAudit` posts the room + tax charge for every in-house stay from the
upstream `stay_daily_rates`, idempotently by `source_key`, then computes the
day's KPIs and rolls the property's `currentDate` to D+1. It runs nightly via
the deployment's `night-audit` cron and on demand via `POST /night-audit/run`.

### Settlement → finance invoice

Settling a folio creates exactly **one** upstream finance invoice from the
folio's non-payment postings (aggregated to one line per posting type); payments
stay upstream and are mirrored as payment postings. Void/transfer reversals share
the original posting's type, so they net to zero and disappear from the settled
invoice. House-account folios (no upstream booking) settle operationally without
an invoice. See
[docs/adr/0001-folio-finance-settlement-mapping.md](../../docs/adr/0001-folio-finance-settlement-mapping.md).

## Schema

Three deployment-local tables (`./schema` subpath), migrated as deployment
sources after the framework bundle. Cross-module refs are loose typeid columns;
the one real FK is intra-module (`folio_postings.folio_id → folios.id`).

| Table | TypeID prefix | Notes |
| --- | --- | --- |
| `pms_folios` | `folo` | one ledger per stay item or house account; lifecycle `open → settled → closed` (+ `voided`); `finance_invoice_id` set at settlement |
| `pms_folio_postings` | `fpst` | immutable signed ledger lines (`room`/`tax`/`fee`/`extra`/`payment`/`adjustment`/`transfer`); idempotent `source_key`; `reversal_of_id` self-ref |
| `pms_business_dates` | `bizd` | one rolling business date per property |

## Key exports

- `default` — the `pms/folios` module factory.
- Balance math: `summarizeFolio`, `folioBalanceCents`, `chargesBalanceCents`,
  `paidCents`, `netByType`.
- Night audit: `planNightAuditPostings`, `resolveNightlyAmountCents`,
  `spansNight`, `roomSourceKey`, `taxSourceKey`, `runNightAudit`,
  `getOrInitBusinessDate`, `readBusinessDate`.
- Settlement: `settleFolio`, `closeFolio`, `buildFolioInvoiceInput`,
  `invoiceNumberForFolio` and the `FolioInvoice*` types.
- Transfers/voids: `buildTransferPostings`, `buildVoidPosting`,
  `transferSourceKey`, `voidSourceKey`.
- Reports: `buildDailyReport`, `computeOccupancy`, `computeAdrCents`,
  `computeRevParCents`, `sumRevenueByType`.
- Folio services (`ensureStayFolio`, `getFolioWithPostings`,
  `listFoliosWithBalances`, `nextFolioNumber`), the row types, and the validation
  schemas.

## Testing

```bash
pnpm --filter @voyant-travel/pms-folios test
```

## License

Apache-2.0.
