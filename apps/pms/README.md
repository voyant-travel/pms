# Voyant PMS — Admin Deployment (`apps/pms`)

The PMS deployment app: a single Cloudflare Worker serving the `/v1/*` API and
the SSR admin dashboard (later: the direct-booking storefront). It consumes the
published `@voyant-travel/*` framework packages and composes them via
`createVoyantApp` (see `src/api/app.ts` + `src/api/composition.ts`).

This app was scaffolded from the Voyant operator starter (the proven
`acme-travel/apps/admin` blueprint) as Phase 0 of `docs/PLAN.md`. See the
"Vertical scope" note below for what is kept vs. deferred.

## Stack

- **Runtime**: Cloudflare Workers (Vite + `@cloudflare/vite-plugin`)
- **Framework**: TanStack Start + React 19, `@voyant-travel/framework`
- **DB**: Neon Postgres via the serverless HTTP driver (one secret,
  `DATABASE_URL`; no Hyperdrive binding required)
- **Auth**: Better Auth (`@voyant-travel/auth`)
- **Worker name**: `voyant-pms` (`wrangler.jsonc`)

## Local setup

Prerequisites: Node `>=22`, `pnpm@9`. Install from the repo root:

```bash
pnpm install
```

### Environment

Runtime secrets are provided to `wrangler dev` via `.dev.vars` (git-ignored).
Copy the template and fill it in:

```bash
cp apps/pms/.dev.vars.example apps/pms/.dev.vars
```

Minimum required for local boot (see `.dev.vars.example` + `env.d.ts` for the
full list and docs):

- `DATABASE_URL` — Postgres connection string (Neon or local Postgres).
- `BETTER_AUTH_SECRET`, `SESSION_CLAIMS_SECRET`, `INTERNAL_API_KEY` — generate
  with `openssl rand -base64 32` / `openssl rand -hex 32`.
- `VOYANT_API_KEY` — canonical email/SMS/verify/vault provider (see
  `src/lib/notifications.ts` to swap transports).

Non-secret vars (`APP_URL`, `DASH_BASE_URL`, auth mode, `EMAIL_FROM`) live in
`wrangler.jsonc` under `vars`. The `CACHE` / `RATE_LIMIT` KV namespace IDs and
the R2 bucket names in `wrangler.jsonc` are placeholders — replace them with real
Cloudflare resource IDs before deploying (not required for `pnpm dev`).

### Run

```bash
pnpm --filter pms-admin dev    # Worker + SSR admin on http://localhost:3300
```

### Database migrations

Migrations use the `@voyant-travel/framework-migrations` collector: each
schema-owning package ships its own migrations, applied deps-first, and this
deployment's `./migrations` (link tables + any local module schema) apply last.

```bash
pnpm --filter pms-admin db:generate   # generate deployment migration from schema changes
pnpm --filter pms-admin db:migrate    # apply all migrations (package sources + deployment)
pnpm --filter pms-admin db:push       # push aggregate schema (dev only)
pnpm --filter pms-admin seed          # seed baseline data
```

`DATABASE_URL` must be set (via `.dev.vars`, `.env`, or the environment) for any
`db:*` command.

## Verify

```bash
pnpm --filter pms-admin typecheck     # tsc server + client configs
pnpm --filter pms-admin lint          # biome check (root biome.json)
pnpm --filter pms-admin test          # vitest
```

## Vertical scope (Phase 0)

The PMS keeps the stay-relevant framework modules (accommodations, operations,
bookings, catalog, commerce, crm, finance, transactions, storefront, auth) plus
the standard admin shell.

Tour-shaped verticals inherited from the operator blueprint (cruises, charters,
mice, flights, trips, quotes) are still present and wired in this Phase-0
skeleton. They are deeply woven into the composition registry (which has strict
manifest/count tests), `voyant.config.ts` schema discovery, the generated admin
route files (`src/admin.*.generated.*`), and the admin UI. Removing them safely
is a coordinated change (composition factory removal + `createVoyantApp({ exclude })`
for standard modules per ADR-0007 + regenerating admin routes via
`voyant admin generate` + updating the composition tests) and is deferred to a
later phase to keep the Phase-0 skeleton green. See `docs/PLAN.md` §5.1 / §6.

`packages/plugin-catalog-demo`, `packages/plugin-flights-demo`, and
`packages/realtime-react` are vendored prebuilt (dist-only) demo packages carried
from the blueprint so the app resolves and typechecks; `plugin-flights-demo` is
tour residue to remove alongside the flights vertical.
