/**
 * csv-parser.js — Parse Volvo Cars app trip export CSV
 *
 * File format: UTF-16 BE or LE with BOM, semicolon-delimited.
 *
 * KEY INSIGHT: The Volvo Cars app exports efficiency RATES per trip
 * (e.g. "Bränsleförbrukning (l/100 km)", "Energiförbrukning (kWh/100 km)"),
 * NOT absolute totals. The parser handles both rate columns and total columns,
 * preferring rate-based data when available since it is more direct.
 */

const COL_ALIASES = {
  distance: [
    'distance (km)', 'distance(km)', 'körsträcka (km)', 'körsträcka(km)',
    'sträcka (km)', 'sträcka', 'distance',
  ],
  electric: [
    'electric mode (km)', 'eldrift (km)', 'elläge (km)', 'el-sträcka (km)',
    'electric distance (km)', 'ev distance (km)', 'electric(km)', 'eldrift(km)',
    'elbil (km)', 'elektrisk körning (km)',
  ],
  combustion: [
    'combustion mode (km)', 'förbränning (km)', 'förbrännningsmotor (km)',
    'ice distance (km)', 'fuel mode (km)', 'combustion(km)', 'förbränning',
    'bensinmotor (km)', 'förbrännnings (km)',
  ],
  kwh: [
    'energy used (kwh)', 'energiförbrukning (kwh)', 'förbrukad energi (kwh)',
    'kwh used', 'energy consumed (kwh)', 'energy (kwh)', 'consumed energy (kwh)',
    'elektrisk energi (kwh)', 'elförbrukning (kwh)',
  ],
  fuelL: [
    'fuel used (l)', 'bränsleförbrukning (l)', 'förbrukat bränsle (l)',
    'fuel consumed (l)', 'fuel (l)', 'bränsle (l)', 'consumed fuel (l)',
    'fuel volume (l)',
  ],
  // RATE columns (kWh/100 km or l/100 km) — primary in Volvo Cars CSV exports
  kwhRate: [
    'energy consumption (kwh/100 km)', 'energiförbrukning (kwh/100 km)',
    'electricity consumption (kwh/100 km)', 'elförbrukning (kwh/100 km)',
    'förbrukad energi (kwh/100 km)', 'energy (kwh/100 km)',
    'energy consumption (kwh/100km)', 'energiförbrukning (kwh/100km)',
    'el-förbrukning (kwh/100 km)', 'electric consumption (kwh/100 km)',
  ],
  fuelRate: [
    'fuel consumption (l/100 km)', 'bränsleförbrukning (l/100 km)',
    'fuel economy (l/100 km)', 'förbrukad bränsle (l/100 km)',
    'fuel (l/100 km)', 'consumption (l/100 km)',
    'fuel consumption (l/100km)', 'bränsleförbrukning (l/100km)',
  ],
  started: [
    'started', 'startad', 'start time', 'start', 'startdatum',
    'date started', 'date/time started',
  ],
};

function findCol(headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx !== -1) return idx;
  }
  for (const alias of aliases) {
    const idx = headers.findIndex(h => h.includes(alias));
    if (idx !== -1) return idx;
  }
  return -1;
}

function toFloat(str) {
  if (!str) return null;
  const n = parseFloat(str.replace(/\u00a0/g, '').replace(',', '.').trim());
  return isNaN(n) ? null : n;
}

function parseDate(str) {
  if (!str || !str.trim()) return null;
  const d = new Date(str.trim().replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

function round1(n) { return Math.round(n * 10) / 10; }

export function parseVolvoCsv(buffer) {
  // Detect encoding
  const bytes = new Uint8Array(buffer);
  let text;
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
    text = new TextDecoder('utf-16be').decode(buffer.slice(2));
  } else if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
    text = new TextDecoder('utf-16le').decode(buffer.slice(2));
  } else {
    text = new TextDecoder('utf-8').decode(buffer);
  }

  const lines = text
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .split('\n').filter(l => l.trim().length > 0);

  if (lines.length < 2) {
    return { ok: false, error: 'File appears empty or has fewer than 2 lines.' };
  }

  const rawHeader = lines[0].replace(/^\uFEFF/, '');
  const headers = rawHeader.split(';').map(h => h.trim().toLowerCase());

  const cols = {};
  for (const [key, aliases] of Object.entries(COL_ALIASES)) {
    const idx = findCol(headers, aliases);
    if (idx !== -1) cols[key] = idx;
  }

  if (cols.distance === undefined && cols.electric === undefined) {
    return {
      ok: false,
      error: 'Could not find a distance column. Is this a Volvo Cars app export?',
      headersFound: headers.join('; '),
    };
  }

  // Parse rows
  const trips = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(';');
    if (cells.length < 3) continue;

    const t = {
      distance: null, electric: null, combustion: null,
      kwh: null, fuelL: null, kwhRate: null, fuelRate: null, started: null,
    };

    for (const [key, idx] of Object.entries(cols)) {
      if (idx >= cells.length) continue;
      t[key] = key === 'started' ? parseDate(cells[idx]) : toFloat(cells[idx]);
    }

    if (t.distance !== null && t.electric !== null && t.combustion === null) {
      t.combustion = Math.max(0, t.distance - t.electric);
    }

    if (t.distance !== null && t.distance > 0) trips.push(t);
  }

  if (trips.length === 0) {
    return { ok: false, error: 'No valid trip rows found. Check the file format.' };
  }

  // Aggregate
  let totalKm = 0, electricKm = 0, combustionKm = 0;
  let totalKwh = 0, totalFuelL = 0;
  let kwhRateSum = 0, kwhRateKm = 0;
  let fuelRateSum = 0, fuelRateKm = 0;
  let firstDate = null, lastDate = null;

  for (const t of trips) {
    totalKm      += t.distance   ?? 0;
    electricKm   += t.electric   ?? 0;
    combustionKm += t.combustion ?? 0;
    totalKwh     += t.kwh        ?? 0;
    totalFuelL   += t.fuelL      ?? 0;

    // Rate columns: weighted average by relevant mode distance
    if (t.kwhRate !== null && t.kwhRate > 0) {
      const w = t.electric ?? t.distance ?? 0;
      if (w > 0) { kwhRateSum += t.kwhRate * w; kwhRateKm += w; }
    }
    if (t.fuelRate !== null && t.fuelRate > 0) {
      const w = t.combustion ?? t.distance ?? 0;
      if (w > 0) { fuelRateSum += t.fuelRate * w; fuelRateKm += w; }
    }

    if (t.started) {
      if (!firstDate || t.started < firstDate) firstDate = t.started;
      if (!lastDate  || t.started > lastDate)  lastDate  = t.started;
    }
  }

  if (electricKm > 0 && combustionKm === 0) {
    combustionKm = Math.max(0, totalKm - electricKm);
  }

  // Prefer rate-based efficiency (more direct); fall back to total-based
  const avgElecEffRate  = kwhRateKm  > 20 ? kwhRateSum  / kwhRateKm  : null;
  const avgFuelEffRate  = fuelRateKm > 20 ? fuelRateSum / fuelRateKm : null;
  const avgElecEffTotal = (electricKm  > 20 && totalKwh  > 0) ? (totalKwh  / electricKm)  * 100 : null;
  const avgFuelEffTotal = (combustionKm > 20 && totalFuelL > 0) ? (totalFuelL / combustionKm) * 100 : null;

  const avgElecEff = avgElecEffRate ?? avgElecEffTotal;
  const avgFuelEff = avgFuelEffRate ?? avgFuelEffTotal;

  const hasElectricCol = cols.electric !== undefined;
  const electricPercent = (hasElectricCol && totalKm > 0)
    ? (electricKm / totalKm) * 100 : null;

  let monthlyKm = null;
  if (firstDate && lastDate) {
    const months = (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 30.44);
    if (months >= 1) monthlyKm = Math.round(totalKm / months);
  }

  // Source descriptions for diagnostic display
  const elecEffSource = avgElecEffRate  ? `rate col (kWh/100km × ${Math.round(kwhRateKm)} km)`
                      : avgElecEffTotal ? `total kWh ÷ elec km`
                      : null;
  const fuelEffSource = avgFuelEffRate  ? `rate col (l/100km × ${Math.round(fuelRateKm)} km)`
                      : avgFuelEffTotal ? `total litres ÷ combustion km`
                      : null;

  return {
    ok: true,
    trips:           trips.length,
    totalKm:         Math.round(totalKm),
    electricKm:      Math.round(electricKm),
    combustionKm:    Math.round(combustionKm),
    electricPercent: electricPercent !== null ? round1(electricPercent) : null,
    avgElecEff:      avgElecEff ? round1(avgElecEff) : null,
    avgFuelEff:      avgFuelEff ? round1(avgFuelEff) : null,
    monthlyKm,
    hasKwhData:      totalKwh > 0 || kwhRateKm > 0,
    hasFuelData:     totalFuelL > 0 || fuelRateKm > 0,
    columnsFound:    Object.keys(cols),
    elecEffSource,
    fuelEffSource,
    allHeaders:      headers,
    dateRange:       { from: firstDate, to: lastDate },
  };
}
