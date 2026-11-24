/**
 * phev.js — PHEV fuel vs electric calculator
 * Volvo XC60 T6 Recharge · Gothenburg fuel prices · Volvo CSV import
 */

import { parseVolvoCsv } from './csv-parser.js';

const STATE_KEY      = 'mytools_phev_v3';
// Same-origin data file — updated daily by GitHub Actions (no CORS issues)
const FUEL_PRICE_URL = './data/fuel-price.json';
const FUEL_MAX_AGE_MS = 48 * 60 * 60 * 1000;

// XC60 T6 Recharge — conservative real-world defaults (not WLTP)
const DEFAULTS = {
  fuelPrice:  16.05,  // SEK/l — Göteborg average Jul 2026 (not cheapest station)
  fuelSource: 'auto',
  fuelEff:     6.94,  // l/100km — real-world average from trip logs
  elecEff:    15.69,  // kWh/100km — real-world average from trip logs
  elecPrice:   1.70,  // SEK/kWh — Volvo home charger plan
  monthlyKm:  1200,   // km/month
  elecPct:      70,   // % of km on electric
};

let S = { ...DEFAULTS };
let fuelRequest = 0;
let importRequest = 0;
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
    if (saved && typeof saved === 'object') {
      S = { ...DEFAULTS, ...saved };
      // Older saves cannot distinguish a manual price from a station snapshot.
      if (!saved.fuelSource && Number.isFinite(saved.fuelPrice)) S.fuelSource = 'manual';
    }
  } catch (_) {}
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(S));
}

// ── Core calculation ─────────────────────────────────────
function calculate() {
  const { fuelPrice, fuelEff, elecEff, elecPrice, monthlyKm } = S;

  const elecFraction = S.elecPct / 100;

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
      if (Number.isFinite(v)) {
        S[stateKey] = v;
        if (stateKey === 'fuelPrice') {
          fuelRequest += 1;
          S.fuelSource = 'manual';
          showManualFuelPrice();
        }
        saveState();
        calculate();
      }
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

  $('fetch-fuel-btn')?.addEventListener('click', () => loadFuelPriceFile(true));

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
 * Keeps the current calculator value when no usable snapshot is available.
 */
function showManualFuelPrice() {
  const src = $('fuel-source');
  if (!src) return;
  src.textContent = 'Manual fuel price';
  src.className = 'source-text source-manual';
}

async function loadFuelPriceFile(explicit = false) {
  if (!explicit && S.fuelSource === 'manual') {
    showManualFuelPrice();
    return;
  }
  const request = ++fuelRequest;
  const src = $('fuel-source');
  try {
    const res = await fetch(FUEL_PRICE_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (request !== fuelRequest) return;

    const price = data.median ?? data.average ?? data.cheapest;
    if (!Number.isFinite(price) || price < 5 || price > 30) throw new Error('Invalid price data');

    const timestamp = Date.parse(data.updatedAt);
    const age = Date.now() - timestamp;
    const stale = !(age >= 0 && age < FUEL_MAX_AGE_MS);
    const apply = explicit || !stale;
    if (apply) {
      S.fuelPrice = price;
      S.fuelSource = 'auto';
      setVal('fuel-price-input', price);
      saveState();
      calculate();
    }

    if (src) {
      const cached = res.headers.get('X-Fuel-Cache') === 'hit';
      const dateStr = Number.isFinite(timestamp)
        ? new Date(timestamp).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
        : 'unknown';
      const status = stale ? 'Stale · ' : cached ? 'Cached · ' : '';
      const kept = apply ? '' : ' · current price kept';
      src.textContent = `${status}bensinpriser.nu GBG · ${data.stationCount ?? '?'} stationer · upd ${dateStr}${kept}`;
      src.className = `source-text ${stale || cached ? 'source-cached' : 'source-live'}`;
    }
  } catch (error) {
    if (request !== fuelRequest) return;
    console.warn('Could not load the fuel snapshot', error);
    if (src) {
      src.textContent = 'Fuel update unavailable · current price kept; enter your actual price manually';
      src.className   = 'source-text source-manual';
    }
  }
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
  const request = ++importRequest;
  try {
    const buf    = await file.arrayBuffer();
    if (request !== importRequest) return;
    const result = parseVolvoCsv(buf);

    if (!result.ok) {
      showCsvError(result.error + (result.headersFound
        ? `\n\nHeaders detected: ${result.headersFound}` : ''));
      return;
    }

    const errorEl = $('csv-error');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
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
      note.replaceChildren(document.createTextNode(parts[0]), document.createElement('br'),
        document.createTextNode(parts[1]));
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
    if (request === importRequest) showCsvError(`Unable to import this file: ${err.message}`);
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
  const errorEl = $('csv-error');
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.textContent = `Import failed. Calculator inputs were not replaced.\n${msg}`;
}

// ── Init ─────────────────────────────────────────────────
function init() {
  if (initialized) return;
  initialized = true;

  loadState();
  bindUI();
  restoreInputs();
  loadFuelPriceFile(); // auto-load same-origin JSON, no proxy needed
  calculate();
}

document.addEventListener('DOMContentLoaded', init);
