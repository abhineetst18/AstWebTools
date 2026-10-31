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
| `js/banana-cake.js` | Banana cake formulation, recipe text, consistency check | `index.html`, tests |
| `sw.js` | Cache-first app shell (`SHELL`), network-first `/data/` | browser |
| `tests/banana-cake.test.mjs` | `node --test tests/*.test.mjs` acceptance tests | — |

**Mutation trigger:** changing or adding any shell JS file requires updating `SHELL` and bumping `CACHE` in `sw.js`, otherwise installed PWAs keep serving the old file.

## Banana cake contracts

- `ANCHORS` (banana-cake.js) hold the **calculated** (pre-calibration) quantities of tested bakes: 200, 270, 320 and 450 g. Between anchors values are linearly interpolated. Below 200 g they are scaled proportionally from the 200 g anchor (linear extrapolation drives milk and oil negative). Above 450 g the last segment is extrapolated.
- Spoon measures round to ⅛ tsp (`formatTsp`).
- `bananaCondition` (`normal` | `wet`) **never changes the calculated flour**. `wet` only adds a warning that cites the one observed 200 g wet-banana bake (+30 g, 125 → 155 g) as an example, not a rule.
- Every generated method contains the `CONSISTENCY CHECK (mandatory, before baking)` step, before `Bake at…`. The tests assert this.
- No bake history is stored. UI state only: `localStorage['mytools_bananacake_v1']` (inputs, incl. `bananaCondition`).
