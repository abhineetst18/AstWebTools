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
    const input = {};
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
    assert.equal(input.value, '15.50');
  }
});
