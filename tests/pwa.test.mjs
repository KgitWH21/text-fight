import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);

test('manifest and real app icons support installation under a repository subpath', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root)));
  const scope = 'https://example.test/text-fight-2/';
  assert.equal(new URL(manifest.start_url, scope).href, scope);
  assert.equal(new URL(manifest.scope, scope).href, scope);
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const bytes = await readFile(new URL(icon.src, root));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    const size = Number(icon.sizes.split('x')[0]); assert.equal(bytes.readUInt32BE(16), size); assert.equal(bytes.readUInt32BE(20), size);
  }
});
test('service worker caches full offline shell with subpath isolation and safe update activation', async () => {
  const source = await readFile(new URL('sw.js', root), 'utf8');
  const handlers = {}, cached = new Map(), scope = 'https://example.test/text-fight-2/';
  let activated = 0, claimed = 0, network = true;
  const self = { registration: { scope, active: null }, clients: { claim: async () => { claimed++; } }, skipWaiting: async () => { activated++; }, addEventListener: (type, handler) => { handlers[type] = handler; } };
  const caches = {
    async open(name) {
      if (!cached.has(name)) cached.set(name, new Map());
      const files = cached.get(name);
      return { async addAll(urls) { for (const url of urls) { const relative = new URL(url).pathname.slice('/text-fight-2/'.length) || 'index.html'; const bytes = await readFile(new URL(relative, root)); files.set(url, bytes.toString('base64')); } }, async match(url) { return files.get(url); } };
    }, keys: async () => [...cached.keys()], delete: async key => cached.delete(key)
  };
  vm.runInNewContext(source, { self, URL, caches, fetch: async () => { if (!network) throw Error('Offline'); return 'network'; } });
  let pending;
  handlers.install({ waitUntil(promise) { pending = promise; } }); await pending;
  assert.equal(activated, 1); // Immediate first install.
  cached.set('another-app-cache', new Map()); cached.set('text-fight:/other-repo/:old', new Map()); cached.set('text-fight:/text-fight-2/:old', new Map());
  handlers.activate({ waitUntil(promise) { pending = promise; } }); await pending;
  assert.equal(claimed, 1); assert.ok(cached.has('another-app-cache')); assert.ok(cached.has('text-fight:/other-repo/:old')); assert.ok(!cached.has('text-fight:/text-fight-2/:old'));
  network = false;
  for (const file of ['', 'index.html', 'app.js', 'core.js', 'data/words.json', 'data/sentence-trainer.json', 'manifest.webmanifest']) {
    let response; handlers.fetch({ request: { url: scope + file, method: 'GET' }, respondWith(promise) { response = promise; } });
    assert.ok(await response, `Missing offline resource ${file}`);
  }
  let intercepted = false; handlers.fetch({ request: { url: 'https://words.example.test/word', method: 'GET' }, respondWith() { intercepted = true; } }); assert.equal(intercepted, false);
  // An update waits while an older worker is active, until explicit acceptance.
  self.registration.active = {}; handlers.install({ waitUntil(promise) { pending = promise; } }); await pending; assert.equal(activated, 1);
  handlers.message({ data: { type: 'ACTIVATE_UPDATE' } }); assert.equal(activated, 2);
});
test('all local HTML entry assets exist and resolve beneath a repository subpath', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  for (const [, src] of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) {
    if (src === './') continue;
    await access(new URL(src, root)); assert.ok(new URL(src, 'https://host.test/repo/').pathname.startsWith('/repo/'));
  }
});
