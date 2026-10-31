/** Banana cake formulation and live recipe generator. */

import { OUTCOMES, addBake, adjustmentEvidence, allBakes, createBakeRecord, loadHistory, removeBake, saveHistory } from './bake-history.js';

const STATE_KEY = 'mytools_bananacake_v1';
const DEFAULTS = {
  banana: 320,
  bananaCondition: 'normal',
  panType: 'round',
  panMaterial: 'metal',
  blueberries: false,
  blueberryG: 110,
  cinnamon: true,
  viewMode: 'combined',
};

// Calculated (pre-calibration) quantities of tested bakes. Actual flour used is in bake history.
const ANCHORS = [
  { banana: 200, flourG: 125, sugarG: 63, butterG: 38, oilMl: 12, yogurtG: 50, milkMl: 60,
    bakingPowderTsp: 0.625, bakingSodaTsp: 0.25, saltTsp: 0.25, cardamomTsp: 0.25,
    cinnamonTsp: 0.25, lemonJuiceTsp: 0.625 },
  { banana: 270, flourG: 195, sugarG: 75, butterG: 50, oilMl: 7, yogurtG: 55, milkMl: 40,
    bakingPowderTsp: 1, bakingSodaTsp: 0.5, saltTsp: 0.5, cardamomTsp: 0.5,
    cinnamonTsp: 0.375, lemonJuiceTsp: 0.75 },
  { banana: 320, flourG: 200, sugarG: 100, butterG: 60, oilMl: 20, yogurtG: 80, milkMl: 100,
    bakingPowderTsp: 1, bakingSodaTsp: 0.5, saltTsp: 0.5, cardamomTsp: 0.5,
    cinnamonTsp: 0.5, lemonJuiceTsp: 1 },
  { banana: 450, flourG: 320, sugarG: 125, butterG: 85, oilMl: 12, yogurtG: 90, milkMl: 65,
    bakingPowderTsp: 1.5, bakingSodaTsp: 0.75, saltTsp: 0.625, cardamomTsp: 0.75,
    cinnamonTsp: 0.5, lemonJuiceTsp: 1.25 },
];

const MIN_TESTED = ANCHORS[0].banana;
const MAX_TESTED = ANCHORS[ANCHORS.length - 1].banana;
const LOG_DEFAULTS = { addedFlourG: 0, addedMilkMl: 0, outcome: 'good', notes: '' };

let S = { ...DEFAULTS };
let history = [];
let log = { ...LOG_DEFAULTS };

function $(id) { return document.getElementById(id); }

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (saved && typeof saved === 'object') S = { ...DEFAULTS, ...saved };
  } catch (_) {}
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(S));
}

function roundEighth(value) { return Math.round(value * 8) / 8; }

function formatTsp(value) {
  const rounded = roundEighth(value);
  const whole = Math.floor(rounded);
  const fraction = rounded - whole;
  const fractions = { 0.125: '⅛', 0.25: '¼', 0.375: '⅜', 0.5: '½', 0.625: '⅝', 0.75: '¾', 0.875: '⅞' };
  return `${whole || ''}${fractions[fraction] || ''}` || '0';
}

function interpolate(B) {
  const belowRange = B < MIN_TESTED;
  const aboveRange = B > MAX_TESTED;
  let value;
  if (belowRange) {
    // Linear extrapolation below the smallest bake drives milk/oil negative; scale it instead.
    value = field => ANCHORS[0][field] * (B / MIN_TESTED);
  } else {
    const i = Math.max(0, ANCHORS.findIndex(a => B <= a.banana) - 1);
    const [low, high] = aboveRange ? ANCHORS.slice(-2) : [ANCHORS[i], ANCHORS[i + 1]];
    const ratio = (B - low.banana) / (high.banana - low.banana);
    value = field => low[field] + (high[field] - low[field]) * ratio;
  }
  return {
    banana: B,
    flourG: value('flourG'), sugarG: value('sugarG'), butterG: value('butterG'),
    oilMl: value('oilMl'), yogurtG: value('yogurtG'), milkMl: value('milkMl'),
    bakingPowderTsp: value('bakingPowderTsp'), bakingSodaTsp: value('bakingSodaTsp'),
    saltTsp: value('saltTsp'), cardamomTsp: value('cardamomTsp'),
    cinnamonTsp: value('cinnamonTsp'), lemonJuiceTsp: value('lemonJuiceTsp'),
    vaniljsockerTsp: value('sugarG') * 0.02,
    belowRange,
    aboveRange,
  };
}

function calculate(options = S) {
  const B = Number(options.banana);
  const raw = interpolate(B);
  const recipe = {
    ...raw,
    flourG: Math.round(Math.max(0, raw.flourG)), sugarG: Math.round(Math.max(0, raw.sugarG)), butterG: Math.round(Math.max(0, raw.butterG)),
    oilMl: Math.round(Math.max(0, raw.oilMl)), yogurtG: Math.round(Math.max(0, raw.yogurtG)), milkMl: Math.round(Math.max(0, raw.milkMl)),
    bakingPowderTsp: roundEighth(raw.bakingPowderTsp), bakingSodaTsp: roundEighth(raw.bakingSodaTsp),
    saltTsp: roundEighth(raw.saltTsp), cardamomTsp: roundEighth(raw.cardamomTsp),
    cinnamonTsp: roundEighth(raw.cinnamonTsp), lemonJuiceTsp: roundEighth(raw.lemonJuiceTsp),
    vaniljsockerTsp: roundEighth(raw.vaniljsockerTsp),
  };
  const warnings = [];
  if (recipe.belowRange) warnings.push(`Below the smallest tested batch (${MIN_TESTED} g) — quantities are scaled down proportionally; watch batter consistency closely.`);
  if (recipe.aboveRange && B <= 500) warnings.push(`Above the largest single-pan tested amount (${MAX_TESTED} g) — extrapolated; check doneness carefully.`);
  if (B > 500) {
    const panA = Math.round(B * 0.625);
    warnings.push(`Above 500 g in one pan is untested. Consider splitting across two pans instead — e.g. a round cake pan + a loaf pan — the way 720 g was successfully split as 450 g + 270 g. Suggested split: e.g. ${panA} g in the round pan + ${B - panA} g in the loaf pan.`);
  }
  if (options.panMaterial === 'glass') warnings.push('Glass conducts heat more slowly than metal. A wide glass dish caused a collapsed, wet-centered cake in testing at high banana weights. Prefer metal; if using glass, expect a longer bake and check the center closely.');
  if (options.bananaCondition === 'wet') warnings.push('Old / wet bananas: they release free liquid after peeling and mashing, so the batter will likely need extra flour. The calculated flour is deliberately NOT increased — add flour only at the consistency check, in small steps, until the batter is right.');
  const moistureNote = `Banana moisture varies with ripeness, water content and how much liquid is released after mashing — two batches of exactly ${B} g can need different amounts of flour. The ${recipe.flourG} g flour is a conservative starting amount; the consistency check before baking decides the final amount.`;

  let temp = B <= 350 ? 170 : 175;
  if (options.panMaterial === 'glass') temp -= 10;
  let time;
  if (options.panType === 'round') time = B < 350 ? '35–45 min' : B <= 500 ? '40–50 min' : '45–55 min';
  else time = `45–55 min${B > 350 ? ' (extrapolated — check earlier and often)' : ''}`;
  if (options.panMaterial === 'glass') time += ' + 10–15 min';
  return { ...recipe, warnings, moistureNote, temp, time, panType: options.panType, panMaterial: options.panMaterial };
}

/** Consistency-check guidance, enriched with evidence from similar successful bakes (never auto-applied). */
function calibration(recipe, options, bakes = []) {
  const evidence = adjustmentEvidence(bakes, { banana: recipe.banana, condition: options.bananaCondition, calculatedFlourG: recipe.flourG });
  const condition = options.bananaCondition === 'wet' ? 'old/wet' : 'normal';
  let evidenceText = '';
  if (evidence && evidence.maxExtraG > 0) {
    const range = evidence.minExtraG === evidence.maxExtraG ? `~${evidence.maxExtraG} g` : `${evidence.minExtraG}–${evidence.maxExtraG} g`;
    const examples = evidence.bakes.map(b => `${b.banana} g: ${b.calculatedFlourG} → ${b.actualFlourG} g flour`).join('; ');
    evidenceText = ` Evidence from ${evidence.count} similar successful bake${evidence.count > 1 ? 's' : ''} with ${condition} bananas (${examples}) suggests ${range} extra flour for this batch — set that aside, but add only what the batter actually needs. This is an observation, not a requirement.`;
  } else if (evidence) {
    evidenceText = ` Similar successful bakes with ${condition} bananas needed no extra flour — still check.`;
  }
  return { evidence, reserveFlourG: evidence && evidence.maxExtraG > 0 ? evidence.maxExtraG : null, evidenceText };
}

function checkpointStep(calib) {
  return 'CONSISTENCY CHECK (mandatory, before baking): target is thick and spreadable — it falls slowly from the spatula, holds its shape briefly when deposited, is not watery or runny like pancake batter, and is not so stiff it won\'t spread. '
    + 'Too runny → add 10 g flour, fold gently, reassess; repeat if needed, continuing in 5–10 g steps. '
    + 'Too thick → add milk 5–10 ml at a time and stop as soon as it spreads. '
    + 'Reassess after every addition and avoid over-correcting in either direction. Note how much you added and log it below — the final batter matters more than the calculated flour.'
    + calib.evidenceText;
}

function ingredients(recipe, options, calib = calibration(recipe, options)) {
  const wet = [
    `${recipe.banana} g ripe peeled banana`, `${recipe.sugarG} g sugar`, `${formatTsp(recipe.vaniljsockerTsp)} tsp vaniljsocker`,
    `${recipe.butterG} g melted, cooled butter`, `${recipe.oilMl} ml neutral oil`, `${recipe.yogurtG} g plain yogurt`,
    `${recipe.milkMl} ml milk`, `${formatTsp(recipe.lemonJuiceTsp)} tsp lemon juice`,
  ];
  const dry = [
    `${recipe.flourG} g flour (starting amount — adjust at the consistency check)`, `${formatTsp(recipe.bakingPowderTsp)} tsp baking powder`, `${formatTsp(recipe.bakingSodaTsp)} tsp baking soda`,
    `${formatTsp(recipe.saltTsp)} tsp salt`, `${formatTsp(recipe.cardamomTsp)} tsp ground cardamom`,
  ];
  if (options.cinnamon) dry.push(`${formatTsp(recipe.cinnamonTsp)} tsp cinnamon`);
  dry.push(calib.reserveFlourG ? `Extra flour set aside for calibration: ~${calib.reserveFlourG} g (add only if needed)` : 'A little extra flour at hand for the consistency check (add only if needed)');
  return { wet, dry, addIns: options.blueberries ? [`${options.blueberryG} g blueberries`] : [] };
}

function panName(options) { return `${options.panType === 'round' ? '30 cm round' : 'loaf'} ${options.panMaterial} pan`; }

function steps(recipe, options, combined, calib = calibration(recipe, options)) {
  const p = panName(options);
  const cinnamon = options.cinnamon ? `, and ${formatTsp(recipe.cinnamonTsp)} tsp cinnamon` : '';
  const blueberryStep = options.blueberries
    ? `Pat ${options.blueberryG} g blueberries dry, toss with 1 tbsp of the flour already measured above (not extra), then fold in gently at the very end.` : null;
  if (!combined) return [
    `Preheat oven to ${recipe.temp}°C, top + bottom heat, middle rack.`, `Grease/line your ${p}.`,
    `Mash ${recipe.banana} g ripe peeled banana in a bowl.`, 'Add the sugar and vaniljsocker to the wet mixture. Mix ~1 min, then rest 2 min.',
    'Add the melted, cooled butter and neutral oil to the wet mixture.', 'Add the plain yogurt and milk to the wet mixture.', 'Add the lemon juice to the wet mixture. Mix until smooth.',
    'Add the dry mixture to the wet mixture. Mix until just combined.',
    'Fold gently until just combined. Rest the batter 10 min, then give it 2–3 gentle folds.', checkpointStep(calib),
    ...(blueberryStep ? [blueberryStep] : []), `Pour into the pan.`, `Bake at ${recipe.temp}°C for ${recipe.time}.`,
    'Start checking at the low end of the range. Toothpick should show a few moist crumbs, never wet batter; center should spring back gently. (Optional: internal temperature 96–98°C on a food thermometer.)',
    'Cool 15 min in the pan, then move to a rack. Wait 45–60 min before cutting — the crumb keeps setting as it cools. Leave uncovered unless the top browns too fast, then add loose foil (foil does not fix an over-wet batter).',
  ];
  return [
    `Preheat oven to ${recipe.temp}°C, top + bottom heat, middle rack.`, `Grease/line your ${p}.`,
    `Mash ${recipe.banana} g ripe peeled banana in a bowl.`, `Add ${recipe.sugarG} g sugar and ${formatTsp(recipe.vaniljsockerTsp)} tsp vaniljsocker. Mix ~1 min, then rest 2 min.`,
    `Add ${recipe.butterG} g melted, cooled butter and ${recipe.oilMl} ml neutral oil.`, `Add ${recipe.yogurtG} g plain yogurt and ${recipe.milkMl} ml milk.`,
    `Add ${formatTsp(recipe.lemonJuiceTsp)} tsp lemon juice. Mix until smooth.`, `Add ${recipe.flourG} g flour (starting amount), ${formatTsp(recipe.bakingPowderTsp)} tsp baking powder, ${formatTsp(recipe.bakingSodaTsp)} tsp baking soda, ${formatTsp(recipe.saltTsp)} tsp salt, ${formatTsp(recipe.cardamomTsp)} tsp ground cardamom${cinnamon}.`,
    'Fold gently until just combined. Rest the batter 10 min, then give it 2–3 gentle folds.', checkpointStep(calib),
    ...(blueberryStep ? [blueberryStep] : []), 'Pour into the pan.', `Bake at ${recipe.temp}°C for ${recipe.time}.`,
    'Start checking at the low end of the range. Toothpick should show a few moist crumbs, never wet batter; center should spring back gently. (Optional: internal temperature 96–98°C on a food thermometer.)',
    'Cool 15 min in the pan, then move to a rack. Wait 45–60 min before cutting — the crumb keeps setting as it cools. Leave uncovered unless the top browns too fast, then add loose foil (foil does not fix an over-wet batter).',
  ];
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function currentPlan() {
  const recipe = calculate(S);
  const calib = calibration(recipe, S, allBakes(history));
  return { recipe, calib, list: ingredients(recipe, S, calib), method: steps(recipe, S, S.viewMode === 'combined', calib) };
}

function render() {
  const { recipe, list, method } = currentPlan();
  const combined = S.viewMode === 'combined';
  const output = $('banana-recipe-output');
  const warnings = $('banana-warnings');
  warnings.innerHTML = recipe.warnings.map(w => `<div>${w}</div>`).join('');
  warnings.hidden = recipe.warnings.length === 0;
  $('banana-moisture-note').textContent = recipe.moistureNote;
  $('banana-stat').textContent = `${recipe.temp}°C · ${recipe.time}`;
  const methodCard = `<div class="card"><div class="card-label">Method</div><ol class="recipe-steps">${method.map(step => `<li${step.startsWith('CONSISTENCY CHECK') ? ' class="checkpoint-step"' : ''}>${step}</li>`).join('')}</ol></div>`;
  if (combined) {
    output.innerHTML = methodCard;
  } else {
    const groups = [['Wet', list.wet], ['Dry', list.dry], ['Add-ins', list.addIns]];
    output.innerHTML = `<div class="card"><div class="card-label">Ingredients</div>${groups.filter(([, values]) => values.length).map(([name, values]) => `<div class="ingredient-group"><strong>${name}</strong><ul>${values.map(item => `<li>${item}</li>`).join('')}</ul></div>`).join('')}</div>${methodCard}`;
  }
  renderLog(recipe);
  renderHistory();
}

function renderLog(recipe) {
  $('log-calculated-flour').textContent = `${recipe.flourG} g`;
  $('log-actual-flour').textContent = `${recipe.flourG + log.addedFlourG} g`;
  Object.keys(OUTCOMES).forEach(key => setPressed(`log-outcome-${key}`, log.outcome === key));
}

function renderHistory() {
  const bakes = allBakes(history).slice().reverse();
  $('bake-history-list').innerHTML = bakes.map(b => {
    const milk = b.addedMilkMl ? ` · +${b.addedMilkMl} ml milk` : '';
    const berries = b.blueberriesG ? ` · ${b.blueberriesG} g blueberries` : '';
    const remove = b.reference ? '<span class="history-tag">reference</span>' : `<button class="btn history-delete" data-id="${escapeHtml(b.id)}" aria-label="Delete bake from ${escapeHtml(b.date)}">Delete</button>`;
    return `<li class="history-item"><div class="history-head"><strong>${escapeHtml(b.date)} · ${b.banana} g · ${b.condition === 'wet' ? 'old/wet' : 'normal'} bananas</strong>${remove}</div>`
      + `<div>Flour: ${b.calculatedFlourG} g calculated → <strong>${b.actualFlourG} g actual</strong> (+${b.addedFlourG} g)${milk}${berries}</div>`
      + `<div class="history-outcome">${escapeHtml(OUTCOMES[b.outcome])}${b.notes ? ` — ${escapeHtml(b.notes)}` : ''}</div></li>`;
  }).join('');
}

function saveBake() {
  const { recipe } = currentPlan();
  const status = $('log-status');
  try {
    const record = createBakeRecord({
      banana: recipe.banana, condition: S.bananaCondition, blueberriesG: S.blueberries ? S.blueberryG : 0,
      calculatedFlourG: recipe.flourG, addedFlourG: log.addedFlourG, addedMilkMl: log.addedMilkMl,
      outcome: log.outcome, notes: log.notes,
    });
    history = addBake(history, record);
    saveHistory(localStorage, history);
    log = { ...LOG_DEFAULTS };
    restoreLogInputs();
    status.textContent = `Saved: ${record.calculatedFlourG} g → ${record.actualFlourG} g flour ✓`;
  } catch (err) {
    status.textContent = `Not saved: ${err.message}`;
  }
  render();
  window.setTimeout(() => { status.textContent = ''; }, 3000);
}

function copyText() {
  const { recipe, list, method } = currentPlan();
  const lines = [`*Banana Cake — ${recipe.banana} g banana*`, '', `_${recipe.moistureNote}_`, '', '*Ingredients*', ...[...list.wet, ...list.dry, ...list.addIns].map(item => `• ${item}`), '', '*Method*', ...method.map((step, i) => `${i + 1}. ${step}`)];
  const text = lines.join('\n');
  const fallback = () => {
    const area = document.createElement('textarea'); area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.left = '-10000px';
    document.body.appendChild(area); area.select(); const copied = document.execCommand('copy'); area.remove(); return copied;
  };
  const copyPromise = navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject();
  copyPromise.then(() => showCopied()).catch(() => { if (fallback()) showCopied(); });
}

function showCopied() {
  const status = $('banana-copy-status'); status.textContent = 'Copied ✓';
  window.setTimeout(() => { status.textContent = ''; }, 2000);
}

function bindToggle(id, key) {
  const button = $(id);
  button.addEventListener('click', () => { S[key] = !S[key]; if (key === 'blueberries' && S[key]) S.blueberryG = S.panType === 'round' ? 110 : 65; saveState(); restoreInputs(); render(); });
}

function bindNumber(id, apply) {
  $(id).addEventListener('input', e => { const value = Number(e.target.value); if (Number.isFinite(value)) { apply(value); render(); } });
}

function bindUI() {
  bindNumber('banana-weight-input', value => { S.banana = Math.min(900, Math.max(100, value)); saveState(); });
  ['normal', 'wet'].forEach(condition => $(`banana-${condition}-btn`).addEventListener('click', () => { S.bananaCondition = condition; saveState(); restoreInputs(); render(); }));
  ['round', 'loaf'].forEach(type => $(type === 'round' ? 'pan-round-btn' : 'pan-loaf-btn').addEventListener('click', () => { S.panType = type; if (S.blueberries) S.blueberryG = type === 'round' ? 110 : 65; saveState(); restoreInputs(); render(); }));
  ['metal', 'glass'].forEach(material => $(material === 'metal' ? 'pan-metal-btn' : 'pan-glass-btn').addEventListener('click', () => { S.panMaterial = material; saveState(); restoreInputs(); render(); }));
  ['combined', 'separate'].forEach(mode => $(mode === 'combined' ? 'view-combined-btn' : 'view-separate-btn').addEventListener('click', () => { S.viewMode = mode; saveState(); restoreInputs(); render(); }));
  bindNumber('blueberry-weight-input', value => { S.blueberryG = Math.min(500, Math.max(0, value)); saveState(); });
  bindToggle('blueberry-toggle', 'blueberries'); bindToggle('cinnamon-toggle', 'cinnamon'); $('banana-copy-btn').addEventListener('click', copyText);
  bindNumber('log-added-flour', value => { log.addedFlourG = Math.min(500, Math.max(0, Math.round(value))); });
  bindNumber('log-added-milk', value => { log.addedMilkMl = Math.min(500, Math.max(0, Math.round(value))); });
  Object.keys(OUTCOMES).forEach(key => $(`log-outcome-${key}`).addEventListener('click', () => { log.outcome = key; render(); }));
  $('log-notes').addEventListener('input', e => { log.notes = e.target.value; });
  $('log-save-btn').addEventListener('click', saveBake);
  $('bake-history-list').addEventListener('click', e => {
    const button = e.target.closest('.history-delete');
    if (!button || !window.confirm('Delete this bake from your history?')) return;
    history = removeBake(history, button.dataset.id); saveHistory(localStorage, history); render();
  });
}

function setPressed(id, pressed) { const button = $(id); button.setAttribute('aria-pressed', String(pressed)); button.classList.toggle('active', pressed); }
function restoreLogInputs() { $('log-added-flour').value = log.addedFlourG; $('log-added-milk').value = log.addedMilkMl; $('log-notes').value = log.notes; }
function restoreInputs() {
  $('banana-weight-input').value = S.banana; $('blueberry-weight-input').value = S.blueberryG; $('blueberry-weight-row').hidden = !S.blueberries;
  setPressed('banana-normal-btn', S.bananaCondition === 'normal'); setPressed('banana-wet-btn', S.bananaCondition === 'wet');
  setPressed('pan-round-btn', S.panType === 'round'); setPressed('pan-loaf-btn', S.panType === 'loaf'); setPressed('pan-metal-btn', S.panMaterial === 'metal'); setPressed('pan-glass-btn', S.panMaterial === 'glass');
  setPressed('blueberry-toggle', S.blueberries); setPressed('cinnamon-toggle', S.cinnamon); setPressed('view-combined-btn', S.viewMode === 'combined'); setPressed('view-separate-btn', S.viewMode === 'separate');
}

function init() { loadState(); history = loadHistory(localStorage); bindUI(); restoreInputs(); restoreLogInputs(); render(); }

export { ANCHORS, calculate, calibration, formatTsp, ingredients, interpolate, steps };
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
