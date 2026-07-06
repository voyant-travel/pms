# Evidence — Rates & availability calendar usability fixes

All screenshots captured with Chrome DevTools at a 1440px-wide viewport (except
the tape-chart mid-scroll shot, taken at a narrowed width to force the grid to
overflow, since it fits without scrolling at 1440px). Property: **Acme Grand
Hotel** (`/ari/calendar`), which has the long "Non-refundable — Room Only"
labels. Today = 2026-07-06.

| File | What it shows |
| --- | --- |
| `01-before-at-rest-1440.png` | BEFORE — calendar at rest. Every capacity cell repeats "open" (noise); "Non-refundable — Room Only" wraps to two lines; no today marker; weak section headers. |
| `02-before-midscroll-bleed-1440.png` | BEFORE — grid scrolled ~400px right. Section-header sticky cells were translucent (0.2 alpha), the defect this task fixes. |
| `03-after-at-rest-1440.png` | AFTER — at rest. Capacity number is prominent with a quiet open-state dot; labels sit on one line with a consistent right-aligned currency tag; opaque/stronger room-type headers; **today (Mon 06) header is ringed/tinted**; stronger weekend tint; larger price text. |
| `04-after-midscroll-nobleed-1440.png` | AFTER — grid scrolled ~400px right. The sticky left column (header, section rows, label rows) is fully opaque; no scrolled content bleeds through. |
| `05-after-closed-state-1440.png` | AFTER — a capacity cell toggled Closed (Classic Double / Wed 08): the number is struck-through/muted with a red "CLOSED" label and a subtle red cell tint. Toggle behavior unchanged. |
| `06-tape-chart-at-rest-1440.png` | Tape chart (`/front-desk/tape-chart`) at rest — the same sticky-column pattern was audited here; section headers are now opaque. |
| `07-tape-chart-midscroll-nobleed.png` | Tape chart scrolled right (viewport narrowed to force overflow). Stay bars scroll cleanly under the opaque sticky Unit column — no bleed. |

## Behavior verified (not just static screenshots)

- **Inline inventory edit persists**: toggled a capacity cell Closed, reloaded — still Closed.
- **Inline rate edit persists**: edited a rate 120 → 125, reloaded — 125 present; then reverted to 120.
- **Bulk update works**: ran a bulk Availability update (Classic Double, capacity 18) — dialog reported success and the calendar reflected it.

## Lanes

- `pnpm typecheck` — pass
- `pnpm --filter pms-admin lint` — pass
- `pnpm --filter pms-admin test` — 339 passed / 2 skipped (baseline preserved)
- `pnpm --filter pms-admin build` — pass
