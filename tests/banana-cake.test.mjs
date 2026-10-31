// Run: node --test tests/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANCHORS, calculate, calibration, formatTsp, ingredients, steps } from '../js/banana-cake.js';
import { REFERENCE_BAKES, addBake, adjustmentEvidence, allBakes, createBakeRecord, loadHistory, saveHistory } from '../js/bake-history.js';

const WET_200 = { banana: 200, bananaCondition: 'wet', panType: 'round', panMaterial: 'metal', blueberries: true, blueberryG: 55, cinnamon: false, viewMode: 'combined' };

function memoryStorage() {
  const data = new Map();
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
}

test('acceptance: 200 g old/wet bananas + 50–60 g blueberries', async t => {
  const recipe = calculate(WET_200);

  await t.test('generates the initial (calculated) recipe the successful bake started from', () => {
    assert.equal(recipe.flourG, 125);
    assert.equal(recipe.sugarG, 63);
    assert.equal(recipe.butterG, 38);
    assert.equal(recipe.oilMl, 12);
    assert.equal(recipe.yogurtG, 50);
    assert.equal(recipe.milkMl, 60);
    assert.equal(formatTsp(recipe.lemonJuiceTsp), '⅝');
    assert.equal(formatTsp(recipe.bakingPowderTsp), '⅝');
    assert.equal(formatTsp(recipe.bakingSodaTsp), '¼');
    assert.equal(formatTsp(recipe.saltTsp), '¼');
    assert.equal(formatTsp(recipe.cardamomTsp), '¼');
    assert.equal(formatTsp(recipe.vaniljsockerTsp), '1¼');
  });

  await t.test('warns that banana moisture varies', () => {
    assert.match(recipe.moistureNote, /moisture varies/);
    assert.match(recipe.moistureNote, /two batches of exactly 200 g can need different amounts of flour/);
    assert.ok(recipe.warnings.some(w => /Old \/ wet bananas/.test(w)));
  });

  const calib = calibration(recipe, WET_200, REFERENCE_BAKES);
  for (const combined of [true, false]) {
    await t.test(`includes the mandatory consistency check (${combined ? 'combined' : 'separate'} view)`, () => {
      const method = steps(recipe, WET_200, combined, calib);
      const check = method.find(s => s.startsWith('CONSISTENCY CHECK (mandatory, before baking)'));
      assert.ok(check);
      assert.match(check, /thick and spreadable/);
      assert.match(check, /add 10 g flour, fold gently, reassess/);
      assert.match(check, /5–10 g steps/);
      assert.match(check, /milk 5–10 ml/);
      assert.ok(method.indexOf(check) < method.findIndex(s => s.startsWith('Bake at')), 'check happens before baking');
    });
  }

  await t.test('allows ~30 g extra flour as evidence, without adding it', () => {
    assert.equal(calib.reserveFlourG, 30);
    assert.match(calib.evidenceText, /~30 g extra flour/);
    assert.match(calib.evidenceText, /not a requirement/);
    const list = ingredients(recipe, WET_200, calib);
    assert.ok(list.dry.some(i => i.startsWith('125 g flour')));
    assert.ok(list.dry.some(i => /~30 g \(add only if needed\)/.test(i)));
  });

  await t.test('records calculated 125 g and final 155 g flour', () => {
    const record = createBakeRecord({ banana: 200, condition: 'wet', blueberriesG: 55, calculatedFlourG: recipe.flourG, addedFlourG: 30, outcome: 'good' });
    assert.equal(record.calculatedFlourG, 125);
    assert.equal(record.addedFlourG, 30);
    assert.equal(record.actualFlourG, 155);
    const ref = REFERENCE_BAKES[0];
    assert.deepEqual([ref.banana, ref.condition, ref.calculatedFlourG, ref.addedFlourG, ref.actualFlourG, ref.outcome], [200, 'wet', 125, 30, 155, 'good']);
  });

  await t.test('does not treat 155 g as universal for 200 g batches', () => {
    for (const bananaCondition of ['normal', 'wet']) assert.equal(calculate({ ...WET_200, bananaCondition }).flourG, 125);
    const normal = calibration(calculate({ ...WET_200, bananaCondition: 'normal' }), { bananaCondition: 'normal' }, REFERENCE_BAKES);
    assert.equal(normal.reserveFlourG, null, 'wet-banana evidence does not apply to normal bananas');
    const dryBake = createBakeRecord({ banana: 200, condition: 'wet', calculatedFlourG: 125, addedFlourG: 0, outcome: 'good' });
    const evidence = adjustmentEvidence(allBakes([dryBake]), { banana: 200, condition: 'wet', calculatedFlourG: 125 });
    assert.deepEqual([evidence.minExtraG, evidence.maxExtraG], [0, 30], 'new evidence widens the range instead of fixing 30 g');
  });
});

test('anchors and interpolation stay sane across the input range', () => {
  for (const anchor of ANCHORS) assert.equal(calculate({ ...WET_200, banana: anchor.banana }).flourG, anchor.flourG);
  for (let banana = 100; banana <= 500; banana += 10) {
    const r = calculate({ ...WET_200, banana });
    for (const field of ['flourG', 'sugarG', 'butterG', 'oilMl', 'yogurtG', 'milkMl']) assert.ok(r[field] > 0, `${field} > 0 at ${banana} g`);
  }
  const small = calculate({ ...WET_200, banana: 100 });
  assert.equal(small.flourG, 63);
  assert.ok(small.belowRange && small.warnings[0].includes('200 g'));
});

test('bake history persists, validates and only uses successful bakes as evidence', () => {
  const storage = memoryStorage();
  const sunk = createBakeRecord({ banana: 200, condition: 'wet', calculatedFlourG: 125, addedFlourG: 60, outcome: 'sunk' });
  saveHistory(storage, addBake([], sunk));
  const loaded = loadHistory(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].actualFlourG, 185);
  const evidence = adjustmentEvidence(allBakes(loaded), { banana: 200, condition: 'wet', calculatedFlourG: 125 });
  assert.equal(evidence.maxExtraG, 30);
  assert.throws(() => createBakeRecord({ banana: 200, condition: 'wet', calculatedFlourG: 125, addedFlourG: -5, outcome: 'good' }), /addedFlourG/);
  storage.setItem('mytools_bananacake_history_v1', '[{"banana":"x"}]');
  assert.deepEqual(loadHistory(storage), []);
});
