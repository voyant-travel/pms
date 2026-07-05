# @voyant-travel/plugin-catalog-demo

Vendored, prebuilt (dist-only) demo dependency carried over from the operator
starter blueprint. It provides the demo-data catalog wiring the `apps/pms`
deployment expects so the app resolves, typechecks, and boots with sample
inventory.

## Why it is committed

This package has **no `src/`** — only a published `dist/` bundle — and is marked
`private`. It is vendored into the repo (rather than installed from npm) to keep
the deployment self-contained while the PMS is bootstrapped from the blueprint.

## Removal-candidate status

This is a removal candidate. Once the PMS supplies its own demo/seed data (or
the demo wiring is no longer needed), this package can be dropped. It is not part
of the PMS domain surface and is not a supported package API.
