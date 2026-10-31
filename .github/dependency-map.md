# ZP3-AstWebTools — Dependency Map

Static PWA ("My Tools"), no build step. Served as-is; `sw.js` caches the app shell.

## Files

| File | Role | Consumed by |
|------|------|-------------|
| `index.html` | All views, CSS tokens, DOM ids used by every module | `js/*.js` (by element id) |
| `js/app.js` | View routing (`VIEWS`), theme toggle | `index.html` |
| `js/phev.js` | PHEV cost calculator | `index.html`; imports `csv-parser.js`; fetches `data/fuel-price.json` |
| `js/csv-parser.js` | Volvo trip CSV parsing | `phev.js` |
| `data/fuel-price.json` | Göteborg fuel price, updated daily by `.github/workflows/update-fuel-price.yml` | `phev.js` (network-first in `sw.js`) |
| `js/banana-cake.js` | Banana cake formulation, recipe text, consistency check, bake-log UI | `index.html`; imports `bake-history.js` |
| `js/bake-history.js` | Pure bake-history model: records, validation, persistence, calibration evidence | `banana-cake.js`, tests |
| `sw.js` | Cache-first app shell (`SHELL`), network-first `/data/` | browser |
| `tests/banana-cake.test.mjs` | `node --test tests/*.test.mjs` acceptance tests | — |

**Mutation trigger:** changing or adding any shell JS file requires updating `SHELL` and bumping `CACHE` in `sw.js`, otherwise installed PWAs keep serving the old file.

## Banana cake contracts

- `ANCHORS` (banana-cake.js) hold the **calculated** (pre-calibration) quantities of tested bakes: 200, 270, 320 and 450 g. Between anchors values are linearly interpolated. Below 200 g they are scaled proportionally from the 200 g anchor (linear extrapolation drives milk and oil negative). Above 450 g the last segment is extrapolated.
- Spoon measures round to ⅛ tsp (`formatTsp`).
- `bananaCondition` (`normal` | `wet`) **never changes the calculated flour**. It only adds a warning and selects which bake-history evidence applies.
- Every generated method contains the `CONSISTENCY CHECK (mandatory, before baking)` step, before `Bake at…`. The tests assert this.
- Bake record (`localStorage['mytools_bananacake_history_v1']`, max 50): `{ id, reference, date, banana, condition, blueberriesG, calculatedFlourG, addedFlourG, actualFlourG = calculated + added, addedMilkMl, outcome: good|dense|wet|sunk, notes }`.
- `REFERENCE_BAKES` ship observed bakes (200 g wet: 125 → 155 g flour). `adjustmentEvidence` uses only `outcome === 'good'` bakes with the same condition and within ±25% banana weight. It scales each bake's added/calculated flour ratio to the current batch and reports a min–max range. It is shown as "set aside", never auto-added.
- UI state: `localStorage['mytools_bananacake_v1']` (inputs, incl. `bananaCondition`).
