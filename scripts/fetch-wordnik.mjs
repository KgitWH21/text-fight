// Daily Wordnik refresh. The API key comes from the environment and is never logged or written.
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WORD_PATTERN } from '../core.js';

const DEFAULT_FILE = fileURLToPath(new URL('../data/wordnik-words.json', import.meta.url));
const ENDPOINT = 'https://api.wordnik.com/v4/words.json/randomWords';
const MIN_WORDS = 300;
const MAX_WORDS = 500;
const BATCH_LIMIT = 50;
const MAX_CALLS = 16;
const GAP_MS = 1200;
const BACKOFF_MS = [5000, 15000, 45000];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function requestBatch(key, fetchImpl, pause, limit, backoffMs) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('hasDictionaryDef', 'true');
  url.searchParams.set('minLength', '4');
  url.searchParams.set('maxLength', '14');
  url.searchParams.set('minCorpusCount', '1000');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('api_key', key);
  for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    } catch {
      return { ok: false, reason: 'network' };
    }
    if (response.status === 429) {
      if (attempt === backoffMs.length) return { ok: false, reason: 'rate-limit' };
      await pause(backoffMs[attempt]);
      continue;
    }
    if (!response.ok) return { ok: false, reason: 'http' };
    let data;
    try { data = await response.json(); } catch { return { ok: false, reason: 'invalid' }; }
    if (!Array.isArray(data)) return { ok: false, reason: 'invalid' };
    const words = [];
    for (const item of data) {
      const word = item && typeof item.word === 'string' ? item.word : '';
      if (WORD_PATTERN.test(word)) words.push(word);
    }
    return { ok: true, words };
  }
  return { ok: false, reason: 'rate-limit' };
}

async function collectWords(key, options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pause = options.sleep ?? sleep;
  const now = options.now ?? (() => new Date());
  const minWords = options.minWords ?? MIN_WORDS;
  const maxWords = options.maxWords ?? MAX_WORDS;
  const maxCalls = options.maxCalls ?? MAX_CALLS;
  const gapMs = options.gapMs ?? GAP_MS;
  const backoffMs = options.backoffMs ?? BACKOFF_MS;
  const batchLimit = Math.min(options.batchLimit ?? BATCH_LIMIT, BATCH_LIMIT);
  const foldedKey = key.toLocaleLowerCase();
  const words = new Map();
  for (let call = 0; call < maxCalls && words.size < maxWords; call++) {
    if (call > 0) await pause(gapMs);
    const batch = await requestBatch(key, fetchImpl, pause, batchLimit, backoffMs);
    if (!batch.ok) {
      if (words.size >= minWords) break;
      return { ok: false, reason: batch.reason };
    }
    for (const word of batch.words) {
      if (words.size >= maxWords) break;
      const folded = word.toLocaleLowerCase();
      if (folded === foldedKey || folded.includes(foldedKey)) continue;
      if (!words.has(folded)) words.set(folded, word);
    }
  }
  if (words.size < minWords) return { ok: false, reason: 'too-few-words' };
  const list = [...words.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  return { ok: true, generatedAt: now().toISOString().slice(0, 10), words: list.slice(0, maxWords) };
}

export async function refreshWordFile(options = {}) {
  const apiKey = options.apiKey ?? process.env.WORDNIK_API_KEY;
  const file = options.file ?? DEFAULT_FILE;
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    return { changed: false, reason: 'missing-key', message: 'WORDNIK_API_KEY is not set. Existing word file left unchanged.' };
  }
  const key = apiKey.trim();
  let collected;
  try {
    collected = await collectWords(key, options);
  } catch {
    return { changed: false, reason: 'failed', message: 'Wordnik refresh failed. Existing word file left unchanged.' };
  }
  if (!collected.ok) {
    return { changed: false, reason: collected.reason, message: 'Wordnik refresh did not finish. Existing word file left unchanged.' };
  }
  const body = JSON.stringify({ generatedAt: collected.generatedAt, words: collected.words }, null, 2) + '\n';
  if (body.includes(key)) {
    return { changed: false, reason: 'refused', message: 'Wordnik refresh refused to write. Existing word file left unchanged.' };
  }
  let previous = null;
  try { previous = await readFile(file, 'utf8'); } catch { previous = null; }
  if (previous === body) return { changed: false, reason: 'unchanged', message: 'Word list already matches this refresh.' };
  const tmp = `${file}.tmp`;
  try {
    await writeFile(tmp, body);
    await rename(tmp, file);
  } catch {
    await unlink(tmp).catch(() => {});
    return { changed: false, reason: 'write-failed', message: 'Could not save words. Existing word file left unchanged.' };
  }
  return { changed: true, reason: 'updated', message: `Saved ${collected.words.length} words dated ${collected.generatedAt}.` };
}

export async function main(options = {}) {
  const log = options.log ?? console.log;
  try {
    const result = await refreshWordFile(options);
    log(result.message);
    return result;
  } catch {
    log('Wordnik refresh failed. Existing word file left unchanged.');
    return { changed: false, reason: 'failed', message: 'Wordnik refresh failed. Existing word file left unchanged.' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
