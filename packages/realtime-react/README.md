# @voyant-travel/realtime-react

Vendored, prebuilt (dist-only) demo dependency carried over from the operator
starter blueprint. It provides the React realtime provider/connector bindings
(channel subscriptions + query-key invalidation hints) the `apps/pms` admin
imports so the app resolves and typechecks.

## Why it is committed

This package has **no `src/`** — only a published `dist/` bundle — and is marked
`private`. It is vendored into the repo (rather than installed from npm) to keep
the deployment self-contained while the PMS is bootstrapped from the blueprint.
It exposes `./provider`, `./connector`, `./connector-cloud`, and `./query-keys`
subpaths and peers on `@tanstack/react-query` and `react`.

## Removal-candidate status

This is a removal candidate. Realtime is optional and inert unless enabled in the
deployment; if the PMS does not ship realtime UI, this vendored bundle can be
dropped in favor of the published `@voyant-travel/realtime-react` when required.
It is not part of the PMS domain surface and is not a supported package API.
