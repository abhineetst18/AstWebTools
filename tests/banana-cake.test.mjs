// Run: node --test tests/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANCHORS, calculate, formatTsp, ingredients, steps } from '../js/banana-cake.js';

const WET_200 = { banana: 200, bananaCondition: 'wet', panType: 'round', panMaterial: 'metal', blueberries: true, blueberryG: 55, cinnamon: false, viewMode: 'combined' };

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

  for (const combined of [true, false]) {
    await t.test(`includes the mandatory consistency check (${combined ? 'combined' : 'separate'} view)`, () => {
      const method = steps(recipe, WET_200, combined);
      const check = method.find(s => s.startsWith('CONSISTENCY CHECK (mandatory, before baking)'));
      assert.ok(check);
      assert.match(check, /thick and spreadable/);
      assert.match(check, /add 10 g flour, fold gently, reassess/);
      assert.match(check, /5–10 g steps/);
      assert.match(check, /milk 5–10 ml/);
      assert.ok(method.indexOf(check) < method.findIndex(s => s.startsWith('Bake at')), 'check happens before baking');
    });
  }

  await t.test('allows ~30 g extra flour as an observed example, without adding it', () => {
    const wet = recipe.warnings.find(w => /Old \/ wet bananas/.test(w));
    assert.match(wet, /\+30 g \(125 → 155 g flour\)/);
    assert.match(wet, /one example, not a rule/);
    const list = ingredients(recipe, WET_200);
    assert.ok(list.dry.some(i => i.startsWith('125 g flour')));
    assert.ok(list.dry.some(i => /extra flour at hand/.test(i)));
  });

  await t.test('does not treat 155 g as universal for 200 g batches', () => {
    for (const bananaCondition of ['normal', 'wet']) assert.equal(calculate({ ...WET_200, bananaCondition }).flourG, 125);
    assert.ok(!calculate({ ...WET_200, bananaCondition: 'normal' }).warnings.some(w => /155 g/.test(w)));
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
