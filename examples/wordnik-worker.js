// Optional authenticated Cloudflare Worker; excluded from the static app.
// Secrets: WORDNIK_API_KEY, WORDNIK_ACCESS_PASSWORD, SESSION_SIGNING_KEY.
// Deploy with examples/wrangler.jsonc so both rate-limit bindings are present.
const SESSION_SECONDS = 3600;
const encoder = new TextEncoder();
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw Error('Invalid encoding');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
}
async function signingKey(env) {
  return crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SIGNING_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
const sessionMessage = (env, payload) => encoder.encode(`text-fight-session-v1\0${env.WORDNIK_ACCESS_PASSWORD}\0${payload}`);
async function issueToken(env, origin, key) {
  const now = Math.floor(Date.now() / 1000);
  const payload = encode(encoder.encode(JSON.stringify({ v: 1, aud: origin, iat: now, exp: now + SESSION_SECONDS })));
  return `${payload}.${encode(await crypto.subtle.sign('HMAC', key, sessionMessage(env, payload)))}`;
}
async function authenticated(request, env, origin, key) {
  const authorization = request.headers.get('Authorization') || '';
  if (authorization.length > 1024 || !authorization.startsWith('Bearer ')) return false;
  const parts = authorization.slice(7).split('.');
  if (parts.length !== 2) return false;
  try {
    if (!await crypto.subtle.verify('HMAC', key, decode(parts[1]), sessionMessage(env, parts[0]))) return false;
    const claim = JSON.parse(new TextDecoder().decode(decode(parts[0]))), now = Math.floor(Date.now() / 1000);
    return claim.v === 1 && claim.aud === origin && Number.isInteger(claim.iat) && Number.isInteger(claim.exp) &&
      claim.iat <= now + 30 && claim.exp > now && claim.exp - claim.iat === SESSION_SECONDS;
  } catch { return false; }
}
async function loginPassword(request) {
  // Bound the streamed body, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw Error('Missing body');
  let size = 0; const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 2048) { await reader.cancel(); throw Error('Body too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const body = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof body.password !== 'string' || !body.password.length || body.password.length > 256) throw Error('Invalid body');
  return body.password;
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin'), url = new URL(request.url);
    const allowedOrigins = new Set((env.ALLOWED_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean));
    const allowed = allowedOrigins.has(origin);
    const headers = { ...(allowed ? { 'Access-Control-Allow-Origin': origin } : {}), 'Vary': 'Origin', 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    const reply = (data, status = 200, extra = {}) => Response.json(data, { status, headers: { ...headers, ...extra } });
    if (url.protocol !== 'https:') return reply({ error: 'HTTPS required' }, 426);
    if (!allowed) return reply({ error: 'Origin not allowed' }, 403);
    if (url.search) return reply({ error: 'Query parameters are not supported' }, 400);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const login = path === '/auth' || path === '/word/auth';
    if (!login && path !== '/' && path !== '/word') return reply({ error: 'Not found' }, 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': login ? 'POST' : 'GET', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' } });
    if (request.method !== (login ? 'POST' : 'GET')) return reply({ error: 'Method not allowed' }, 405);
    // No public fallback: incomplete deployments fail closed, even with a cached
    // word. Login throttling and authenticated draw throttling are mandatory.
    const missing = [];
    if (typeof env.WORDNIK_API_KEY !== 'string' || !env.WORDNIK_API_KEY.trim()) missing.push('WORDNIK_API_KEY');
    if (typeof env.WORDNIK_ACCESS_PASSWORD !== 'string' || env.WORDNIK_ACCESS_PASSWORD.length < 16 || env.WORDNIK_ACCESS_PASSWORD.length > 256) missing.push('WORDNIK_ACCESS_PASSWORD');
    if (!/^[A-Za-z0-9_-]{43}$/.test(env.SESSION_SIGNING_KEY || '')) missing.push('SESSION_SIGNING_KEY');
    if (typeof env.AUTH_RATE_LIMITER?.limit !== 'function') missing.push('AUTH_RATE_LIMITER');
    if (typeof env.RATE_LIMITER?.limit !== 'function') missing.push('RATE_LIMITER');
    if (missing.length) return reply({ error: 'Word service not configured', missing }, 503);
    let stage = 'authentication';
    try {
      const ip = request.headers.get('CF-Connecting-IP') || 'anonymous';
      const key = await signingKey(env);
      if (login) {
        if (!(await env.AUTH_RATE_LIMITER.limit({ key: ip })).success) return reply({ error: 'Too many connection attempts. Try again later.' }, 429, { 'Retry-After': '60' });
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return reply({ error: 'JSON body required' }, 415);
        let password;
        try { password = await loginPassword(request); } catch { return reply({ error: 'Invalid connection request' }, 400); }
        // Web Crypto compares MACs instead of an early-exit password comparison.
        const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(`text-fight-password-v1\0${env.WORDNIK_ACCESS_PASSWORD}`));
        if (!await crypto.subtle.verify('HMAC', key, expected, encoder.encode(`text-fight-password-v1\0${password}`))) return reply({ error: 'Connection failed. Check your password.' }, 401);
        return reply({ token: await issueToken(env, origin, key), expiresIn: SESSION_SECONDS });
      }
      if (!await authenticated(request, env, origin, key)) return reply({ error: 'Connect to Wordnik again' }, 401, { 'WWW-Authenticate': 'Bearer realm="Text Fight Wordnik"' });
      stage = 'draw_rate_limit';
      if (!(await env.RATE_LIMITER.limit({ key: ip })).success) return reply({ error: 'Try the local deck' }, 429, { 'Retry-After': '60' });
      stage = 'cache_read';
      const cache = caches.default, cacheKey = new Request(new URL('/cached-word', request.url));
      const cached = await cache.match(cacheKey);
      if (cached) return new Response(cached.body, { headers });
      const upstreamURL = new URL('https://api.wordnik.com/v4/words.json/randomWord');
      upstreamURL.search = new URLSearchParams({ hasDictionaryDef: 'true', minLength: '4', maxLength: '14', minCorpusCount: '1000', api_key: env.WORDNIK_API_KEY });
      stage = 'wordnik_request';
      const upstream = await fetch(upstreamURL, { signal: AbortSignal.timeout(2000), redirect: 'error' });
      // Report only safe status metadata. Wordnik error bodies, request URLs and
      // exception messages may contain credentials and are never forwarded.
      if (!upstream.ok) return reply({ error: 'Wordnik rejected the request', code: 'WORDNIK_UPSTREAM_ERROR', upstreamStatus: upstream.status }, upstream.status === 429 ? 429 : 503);
      stage = 'wordnik_response';
      const result = await upstream.json();
      if (typeof result?.word !== 'string' || !/^[\p{L}][\p{L}'’\-]{1,39}$/u.test(result.word)) return reply({ error: 'Wordnik returned an unusable word', code: 'WORDNIK_INVALID_WORD' }, 503);
      const value = { word: result.word, definition: 'A live Wordnik draw. Give this word a place in your scene.' };
      stage = 'cache_write';
      await cache.put(cacheKey, new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' } }));
      return reply(value);
    } catch (error) {
      const code = stage === 'wordnik_request' ? (error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'WORDNIK_TIMEOUT' : 'WORDNIK_NETWORK_ERROR') : stage === 'wordnik_response' ? 'WORDNIK_INVALID_RESPONSE' : 'WORD_SERVICE_ERROR';
      return reply({ error: 'Live word request failed; offline words are available', code, stage }, 503);
    }
  }
};
