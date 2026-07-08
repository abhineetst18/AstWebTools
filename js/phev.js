/**
 * phev.js — PHEV fuel vs electric calculator
 * Volvo XC60 T6 Recharge · Gothenburg fuel prices · Volvo CSV import
 */

import { parseVolvoCsv } from './csv-parser.js';

const STATE_KEY      = 'mytools_phev_v3';
const FUEL_CACHE_KEY = 'mytools_fuel_cache_v2';
// Same-origin data file — updated daily by GitHub Actions (no CORS issues)
const FUEL_PRICE_URL = './data/fuel-price.json';

// XC60 T6 Recharge — conservative real-world defaults (not WLTP)
const DEFAULTS = {
  fuelPrice:  16.05,  // SEK/l — Göteborg average Jul 2026 (not cheapest station)
  fuelEff:     6.94,  // l/100km — real-world average from trip logs
  elecEff:    15.69,  // kWh/100km — real-world average from trip logs
  elecPrice:   1.70,  // SEK/kWh — Volvo home charger plan
  monthlyKm:  1200,   // km/month
  elecPct:      70,   // % of km on electric
};

let S = { ...DEFAULTS };
let csvStats = null;
let initialized = false;

// ── Helpers ──────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function setVal(id, value, decimals = 2) {
  const el = $(id);
  if (!el) return;
  el.value = typeof value === 'number' ? value.toFixed(decimals) : value;
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

// ── State persistence ────────────────────────────────────
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (saved && typeof saved === 'object') S = { ...DEFAULTS, ...saved };
  } catch (_) {}
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(S));
}

// ── Core calculation ─────────────────────────────────────
function calculate() {
  const { fuelPrice, fuelEff, elecEff, elecPrice, monthlyKm } = S;

  // Real electric % comes from CSV if available, otherwise slider
  const elecFraction = (csvStats?.electricPercent ?? S.elecPct) / 100;

  // Cost per 100 km
  const fuelCost100 = fuelPrice * fuelEff;
  const elecCost100 = elecPrice * elecEff;

  // Break-even: kWh price at which electric == fuel per 100km
  const breakeven = fuelCost100 / elecEff;

  // Relative difference
  const pctDiff = ((fuelCost100 - elecCost100) / fuelCost100) * 100;
  const elecWins = elecCost100 < fuelCost100;

  // Monthly costs
  const elecKm   = monthlyKm * elecFraction;
  const fuelKm   = monthlyKm * (1 - elecFraction);
  const actual   = (elecKm * elecCost100 / 100) + (fuelKm * fuelCost100 / 100);
  const allFuel  = monthlyKm * fuelCost100 / 100;
  const savings  = allFuel - actual;

  renderResults({ fuelCost100, elecCost100, breakeven, pctDiff, elecWins, actual, allFuel, savings });
}

// ── Render ───────────────────────────────────────────────
function renderResults({ fuelCost100, elecCost100, breakeven, pctDiff, elecWins, actual, allFuel, savings }) {
  setText('breakeven-value', breakeven.toFixed(2));

  const badge = $('elec-status');
  if (badge) {
    if (elecWins) {
      badge.textContent = `⚡ Electric is ${Math.round(pctDiff)}% cheaper`;
      badge.className = 'status-badge positive';
    } else {
      badge.textContent = `⛽ Fuel is ${Math.round(-pctDiff)}% cheaper`;
      badge.className = 'status-badge negative';
    }
  }

  setText('fuel-cost-value', Math.round(fuelCost100));
  setText('elec-cost-value', Math.round(elecCost100));

  // Bars — scale to the larger value
  const maxCost = Math.max(fuelCost100, elecCost100, 1);
  const pct = v => Math.max(4, Math.round((v / maxCost) * 100));
  const fuelBar = $('fuel-bar');
  const elecBar = $('elec-bar');
  if (fuelBar) fuelBar.style.width = pct(fuelCost100) + '%';
  if (elecBar) elecBar.style.width = pct(elecCost100) + '%';

  // Monthly
  setText('monthly-savings', Math.round(savings).toLocaleString('sv-SE'));
  setText('monthly-actual',   Math.round(actual).toLocaleString('sv-SE')  + ' SEK');
  setText('monthly-all-fuel', Math.round(allFuel).toLocaleString('sv-SE') + ' SEK');
}

// ── UI binding ───────────────────────────────────────────
function bindUI() {
  function wire(id, stateKey, parser = parseFloat) {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parser(el.value);
      if (Number.isFinite(v)) { S[stateKey] = v; saveState(); calculate(); }
    });
  }

  wire('fuel-price-input',  'fuelPrice');
  wire('elec-eff-input',    'elecEff');
  wire('fuel-eff-input',    'fuelEff');
  wire('elec-price-input',  'elecPrice');
  wire('monthly-km-input',  'monthlyKm', parseInt);

  // Slider with live label
  const slider = $('elec-pct-input');
  if (slider) {
    slider.addEventListener('input', () => {
      S.elecPct = parseInt(slider.value);
      setText('elec-pct-display', S.elecPct + '%');
      saveState();
      calculate();
    });
  }

  // Electricity preset chips
  document.querySelectorAll('[data-elec]').forEach(chip => {
    chip.addEventListener('click', () => {
      const v = parseFloat(chip.dataset.elec);
      S.elecPrice = v;
      setVal('elec-price-input', v);
      saveState();
      calculate();
    });
  });

  $('fetch-fuel-btn')?.addEventListener('click', loadFuelPriceFile);

  setupImportArea();
}

function restoreInputs() {
  setVal('fuel-price-input', S.fuelPrice);
  setVal('elec-eff-input',   S.elecEff,  1);
  setVal('fuel-eff-input',   S.fuelEff,  1);
  setVal('elec-price-input', S.elecPrice);
  setVal('monthly-km-input', S.monthlyKm, 0);
  setVal('elec-pct-input',   S.elecPct,  0);
  setText('elec-pct-display', S.elecPct + '%');
}

// ── Fuel price — from same-origin data file (updated daily by GitHub Actions) ─
/**
 * Loads ./data/fuel-price.json written by the update-fuel-price.yml workflow.
 * No CORS proxy needed — same origin as the GitHub Pages site.
 * Falls back silently if the file is missing (e.g. local dev).
 */
async function loadFuelPriceFile() {
  const src = $('fuel-source');
  try {
    const res = await fetch('./data/fuel-price.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const price = data.median ?? data.average ?? data.cheapest;
    if (!price || price < 5 || price > 30) throw new Error('Invalid price data');

    S.fuelPrice = price;
    setVal('fuel-price-input', price);
    saveState();
    calculate();

    if (src) {
      const updated  = data.updatedAt ? new Date(data.updatedAt) : null;
      const dateStr  = updated
        ? updated.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
        : '?';
      src.textContent = `bensinpriser.nu GBG · ${data.stationCount ?? '?'} stationer · median · upd ${dateStr}`;
      src.className   = 'source-text source-live';
    }
  } catch (_) {
    // Silently fail on local dev (file doesn't exist); default value stays
    if (src && src.className !== 'source-text source-cached') {
      src.textContent = 'Default: GBG avg · enter your actual price manually';
      src.className   = 'source-text source-manual';
    }
  }
}

function tryLoadFuelCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(FUEL_CACHE_KEY));
    if (!cache?.price || !cache?.ts) return;

    const ageMin = Math.round((Date.now() - cache.ts) / 60000);
    if (ageMin > 180) return; // expire after 3 hours

    S.fuelPrice = cache.price;
    setVal('fuel-price-input', cache.price);

    const src = $('fuel-source');
    if (src) {
      const ageStr = ageMin < 2 ? 'just now' : `${ageMin} min ago`;
      src.textContent = `Cached · bensinpriser.nu Göteborg · ${ageStr}`;
      src.className = 'source-text source-cached';
    }
  } catch (_) {}
}

// ── CSV Import ────────────────────────────────────────────
function setupImportArea() {
  const area     = $('import-area');
  const fileInp  = $('csv-file-input');
  if (!area || !fileInp) return;

  area.addEventListener('click', () => fileInp.click());

  fileInp.addEventListener('change', e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
  area.addEventListener('drop', e => {
    e.preventDefault();
    area.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
}

async function handleFile(file) {
  try {
    const buf    = await file.arrayBuffer();
    const result = parseVolvoCsv(buf);

    if (!result.ok) {
      showCsvError(result.error + (result.headersFound
        ? `\n\nHeaders detected: ${result.headersFound}` : ''));
      return;
    }

    csvStats = result;
    renderCsvStats(result);

    // Update efficiency inputs — sanity-check before applying
    const elecSane = result.avgElecEff && result.avgElecEff >= 10 && result.avgElecEff <= 40;
    const fuelSane = result.avgFuelEff && result.avgFuelEff >= 3  && result.avgFuelEff <= 20;

    if (elecSane) {
      S.elecEff = result.avgElecEff;
      setVal('elec-eff-input', result.avgElecEff, 1);
    }
    if (fuelSane) {
      S.fuelEff = result.avgFuelEff;
      setVal('fuel-eff-input', result.avgFuelEff, 1);
    }

    // Show efficiency source diagnostic
    const note = $('eff-note');
    if (note) {
      const parts = [];
      if (elecSane && result.elecEffSource) parts.push(`⚡ ${result.avgElecEff} kWh/100km (${result.elecEffSource})`);
      else parts.push(`⚡ kWh/100km: not found in CSV — using default`);
      if (fuelSane && result.fuelEffSource) parts.push(`⛽ ${result.avgFuelEff} l/100km (${result.fuelEffSource})`);
      else parts.push(`⛽ l/100km: not found in CSV — using default`);
      note.innerHTML = parts.join('<br>');
      note.hidden = false;
    }
    if (result.monthlyKm) {
      S.monthlyKm = result.monthlyKm;
      setVal('monthly-km-input', result.monthlyKm, 0);
    }
    if (result.electricPercent !== null) {
      const pct = Math.round(result.electricPercent);
      S.elecPct = pct;
      setVal('elec-pct-input',   pct, 0);
      setText('elec-pct-display', pct + '%');
    }

    // Update import area text
    const imp = $('import-area');
    if (imp) {
      imp.querySelector('.import-text').innerHTML =
        `<strong>✓ ${result.trips.toLocaleString('sv-SE')} trips imported</strong><br>Click to replace with a different file`;
    }

    saveState();
    calculate();

  } catch (err) {
    showCsvError(`Parse error: ${err.message}`);
  }
}

function renderCsvStats(data) {
  const statsEl = $('csv-stats');
  if (!statsEl) return;
  statsEl.hidden = false;

  const fmtDate = d => d
    ? d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
    : '?';

  setText('csv-date-range',
    `${fmtDate(data.dateRange.from)} – ${fmtDate(data.dateRange.to)}`);
  setText('csv-trips',      data.trips.toLocaleString('sv-SE'));
  setText('csv-total-km',   data.totalKm.toLocaleString('sv-SE') + ' km');
  setText('csv-elec-pct',   data.electricPercent !== null ? data.electricPercent + '%' : 'N/A');
  setText('csv-monthly-km', data.monthlyKm
    ? data.monthlyKm.toLocaleString('sv-SE') + ' km' : 'N/A');
}

function showCsvError(msg) {
  const statsEl = $('csv-stats');
  if (!statsEl) return;
  statsEl.hidden = false;
  const content = statsEl.querySelector('.stat-grid');
  if (content) {
    content.outerHTML = `<p style="color:var(--negative);font-size:13px;line-height:1.5">${msg.replace(/\n/g, '<br>')}</p>`;
  }
}

// ── Init ─────────────────────────────────────────────────
function init() {
  if (initialized) return;
  initialized = true;

  loadState();
  bindUI();
  restoreInputs();
  tryLoadFuelCache();
  loadFuelPriceFile(); // auto-load same-origin JSON, no proxy needed
  calculate();
  setupImportArea();
}

document.addEventListener('DOMContentLoaded', init);
