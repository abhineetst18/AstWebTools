/** Banana cake bake history: calculated vs. actual quantities, used as calibration evidence. */

export const HISTORY_KEY = 'mytools_bananacake_history_v1';
export const MAX_HISTORY = 50;
export const CONDITIONS = ['normal', 'wet'];
export const OUTCOMES = {
  good: 'Turned out fine',
  dense: 'Too dense / dry',
  wet: 'Wet / gummy center',
  sunk: 'Sunk / collapsed',
};
// Evidence only counts bakes within ±25% banana weight of the current batch.
const SIMILAR_WEIGHT_TOLERANCE = 0.25;

// Shipped observations; they are one-off evidence, not rules for every batch of that size.
export const REFERENCE_BAKES = Object.freeze([
  Object.freeze({
    id: 'ref-2026-10-200g-wet',
    reference: true,
    date: '2026-10',
    banana: 200,
    condition: 'wet',
    blueberriesG: 55,
    calculatedFlourG: 125,
    addedFlourG: 30,
    actualFlourG: 155,
    addedMilkMl: 0,
    outcome: 'good',
    notes: 'Old bananas released liquid after mashing; batter was too runny. +30 g flour restored a thick, spreadable batter. 50–60 g fresh wild blueberries.',
  }),
]);

function nonNegative(value, field) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new RangeError(`${field} must be a number ≥ 0 (got ${value})`);
  return Math.round(number);
}

export function createBakeRecord(input, now = new Date()) {
  const banana = nonNegative(input.banana, 'banana');
  if (banana === 0) throw new RangeError('banana must be greater than 0');
  const calculatedFlourG = nonNegative(input.calculatedFlourG, 'calculatedFlourG');
  if (calculatedFlourG === 0) throw new RangeError('calculatedFlourG must be greater than 0');
  if (!CONDITIONS.includes(input.condition)) throw new RangeError(`condition must be one of ${CONDITIONS.join(', ')}`);
  if (!(input.outcome in OUTCOMES)) throw new RangeError(`outcome must be one of ${Object.keys(OUTCOMES).join(', ')}`);
  const addedFlourG = nonNegative(input.addedFlourG, 'addedFlourG');
  return {
    id: input.id || `bake-${now.getTime()}`,
    reference: false,
    date: input.date || now.toISOString().slice(0, 10),
    banana,
    condition: input.condition,
    blueberriesG: nonNegative(input.blueberriesG, 'blueberriesG'),
    calculatedFlourG,
    addedFlourG,
    actualFlourG: calculatedFlourG + addedFlourG,
    addedMilkMl: nonNegative(input.addedMilkMl, 'addedMilkMl'),
    outcome: input.outcome,
    notes: String(input.notes || '').trim().slice(0, 500),
  };
}

function isValidRecord(record) {
  try { createBakeRecord(record); return true; } catch (_) { return false; }
}

export function loadHistory(storage) {
  try {
    const saved = JSON.parse(storage.getItem(HISTORY_KEY));
    return Array.isArray(saved) ? saved.filter(isValidRecord).map(r => createBakeRecord(r)).slice(-MAX_HISTORY) : [];
  } catch (_) { return []; }
}

export function saveHistory(storage, records) {
  storage.setItem(HISTORY_KEY, JSON.stringify(records.slice(-MAX_HISTORY)));
}

export function addBake(records, record) { return [...records, record].slice(-MAX_HISTORY); }
export function removeBake(records, id) { return records.filter(record => record.id !== id); }
export function allBakes(userRecords) { return [...REFERENCE_BAKES, ...userRecords]; }

function roundTo5(value) { return Math.round(value / 5) * 5; }

/**
 * Summarise how much extra flour successful, similar bakes needed, scaled to this batch's
 * calculated flour. Returns null when there is no comparable evidence.
 */
export function adjustmentEvidence(bakes, { banana, condition, calculatedFlourG }) {
  const similar = bakes.filter(bake => bake.outcome === 'good'
    && bake.condition === condition
    && Math.abs(bake.banana - banana) <= banana * SIMILAR_WEIGHT_TOLERANCE);
  if (!similar.length) return null;
  const extras = similar.map(bake => roundTo5(calculatedFlourG * (bake.addedFlourG / bake.calculatedFlourG)));
  return { count: similar.length, minExtraG: Math.min(...extras), maxExtraG: Math.max(...extras), bakes: similar };
}
