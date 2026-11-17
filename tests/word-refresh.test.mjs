import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refreshWordFile, main } from '../scripts/fetch-wordnik.mjs';
import { WORD_PATTERN } from '../core.js';

const KEY = 'syntheticwordnikkeyfortests';
const wordAt = index => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let n = index, body = '';
  for (let place = 0; place < 4; place++) { body = alphabet[n % 26] + body; n = Math.floor(n / 26); }
  return `w${body}`;
};

function pages(count) {
  const words = [];
  for (let index = 0; index < count; index++) {
    words.push({ word: wordAt(index) });
    if (index % 20 === 0) words.push({ word: KEY }, { word: 'bad 1' }, { word: 'a' }, { word: "o'clock" }, { word: 'café' }, { word: 'zephyr' });
  }
  let cursor = 0;
  return () => {
    const slice = words.slice(cursor, cursor + 50);
    cursor += 50;
    return slice;
  };
}

function mockFetch(next, { status = 200, fail = 0, rateLimits = 0 } = {}) {
  const calls = [];
  let limited = 0, failed = 0;
  const fetchImpl = async url => {
    calls.push(url);
    if (limited < rateLimits) { limited++; return { status: 429, ok: false, json: async () => ({}) }; }
    if (failed < fail) { failed++; return { status, ok: false, json: async () => ({ message: KEY }) }; }
    return { status: 200, ok: true, json: async () => next() };
  };
  return { fetchImpl, calls };
}

async function fixture(contents = '{"generatedAt":"keep","words":["kept"]}\n') {
  const dir = await mkdtemp(join(tmpdir(), 'wordnik-'));
  const file = join(dir, 'wordnik-words.json');
  if (contents !== undefined) await writeFile(file, contents);
  return { dir, file, async cleanup() { await rm(dir, { recursive: true, force: true }); } };
}

test('a missing key or a Wordnik failure leaves the existing file alone', async () => {
  const box = await fixture();
  const untouched = await readFile(box.file, 'utf8');
  const missing = await refreshWordFile({ apiKey: '  ', file: box.file, fetchImpl() { throw Error(KEY); } });
  assert.equal(missing.changed, false); assert.equal(missing.reason, 'missing-key');
  assert.equal(missing.message.includes(KEY), false);
  const { fetchImpl } = mockFetch(() => [], { fail: 1, status: 503 });
  const failed = await refreshWordFile({ apiKey: KEY, file: box.file, fetchImpl, sleep: async () => {} });
  assert.equal(failed.changed, false); assert.equal(failed.reason, 'http');
  assert.equal(JSON.stringify(failed).includes(KEY), false);
  const thrown = await main({ apiKey: KEY, file: box.file, fetchImpl: async () => { throw Error(`api_key=${KEY}`); }, sleep: async () => {}, log() {} });
  assert.equal(thrown.changed, false); assert.equal(JSON.stringify(thrown).includes(KEY), false);
  assert.equal(await readFile(box.file, 'utf8'), untouched);
  await box.cleanup();
});

test('the refresh writes 300 to 500 sanitized words and never the key', async () => {
  const box = await fixture();
  const sleeps = [];
  const next = pages(520, ["o'clock", 'café']);
  const { fetchImpl, calls } = mockFetch(next, { rateLimits: 1 });
  const logs = [];
  const result = await main({
    apiKey: KEY, file: box.file, fetchImpl, now: () => new Date('2026-11-17T15:04:00Z'),
    sleep: async ms => { sleeps.push(ms); }, log: message => logs.push(message)
  });
  assert.equal(result.changed, true); assert.equal(result.reason, 'updated');
  const saved = JSON.parse(await readFile(box.file, 'utf8'));
  assert.equal(saved.generatedAt, '2026-11-17');
  assert.ok(saved.words.length >= 300 && saved.words.length <= 500);
  assert.equal(new Set(saved.words.map(word => word.toLocaleLowerCase())).size, saved.words.length);
  for (const word of saved.words) assert.match(word, WORD_PATTERN);
  const serialized = JSON.stringify(saved) + logs.join('\n') + JSON.stringify(result);
  assert.equal(serialized.includes(KEY), false);
  assert.equal(saved.words.includes("o'clock"), true);
  assert.ok(calls.length >= 6);
  for (const url of calls) {
    assert.equal(url.origin, 'https://api.wordnik.com');
    assert.equal(url.pathname, '/v4/words.json/randomWords');
    assert.equal(url.searchParams.get('hasDictionaryDef'), 'true');
    assert.equal(url.searchParams.get('minLength'), '4');
    assert.equal(url.searchParams.get('maxLength'), '14');
    assert.equal(url.searchParams.get('minCorpusCount'), '1000');
    assert.equal(url.searchParams.get('limit'), '50');
    assert.equal(url.searchParams.get('api_key'), KEY);
  }
  assert.equal(sleeps[0], 5000);
  assert.ok(sleeps.includes(1200));
  let replay = 0;
  const same = await refreshWordFile({
    apiKey: KEY, file: box.file, now: () => new Date('2026-11-17T18:00:00Z'), sleep: async () => {},
    fetchImpl: async () => {
      const slice = saved.words.slice(replay, replay + 50).map(word => ({ word }));
      replay += 50;
      return { status: 200, ok: true, json: async () => slice };
    }
  });
  assert.equal(same.changed, false); assert.equal(same.reason, 'unchanged');
  await box.cleanup();
});

test('fewer than 300 usable words does not replace the file', async () => {
  const box = await fixture();
  const before = await readFile(box.file, 'utf8');
  const { fetchImpl } = mockFetch(() => Array.from({ length: 10 }, (_, index) => ({ word: wordAt(index) })));
  const result = await refreshWordFile({ apiKey: KEY, file: box.file, fetchImpl, sleep: async () => {}, maxCalls: 2 });
  assert.equal(result.changed, false); assert.equal(result.reason, 'too-few-words');
  assert.equal(await readFile(box.file, 'utf8'), before);
  await box.cleanup();
});

test('the app and workflow keep the Wordnik key on the server side of GitHub', async () => {
  const root = new URL('../', import.meta.url);
  const app = await readFile(new URL('app.js', root), 'utf8');
  const html = await readFile(new URL('index.html', root), 'utf8');
  const worker = await readFile(new URL('sw.js', root), 'utf8');
  const script = await readFile(new URL('scripts/fetch-wordnik.mjs', root), 'utf8');
  const workflow = await readFile(new URL('.github/workflows/refresh-words.yml', root), 'utf8');
  const pages = await readFile(new URL('.github/workflows/pages.yml', root), 'utf8');
  assert.equal(app.includes('WORDNIK_API_KEY'), false);
  assert.equal(app.includes('api.wordnik.com'), false);
  assert.equal(html.includes('wordnikPassword'), false);
  assert.equal(html.includes('wordnikEndpoint'), false);
  assert.equal(worker.includes('./data/wordnik-words.json'), true);
  for (const needle of ['console.log(key', 'console.log(url', 'console.log(error', 'console.log(apiKey']) assert.equal(script.includes(needle), false);
  assert.match(workflow, /WORDNIK_API_KEY: \$\{\{ secrets\.WORDNIK_API_KEY \}\}/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron:/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(pages, /actions\/deploy-pages@v4/);
  const deck = JSON.parse(await readFile(new URL('data/wordnik-words.json', root), 'utf8'));
  assert.ok(Array.isArray(deck.words));
  for (const word of deck.words) assert.match(word, WORD_PATTERN);
});
