/** Banana cake formulation and live recipe generator. */

const STATE_KEY = 'mytools_bananacake_v1';
const DEFAULTS = {
  banana: 320,
  panType: 'round',
  panMaterial: 'metal',
  blueberries: false,
  blueberryG: 110,
  cinnamon: true,
  viewMode: 'combined',
};

const ANCHORS = [
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

let S = { ...DEFAULTS };

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

function roundQuarter(value) { return Math.round(value * 4) / 4; }

function formatTsp(value) {
  const rounded = roundQuarter(value);
  const whole = Math.floor(rounded);
  const fraction = rounded - whole;
  const fractions = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
  return `${whole || ''}${fractions[fraction] || ''}` || '0';
}

function interpolate(B) {
  const belowRange = B <= 270;
  const aboveRange = B > 450;
  const [low, high] = B <= 320 ? [ANCHORS[0], ANCHORS[1]] : [ANCHORS[1], ANCHORS[2]];
  const ratio = (B - low.banana) / (high.banana - low.banana);
  const value = field => low[field] + (high[field] - low[field]) * ratio;
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
    bakingPowderTsp: roundQuarter(raw.bakingPowderTsp), bakingSodaTsp: roundQuarter(raw.bakingSodaTsp),
    saltTsp: roundQuarter(raw.saltTsp), cardamomTsp: roundQuarter(raw.cardamomTsp),
    cinnamonTsp: roundQuarter(raw.cinnamonTsp), lemonJuiceTsp: roundQuarter(raw.lemonJuiceTsp),
    vaniljsockerTsp: roundQuarter(raw.vaniljsockerTsp),
  };
  const warnings = [];
  if (recipe.belowRange) warnings.push('Below the smallest tested batch (270 g) — this is extrapolated; watch batter consistency closely.');
  if (recipe.aboveRange && B <= 500) warnings.push('Above the largest single-pan tested amount (450 g) — extrapolated; check doneness carefully.');
  if (B > 500) {
    const panA = Math.round(B * 0.625);
    warnings.push(`Above 500 g in one pan is untested. Consider splitting across two pans instead — e.g. a round cake pan + a loaf pan — the way 720 g was successfully split as 450 g + 270 g. Suggested split: e.g. ${panA} g in the round pan + ${B - panA} g in the loaf pan.`);
  }
  if (options.panMaterial === 'glass') warnings.push('Glass conducts heat more slowly than metal. A wide glass dish caused a collapsed, wet-centered cake in testing at high banana weights. Prefer metal; if using glass, expect a longer bake and check the center closely.');

  let temp = B <= 350 ? 170 : 175;
  if (options.panMaterial === 'glass') temp -= 10;
  let time;
  if (options.panType === 'round') time = B < 350 ? '35–45 min' : B <= 500 ? '40–50 min' : '45–55 min';
  else time = `45–55 min${B > 350 ? ' (extrapolated — check earlier and often)' : ''}`;
  if (options.panMaterial === 'glass') time += ' + 10–15 min';
  return { ...recipe, warnings, temp, time, panType: options.panType, panMaterial: options.panMaterial };
}

function ingredients(recipe, options) {
  const wet = [
    `${recipe.banana} g ripe peeled banana`, `${recipe.sugarG} g sugar`, `${formatTsp(recipe.vaniljsockerTsp)} tsp vaniljsocker`,
    `${recipe.butterG} g melted, cooled butter`, `${recipe.oilMl} ml neutral oil`, `${recipe.yogurtG} g plain yogurt`,
    `${recipe.milkMl} ml milk`, `${formatTsp(recipe.lemonJuiceTsp)} tsp lemon juice`,
  ];
  const dry = [
    `${recipe.flourG} g flour`, `${formatTsp(recipe.bakingPowderTsp)} tsp baking powder`, `${formatTsp(recipe.bakingSodaTsp)} tsp baking soda`,
    `${formatTsp(recipe.saltTsp)} tsp salt`, `${formatTsp(recipe.cardamomTsp)} tsp ground cardamom`,
  ];
  if (options.cinnamon) dry.push(`${formatTsp(recipe.cinnamonTsp)} tsp cinnamon`);
  return { wet, dry, addIns: options.blueberries ? [`${options.blueberryG} g blueberries`] : [] };
}

function panName(options) { return `${options.panType === 'round' ? '30 cm round' : 'loaf'} ${options.panMaterial} pan`; }

function steps(recipe, options, combined) {
  const p = panName(options);
  const cinnamon = options.cinnamon ? `, and ${formatTsp(recipe.cinnamonTsp)} tsp cinnamon` : '';
  const blueberryStep = options.blueberries
    ? `Pat ${options.blueberryG} g blueberries dry, toss with 1 tbsp of the flour already measured above (not extra), then fold in gently at the very end.` : null;
  if (!combined) return [
    `Preheat oven to ${recipe.temp}°C, top + bottom heat, middle rack.`, `Grease/line your ${p}.`,
    `Mash ${recipe.banana} g ripe peeled banana in a bowl.`, 'Add the sugar and vaniljsocker to the wet mixture. Mix ~1 min, then rest 2 min.',
    'Add the melted, cooled butter and neutral oil to the wet mixture.', 'Add the plain yogurt and milk to the wet mixture.', 'Add the lemon juice to the wet mixture. Mix until smooth.',
    'Add the dry mixture to the wet mixture. Mix until just combined.',
    'Fold gently until just combined. Rest the batter 10 min, then give it 2–3 gentle folds. Checkpoint: batter should be thick and spreadable, not runny like pancake batter — if it looks loose, mix in flour 10–15 g at a time; do not add more milk.',
    ...(blueberryStep ? [blueberryStep] : []), `Pour into the pan.`, `Bake at ${recipe.temp}°C for ${recipe.time}.`,
    'Start checking at the low end of the range. Toothpick should show a few moist crumbs, never wet batter; center should spring back gently. (Optional: internal temperature 96–98°C on a food thermometer.)',
    'Cool 15 min in the pan, then move to a rack. Wait 45–60 min before cutting — the crumb keeps setting as it cools. Leave uncovered unless the top browns too fast, then add loose foil (foil does not fix an over-wet batter).',
  ];
  return [
    `Preheat oven to ${recipe.temp}°C, top + bottom heat, middle rack.`, `Grease/line your ${p}.`,
    `Mash ${recipe.banana} g ripe peeled banana in a bowl.`, `Add ${recipe.sugarG} g sugar and ${formatTsp(recipe.vaniljsockerTsp)} tsp vaniljsocker. Mix ~1 min, then rest 2 min.`,
    `Add ${recipe.butterG} g melted, cooled butter and ${recipe.oilMl} ml neutral oil.`, `Add ${recipe.yogurtG} g plain yogurt and ${recipe.milkMl} ml milk.`,
    `Add ${formatTsp(recipe.lemonJuiceTsp)} tsp lemon juice. Mix until smooth.`, `Add ${recipe.flourG} g flour, ${formatTsp(recipe.bakingPowderTsp)} tsp baking powder, ${formatTsp(recipe.bakingSodaTsp)} tsp baking soda, ${formatTsp(recipe.saltTsp)} tsp salt, ${formatTsp(recipe.cardamomTsp)} tsp ground cardamom${cinnamon}.`,
    'Fold gently until just combined. Rest the batter 10 min, then give it 2–3 gentle folds. Checkpoint: batter should be thick and spreadable, not runny like pancake batter — if it looks loose, mix in flour 10–15 g at a time; do not add more milk.',
    ...(blueberryStep ? [blueberryStep] : []), 'Pour into the pan.', `Bake at ${recipe.temp}°C for ${recipe.time}.`,
    'Start checking at the low end of the range. Toothpick should show a few moist crumbs, never wet batter; center should spring back gently. (Optional: internal temperature 96–98°C on a food thermometer.)',
    'Cool 15 min in the pan, then move to a rack. Wait 45–60 min before cutting — the crumb keeps setting as it cools. Leave uncovered unless the top browns too fast, then add loose foil (foil does not fix an over-wet batter).',
  ];
}

function render() {
  const recipe = calculate(S);
  const list = ingredients(recipe, S);
  const combined = S.viewMode === 'combined';
  const output = $('banana-recipe-output');
  const warnings = $('banana-warnings');
  warnings.innerHTML = recipe.warnings.map(w => `<div>${w}</div>`).join('');
  warnings.hidden = recipe.warnings.length === 0;
  $('banana-stat').textContent = `${recipe.temp}°C · ${recipe.time}`;
  const method = steps(recipe, S, combined);
  if (combined) {
    output.innerHTML = `<div class="card"><div class="card-label">Method</div><ol class="recipe-steps">${method.map(step => `<li>${step}</li>`).join('')}</ol></div>`;
  } else {
    const groups = [['Wet', list.wet], ['Dry', list.dry], ['Add-ins', list.addIns]];
    output.innerHTML = `<div class="card"><div class="card-label">Ingredients</div>${groups.filter(([, values]) => values.length).map(([name, values]) => `<div class="ingredient-group"><strong>${name}</strong><ul>${values.map(item => `<li>${item}</li>`).join('')}</ul></div>`).join('')}</div><div class="card"><div class="card-label">Method</div><ol class="recipe-steps">${method.map(step => `<li>${step}</li>`).join('')}</ol></div>`;
  }
}

function copyText() {
  const recipe = calculate(S);
  const list = ingredients(recipe, S);
  const method = steps(recipe, S, S.viewMode === 'combined');
  const lines = [`*Banana Cake — ${recipe.banana} g banana*`, '', '*Ingredients*', ...[...list.wet, ...list.dry, ...list.addIns].map(item => `• ${item}`), '', '*Method*', ...method.map((step, i) => `${i + 1}. ${step}`)];
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

function bindUI() {
  const banana = $('banana-weight-input');
  banana.addEventListener('input', () => { const value = Number(banana.value); if (Number.isFinite(value)) { S.banana = Math.min(900, Math.max(100, value)); saveState(); render(); } });
  ['round', 'loaf'].forEach(type => $(type === 'round' ? 'pan-round-btn' : 'pan-loaf-btn').addEventListener('click', () => { S.panType = type; if (S.blueberries) S.blueberryG = type === 'round' ? 110 : 65; saveState(); restoreInputs(); render(); }));
  ['metal', 'glass'].forEach(material => $(material === 'metal' ? 'pan-metal-btn' : 'pan-glass-btn').addEventListener('click', () => { S.panMaterial = material; saveState(); restoreInputs(); render(); }));
  ['combined', 'separate'].forEach(mode => $(mode === 'combined' ? 'view-combined-btn' : 'view-separate-btn').addEventListener('click', () => { S.viewMode = mode; saveState(); restoreInputs(); render(); }));
  $('blueberry-weight-input').addEventListener('input', e => { const value = Number(e.target.value); if (Number.isFinite(value)) { S.blueberryG = Math.min(500, Math.max(0, value)); saveState(); render(); } });
  bindToggle('blueberry-toggle', 'blueberries'); bindToggle('cinnamon-toggle', 'cinnamon'); $('banana-copy-btn').addEventListener('click', copyText);
}

function setPressed(id, pressed) { const button = $(id); button.setAttribute('aria-pressed', String(pressed)); button.classList.toggle('active', pressed); }
function restoreInputs() {
  $('banana-weight-input').value = S.banana; $('blueberry-weight-input').value = S.blueberryG; $('blueberry-weight-row').hidden = !S.blueberries;
  setPressed('pan-round-btn', S.panType === 'round'); setPressed('pan-loaf-btn', S.panType === 'loaf'); setPressed('pan-metal-btn', S.panMaterial === 'metal'); setPressed('pan-glass-btn', S.panMaterial === 'glass');
  setPressed('blueberry-toggle', S.blueberries); setPressed('cinnamon-toggle', S.cinnamon); setPressed('view-combined-btn', S.viewMode === 'combined'); setPressed('view-separate-btn', S.viewMode === 'separate');
}

function init() { loadState(); bindUI(); restoreInputs(); render(); }

export { ANCHORS, calculate, formatTsp, interpolate };
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
