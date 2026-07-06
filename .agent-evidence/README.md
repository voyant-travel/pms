# Layout fix evidence — admin calendar grids fill their container width

Fixes the dead gap to the right of the last date column in the two admin
calendar grids by switching both tables from `w-max` (natural content width) to
`table-fixed` + `w-full`, with an inline `min-width`/`max-width` computed from
the number of date columns.

- **min-width** = `stickyColPx + dates.length × MIN_COL_PX` — the floor below
  which the container scrolls horizontally (sticky first column preserved).
- **max-width** = `stickyColPx + dates.length × MAX_COL_PX` — the cap beyond
  which columns stop growing and the table left-aligns (right gap only on
  absurdly wide viewports).

Column width cap chosen: **MAX_COL_PX = 140px** (inside the 120–160px sweet
spot). On the 14-day tape chart it yields ~70px/col at 1440px and ~104px/col at
1920px — both under the cap, so the grid fills the container cleanly; the cap
only engages past ~2100px.

## Screenshots

| File | Surface | Width | State |
| --- | --- | --- | --- |
| 01-tape-chart-1440-before.png | Tape chart (Acme Grand Hotel) | 1440 | before — dead gap right of "Sun 19" |
| 02-tape-chart-1920-before.png | Tape chart | 1920 | before — large dead gap |
| 05-tape-chart-1440-after.png | Tape chart | 1440 | after — columns fill to right edge |
| 06-tape-chart-1920-after.png | Tape chart | 1920 | after — columns fill to right edge |
| 03-ari-calendar-1440-before.png | ARI calendar | 1440 | before |
| 04-ari-calendar-1920-before.png | ARI calendar | 1920 | before |
| 07-ari-calendar-1440-after.png | ARI calendar | 1440 | after |
| 08-ari-calendar-1920-after.png | ARI calendar | 1920 | after |
| 09-tape-chart-900-scroll-sticky.png | Tape chart | 900 | scrolled right, sticky Unit column pinned |
| 10-ari-calendar-900-scroll-sticky.png | ARI calendar | 900 | scrolled right, sticky Property column pinned |

## Notes

- The ARI calendar renders a full month (31 columns). At 1440px and 1920px the
  columns already exceed the viewport, so the grid scrolls (no dead gap) both
  before and after — the 1440/1920 before/after ARI screenshots are therefore
  pixel-identical. The dead-gap defect on that grid only appears past ~1944px;
  the same fix handles it there. The tape chart (14 columns) is where the defect
  is clearly visible at 1440/1920, and those before/after shots differ.
- Verified live: tape-chart table width == container width at 1920 (2px border
  only, no scroll); horizontal scroll + sticky first column work at ~900px on
  both grids; guest **Maria Ionescu**'s stay bar still spans its correct nights
  (one occupancy cell 2026-07-06 in unit 101, `colSpan=1`); an ARI inline rate
  edit (120 → 125) persisted across a reload (PUT `.../ari/calendar/rates` 200),
  then reverted to 120.
- No new console errors: the only console errors are pre-existing infra noise
  (`/api/v1/admin/realtime/token` 500 + CORS allowlist warnings), present on the
  first "before" load and unrelated to a CSS-only change.
