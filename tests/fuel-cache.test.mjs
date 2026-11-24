import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const scope = 'https://example.test/AstWebTools/';
const worker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const calculator = readFileSync(new URL('../js/phev.js', import.meta.url), 'utf8')
  .replace(/^import .*$/m, ''); // CSV import is not used by the fuel refresh.
const quiet = { warn() {} };

test('one valid snapshot survives a bad response and is reused offline', async () => {
  const entries = new Map();
  let fetchHandler;
  let upstream;
  runInNewContext(worker, {
    URL, Headers, Response, console: quiet,
    self: { registration: { scope }, addEventListener(name, handler) {
      if (name === 'fetch') fetchHandler = handler;
    } },
    caches: { async open() {
      return {
        async put(url, response) { entries.set(url, response); },
        async match(url) { return entries.get(url)?.clone(); },
      };
    } },
    async fetch() {
      if (!upstream) throw new TypeError('Offline');
      return upstream();
    },
  });

  function fetchSnapshot(query) {
    return new Promise(resolve => fetchHandler({
      request: { method: 'GET', url: `${scope}data/fuel-price.json?${query}` },
      respondWith: resolve,
    }));
  }

  upstream = () => Response.json({ median: 15.25 });
  assert.equal((await fetchSnapshot('one')).headers.get('X-Fuel-Cache'), null);
  upstream = () => Response.json({ median: 15.50 });
  await fetchSnapshot('two');
  upstream = () => Response.json({ median: 'bad data' });
  await fetchSnapshot('three');

  upstream = null;
  const offline = await fetchSnapshot('four');
  assert.equal(entries.size, 1);
  assert.equal(offline.headers.get('X-Fuel-Cache'), 'hit');
  assert.deepEqual(await offline.json(), { median: 15.50 });
});

test('only a fresh network snapshot receives the live label', async () => {
  const now = new Date('2026-11-24T11:00:00Z').getTime();
  for (const [hoursOld, cached, expected] of [
    [47, false, 'bensinpriser.nu'],
    [48, false, 'Stale'],
    [1, true, 'Cached'],
    [-1, false, 'Stale'],
  ]) {
    const source = {};
    const input = { value: '16.05' };
    await runInNewContext(`${calculator}\nloadFuelPriceFile();`, {
      document: {
        addEventListener() {},
        getElementById(id) { return { 'fuel-source': source, 'fuel-price-input': input }[id]; },
      },
      localStorage: { setItem() {} },
      Date: class extends Date { static now() { return now; } },
      console: quiet,
      async fetch(url) {
        assert.equal(url, './data/fuel-price.json');
        return Response.json({
          median: 15.50,
          updatedAt: new Date(now - hoursOld * 3600000).toISOString(),
        }, { headers: cached ? { 'X-Fuel-Cache': 'hit' } : {} });
      },
    });
    assert.ok(source.textContent.startsWith(expected));
    assert.equal(source.className.includes('source-live'), expected === 'bensinpriser.nu');
    assert.equal(input.value, expected === 'Stale' ? '16.05' : '15.50');
  }
});

test('a saved manual price survives reload and explicit refresh can replace it', async () => {
  const source = {};
  const input = {};
  const saved = { fuelPrice: 18.5, fuelSource: 'manual' };
  let fetchCount = 0;
  await runInNewContext(`${calculator}
    (async () => {
      init();
      await loadFuelPriceFile();
      checkPreserved();
      await loadFuelPriceFile(true);
    })();`, {
    document: {
      addEventListener() {},
      querySelectorAll() { return []; },
      getElementById(id) { return {
        'fuel-source': source,
        'fuel-price-input': { addEventListener() {}, set value(value) { input.value = value; } },
      }[id]; },
    },
    localStorage: {
      getItem() { return JSON.stringify(saved); },
      setItem(_, value) { Object.assign(saved, JSON.parse(value)); },
    },
    async fetch() {
      fetchCount += 1;
      return Response.json({ median: 15.50, updatedAt: new Date().toISOString() });
    },
    checkPreserved() {
      assert.equal(saved.fuelPrice, 18.5);
      assert.equal(input.value, '18.50');
      assert.equal(source.textContent, 'Manual fuel price');
      assert.equal(fetchCount, 0);
    },
  });
  assert.equal(fetchCount, 1);
  assert.equal(saved.fuelPrice, 15.50);
  assert.equal(saved.fuelSource, 'auto');
});

test('CSV import recovers after failure and leaves the electric share editable', async () => {
  const elements = Object.fromEntries([
    'import-area', 'csv-file-input', 'csv-error', 'csv-stats', 'csv-trips',
    'elec-pct-input', 'monthly-actual',
  ].map(id => [id, {
    listeners: {},
    addEventListener(event, callback) {
      (this.listeners[event] ??= []).push(callback);
    },
    querySelector() { return {}; },
  }]));
  await runInNewContext(`${calculator}
    (async () => {
      init();
      await handleFile({ async arrayBuffer() { return 'bad'; } });
      checkError();
      await handleFile({ async arrayBuffer() { return 'good'; } });
    })();`, {
    document: {
      addEventListener() {},
      querySelectorAll() { return []; },
      getElementById(id) { return elements[id]; },
    },
    localStorage: {
      getItem() { return JSON.stringify({ fuelPrice: 18.5, fuelSource: 'manual' }); },
      setItem() {},
    },
    parseVolvoCsv(result) {
      return result === 'bad'
        ? { ok: false, error: 'Invalid columns', headersFound: 'A & B' }
        : { ok: true, trips: 2, totalKm: 100, monthlyKm: 100, electricPercent: 20, dateRange: {} };
    },
    checkError() {
      assert.equal(elements['csv-error'].hidden, false);
      assert.match(elements['csv-error'].textContent, /A & B/);
    },
  });
  assert.equal(elements['import-area'].listeners.click.length, 1);
  assert.equal(elements['import-area'].listeners.drop.length, 1);
  assert.equal(elements['csv-file-input'].listeners.change.length, 1);
  assert.equal(elements['csv-error'].hidden, true);
  assert.equal(elements['csv-trips'].textContent, '2');
  const slider = elements['elec-pct-input'];
  slider.value = '100';
  slider.listeners.input[0]();
  assert.equal(elements['monthly-actual'].textContent, '27 SEK');
});
