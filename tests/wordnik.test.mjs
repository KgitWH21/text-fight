import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

async function harness() {
  const source = await readFile(new URL('../examples/wordnik-worker.js', import.meta.url), 'utf8');
  let clock = 1800000000000, cached, upstreamStatus = 200, denyLogin = false, denyDraw = false;
  let upstreamError = null, invalidJSON = false, upstreamWord = 'lantern', cacheError = false;
  const stats = { upstreamCalls: 0, cacheReads: 0, loginAttempts: 0, draws: 0, upstreamURL: null };
  const env = {
    ALLOWED_ORIGIN: 'https://example.test', WORDNIK_API_KEY: 'synthetic-wordnik-key-for-tests-only',
    WORDNIK_ACCESS_PASSWORD: 'synthetic-endpoint-password-for-tests', SESSION_SIGNING_KEY: 'S'.repeat(43),
    AUTH_RATE_LIMITER: { limit: async ({ key }) => { stats.loginAttempts++; assert.equal(key, '192.0.2.1'); return { success: !denyLogin }; } },
    RATE_LIMITER: { limit: async () => { stats.draws++; return { success: !denyDraw }; } }
  };
  const context = vm.createContext({
    URL, URLSearchParams, Request, Response, AbortSignal, TextEncoder, TextDecoder, btoa, atob, crypto: webcrypto, Date: { now: () => clock },
    caches: { default: { match: async () => { stats.cacheReads++; if (cacheError) throw Error(env.WORDNIK_API_KEY); return cached?.clone(); }, put: async (key, response) => { cached = response; } } },
    fetch: async (url, options) => {
      stats.upstreamCalls++; stats.upstreamURL = url; assert.equal(options.redirect, 'error');
      if (upstreamError) throw upstreamError;
      return invalidJSON ? new Response(env.WORDNIK_API_KEY, { status: 200 }) : Response.json({ word: upstreamWord }, { status: upstreamStatus });
    }
  });
  vm.runInContext(source.replace('export default', 'globalThis.worker ='), context);
  const send = (path = '/word', { token, origin = env.ALLOWED_ORIGIN, method = 'GET', body, type, protocol = 'https:' } = {}, settings = env) => {
    const headers = { Origin: origin, 'CF-Connecting-IP': '192.0.2.1' };
    if (token !== undefined) headers.Authorization = `Bearer ${token}`;
    if (type) headers['Content-Type'] = type;
    return context.worker.fetch(new Request(`${protocol}//words.test${path}`, { method, headers, ...(body === undefined ? {} : { body }) }), settings);
  };
  const login = (password = env.WORDNIK_ACCESS_PASSWORD, options = {}) => send('/word/auth', { method: 'POST', type: 'application/json', body: JSON.stringify({ password }), ...options });
  const token = async () => { const response = await login(); assert.equal(response.status, 200); return (await response.json()).token; };
  return { env, stats, send, login, token, advance: seconds => { clock += seconds * 1000; }, upstream: status => { upstreamStatus = status; }, limitLogin: () => { denyLogin = true; }, limitDraw: () => { denyDraw = true; },
    fault(type) {
      if (type === 'timeout' || type === 'network') upstreamError = Object.assign(new Error(env.WORDNIK_API_KEY), { name: type === 'timeout' ? 'TimeoutError' : 'TypeError' });
      if (type === 'json') invalidJSON = true;
      if (type === 'word') upstreamWord = env.WORDNIK_API_KEY + '<html>';
      if (type === 'cache') cacheError = true;
    }
  };
}

test('Wordnik fails closed when any authentication secret or rate limiter is missing', async () => {
  const h = await harness();
  for (const name of ['WORDNIK_API_KEY', 'WORDNIK_ACCESS_PASSWORD', 'SESSION_SIGNING_KEY', 'AUTH_RATE_LIMITER', 'RATE_LIMITER']) {
    const env = { ...h.env }; delete env[name];
    const response = await h.send('/word', {}, env);
    assert.equal(response.status, 503);
    assert.deepEqual((await response.json()).missing, [name]);
    assert.equal((await h.send('/auth', { method: 'POST' }, env)).status, 503);
  }
  const shortPassword = await h.send('/word', {}, { ...h.env, WORDNIK_ACCESS_PASSWORD: 'short' });
  assert.equal(shortPassword.status, 503); assert.deepEqual((await shortPassword.json()).missing, ['WORDNIK_ACCESS_PASSWORD']);
  const invalidSigningKey = await h.send('/auth', { method: 'POST' }, { ...h.env, SESSION_SIGNING_KEY: 'invalid-signing-key-value' });
  const diagnostic = await invalidSigningKey.text();
  assert.equal(invalidSigningKey.status, 503); assert.deepEqual(JSON.parse(diagnostic).missing, ['SESSION_SIGNING_KEY']);
  assert.ok(!diagnostic.includes('invalid-signing-key-value'));
  assert.ok(!diagnostic.includes(h.env.WORDNIK_API_KEY)); assert.ok(!diagnostic.includes(h.env.WORDNIK_ACCESS_PASSWORD));
  assert.equal(h.stats.upstreamCalls, 0); assert.equal(h.stats.cacheReads, 0);
});

test('unauthenticated and forged-token draws never reach cached words or Wordnik', async () => {
  const h = await harness();
  for (const token of [undefined, '', 'fake', 'not.a.signature', 'A'.repeat(1500)]) {
    const response = await h.send('/word', { token });
    assert.equal(response.status, 401); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  assert.equal(h.stats.cacheReads, 0); assert.equal(h.stats.upstreamCalls, 0); assert.equal(h.stats.draws, 0);
});

test('login checks the password, bounds the body, throttles attempts and never calls Wordnik', async () => {
  const h = await harness();
  assert.equal((await h.login('wrong-password')).status, 401);
  assert.equal((await h.send('/auth', { method: 'POST', body: 'password=text', type: 'text/plain' })).status, 415);
  assert.equal((await h.send('/auth', { method: 'POST', body: '{broken', type: 'application/json' })).status, 400);
  assert.equal((await h.send('/auth', { method: 'POST', body: JSON.stringify({ password: 'x'.repeat(3000) }), type: 'application/json' })).status, 400);
  h.limitLogin(); const response = await h.login();
  assert.equal(response.status, 429); assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal(h.stats.loginAttempts, 5); assert.equal(h.stats.upstreamCalls, 0); assert.equal(h.stats.cacheReads, 0);
});

test('successful login issues a one-hour signed token with no password or API key in the response', async () => {
  const h = await harness(), response = await h.login();
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const text = await response.text(), result = JSON.parse(text);
  assert.equal(result.expiresIn, 3600); assert.equal(result.token.split('.').length, 2);
  assert.ok(!text.includes(h.env.WORDNIK_API_KEY)); assert.ok(!text.includes(h.env.WORDNIK_ACCESS_PASSWORD));
  const claim = JSON.parse(Buffer.from(result.token.split('.')[0], 'base64url'));
  assert.equal(claim.aud, h.env.ALLOWED_ORIGIN); assert.equal(claim.exp - claim.iat, 3600);
});

test('only authenticated draws use the upstream and cache; quotas still apply to cached draws', async () => {
  const h = await harness(), token = await h.token();
  let response = await h.send('/word', { token });
  assert.equal(response.status, 200); assert.equal(response.headers.get('Access-Control-Allow-Origin'), h.env.ALLOWED_ORIGIN);
  const text = await response.text(); assert.equal(JSON.parse(text).word, 'lantern');
  assert.ok(!text.includes(h.env.WORDNIK_API_KEY)); assert.ok(!text.includes(token));
  assert.equal(h.stats.upstreamURL.origin, 'https://api.wordnik.com');
  assert.equal(h.stats.upstreamURL.searchParams.get('api_key'), h.env.WORDNIK_API_KEY);
  response = await h.send('/', { token }); assert.equal(response.status, 200); assert.equal(h.stats.upstreamCalls, 1);
  const reads = h.stats.cacheReads;
  assert.equal((await h.send('/word')).status, 401); assert.equal(h.stats.cacheReads, reads);
  h.limitDraw(); assert.equal((await h.send('/word', { token })).status, 429); assert.equal(h.stats.cacheReads, reads);
});

test('expired, tampered, wrong-origin and revoked tokens cannot read a warm word cache', async () => {
  const h = await harness(), token = await h.token();
  await h.send('/word', { token }); const reads = h.stats.cacheReads;
  const [payload, signature] = token.split('.');
  assert.equal((await h.send('/word', { token: `${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}` })).status, 401);
  const altered = Buffer.from(JSON.stringify({ v: 1, aud: h.env.ALLOWED_ORIGIN, iat: 1800000000, exp: 1800009999 })).toString('base64url');
  assert.equal((await h.send('/word', { token: `${altered}.${signature}` })).status, 401);
  assert.equal((await h.send('/word', { token, origin: 'https://other.test' })).status, 403);
  assert.equal((await h.send('/word', { token, origin: 'https://other.test' }, { ...h.env, ALLOWED_ORIGIN: 'https://other.test' })).status, 401);
  assert.equal((await h.send('/word', { token }, { ...h.env, WORDNIK_ACCESS_PASSWORD: 'rotated-synthetic-password-for-tests' })).status, 401);
  assert.equal((await h.send('/word', { token }, { ...h.env, SESSION_SIGNING_KEY: 'T'.repeat(43) })).status, 401);
  h.advance(3600); assert.equal((await h.send('/word', { token })).status, 401);
  assert.equal(h.stats.cacheReads, reads); assert.equal(h.stats.upstreamCalls, 1);
});

test('CORS preflight permits auth headers while HTTPS, route and method checks remain enforced', async () => {
  const h = await harness();
  for (const [path, method] of [['/word', 'GET'], ['/auth', 'POST']]) {
    const response = await h.send(path, { method: 'OPTIONS' });
    assert.equal(response.status, 204); assert.equal(response.headers.get('Access-Control-Allow-Methods'), method);
    assert.match(response.headers.get('Access-Control-Allow-Headers'), /Authorization/);
    assert.match(response.headers.get('Access-Control-Allow-Headers'), /Content-Type/);
    assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
  }
  assert.equal((await h.send('/auth')).status, 405);
  assert.equal((await h.send('/word', { method: 'POST' })).status, 405);
  assert.equal((await h.send('/other')).status, 404);
  assert.equal((await h.send('/word?token=bad')).status, 400);
  assert.equal((await h.send('/word', { protocol: 'http:' })).status, 426);
  assert.equal((await h.send('/auth', { method: 'OPTIONS', origin: 'https://other.test' })).status, 403);
  assert.equal(h.stats.loginAttempts, 0); assert.equal(h.stats.upstreamCalls, 0);
});

test('upstream rate limits and outages return a safe local-fallback response', async () => {
  const h = await harness(), token = await h.token();
  for (const status of [400, 401, 403, 404, 429, 500]) {
    h.upstream(status); const response = await h.send('/word', { token });
    assert.equal(response.status, status === 429 ? 429 : 503);
    assert.deepEqual(await response.json(), { error: 'Wordnik rejected the request', code: 'WORDNIK_UPSTREAM_ERROR', upstreamStatus: status });
  }
  const response = await h.send('/word', { token });
  const text = await response.text(); assert.ok(!text.includes(h.env.WORDNIK_API_KEY)); assert.ok(!text.includes(h.env.WORDNIK_ACCESS_PASSWORD));
});

test('draw diagnostics distinguish timeouts, network failures, bad responses and Worker errors without leaking secrets', async () => {
  for (const [fault, code, stage] of [
    ['timeout', 'WORDNIK_TIMEOUT', 'wordnik_request'], ['network', 'WORDNIK_NETWORK_ERROR', 'wordnik_request'],
    ['json', 'WORDNIK_INVALID_RESPONSE', 'wordnik_response'], ['word', 'WORDNIK_INVALID_WORD', null],
    ['cache', 'WORD_SERVICE_ERROR', 'cache_read']
  ]) {
    const h = await harness(), token = await h.token(); h.fault(fault);
    const response = await h.send('/word', { token }), text = await response.text(), body = JSON.parse(text);
    assert.equal(response.status, 503); assert.equal(body.code, code);
    if (stage) assert.equal(body.stage, stage);
    assert.ok(!text.includes(h.env.WORDNIK_API_KEY)); assert.ok(!text.includes(h.env.WORDNIK_ACCESS_PASSWORD));
    assert.ok(!text.includes(h.env.SESSION_SIGNING_KEY)); assert.ok(!text.includes(token));
  }
});

test('configured localhost and GitHub Pages origins work independently with exact CORS and origin-bound tokens', async () => {
  const h = await harness();
  const config = JSON.parse(await readFile(new URL('../examples/wrangler.jsonc', import.meta.url), 'utf8'));
  h.env.ALLOWED_ORIGIN = config.vars.ALLOWED_ORIGIN;
  const origins = ['https://kgitwh21.github.io', 'http://localhost:4173'], tokens = [];
  for (const origin of origins) {
    const preflight = await h.send('/word', { method: 'OPTIONS', origin });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(preflight.headers.get('Vary'), 'Origin');
    const login = await h.login(h.env.WORDNIK_ACCESS_PASSWORD, { origin });
    assert.equal(login.status, 200); assert.equal(login.headers.get('Access-Control-Allow-Origin'), origin);
    const { token } = await login.json(); tokens.push(token);
    const word = await h.send('/word', { token, origin });
    assert.equal(word.status, 200); assert.equal(word.headers.get('Access-Control-Allow-Origin'), origin);
  }
  assert.equal((await h.send('/word', { origin: origins[1], token: tokens[0] })).status, 401);
  assert.equal((await h.send('/word', { origin: origins[0], token: tokens[1] })).status, 401);
  for (const origin of ['http://localhost:4174', 'http://localhost.evil.test:4173', 'https://kgitwh21.github.io.evil.test', 'null', '']) {
    const response = await h.send('/auth', { method: 'OPTIONS', origin });
    assert.equal(response.status, 403); assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
});
