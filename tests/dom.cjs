// Interaction harness when a browser is unavailable. This does not render CSS
// or validate a physical keyboard, installation, or a real service worker.
const { JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || 'jsdom');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
async function main() {
  const core = await import(pathToFileURL(path.join(root, 'core.js')));
  let storage, copied = '', liveResponse = { status: 429 }, fetchCount = 0, downloadBlob, downloadName;
  const TEST_PASSWORD = 'synthetic-endpoint-password-for-tests';
  const TEST_TOKEN = 'synthetic_payload.' + 'S'.repeat(43);
  let authStatus = 200, authDelay = null, authDiagnostic = null;
  const wordRequests = [], authRequests = [];
  const errors = [];
  async function boot() {
    const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error.message));
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://example.test/text-fight-2/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
    const w = dom.window;
    let clock = 0, hidden = false;
    Object.defineProperty(w.performance, 'now', { value: () => clock });
    Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => hidden });
    w.setInterval = callback => { w.__tick = callback; return 1; };
    if (storage) w.localStorage.setItem('text-fight-v1', storage);
    w.__core = core;
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
    Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } } });
    w.Blob = Blob; w.URL.createObjectURL = blob => { downloadBlob = blob; return 'blob:test'; }; w.URL.revokeObjectURL = () => {};
    w.HTMLAnchorElement.prototype.click = function () { downloadName = this.download; };
    w.fetch = async (url, options = {}) => {
      if (url.startsWith('https:')) {
        if (url.endsWith('/auth')) {
          authRequests.push({ url, ...options }); if (authDelay) await authDelay;
          const status = JSON.parse(options.body).password === TEST_PASSWORD ? authStatus : 401;
          return { status, ok: status === 200, json: async () => authDiagnostic || ({ token: TEST_TOKEN, expiresIn: 3600 }) };
        }
        fetchCount++; wordRequests.push({ url, ...options });
        assert.equal(options.headers.Authorization, `Bearer ${TEST_TOKEN}`);
        assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
        if (liveResponse.throw) throw Error('offline'); return { status: liveResponse.status, ok: liveResponse.status === 200, json: async () => liveResponse.body };
      }
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, url), 'utf8')) };
    };
    const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/^import \{([^}]+)\} from '\.\/core\.js';/, 'const {$1} = window.__core;');
    await w.eval(`(async()=>{${source}\n})()`);
    return { dom, w, $: id => w.document.getElementById(id), state: () => JSON.parse(w.localStorage.getItem('text-fight-v1')),
      advance(ms) { clock += ms; w.__tick?.(); }, setHidden(value) { hidden = value; w.document.dispatchEvent(new w.Event('visibilitychange')); },
      async finish() { await new Promise(resolve => w.setTimeout(resolve, 0)); storage = w.localStorage.getItem('text-fight-v1'); w.close(); } };
  }
  let app = await boot();
  async function connect(endpoint) {
    app.$('settingsButton').click(); app.$('wordnikEndpoint').value = endpoint; app.$('connectWordnik').click();
    app.$('wordnikPassword').value = TEST_PASSWORD;
    app.$('wordnikAuthForm').dispatchEvent(new app.w.Event('submit', { cancelable: true }));
    await new Promise(setImmediate);
    assert.equal(app.$('wordnikPassword').value, ''); app.$('settingsDialog').close();
  }
  assert.equal(app.$('rank').textContent, 'Rookie'); assert.equal(app.$('rankDetail').hidden, true);
  const base = 'teh ' + Array.from({ length: 2999 }, (_, i) => `old${i}`).join(' ');
  const seeded = app.state(); seeded.drafts[0].text = base; seeded.settings.categories.continue = ['craftDevices'];
  await app.finish(); storage = JSON.stringify(seeded); app = await boot();
  const edit = (start, end, inserted, inputType = 'insertText') => {
    const el = app.$('editor'); el.focus(); el.setSelectionRange(start, end);
    el.dispatchEvent(new app.w.InputEvent('beforeinput', { inputType, data: inserted, bubbles: true }));
    el.setRangeText(inserted, start, end, 'end');
    el.dispatchEvent(new app.w.InputEvent('input', { inputType, data: inserted, bubbles: true }));
  };
  app.$('continueButton').click(); assert.equal(app.$('sessionCount').textContent, '+0');
  const added = Array.from({ length: 120 }, (_, i) => `new${i}`).join(' ');
  edit(base.length, base.length, '\n\n' + added, 'insertFromDictation');
  assert.equal(app.$('sessionCount').textContent, '+120');
  assert.equal(app.$('rank').textContent, 'Iron 1');
  assert.equal(app.$('rankDetail').querySelectorAll('.rank-pip').length, 5);
  assert.equal(app.$('rankDetail').querySelectorAll('.filled').length, 1);
  assert.equal(app.$('fanfare').textContent, 'RANK UP · IRON 1');
  assert.equal(app.w.document.activeElement, app.$('editor'));
  app.$('editor').setSelectionRange(500, 500); app.$('editor').dispatchEvent(new app.w.Event('select'));
  assert.equal(app.$('sessionCount').textContent, '+120');
  edit(0, 3, 'the'); assert.equal(app.$('sessionCount').textContent, '+120');
  assert.equal(app.$('editor').selectionStart, 3); assert.equal(app.w.document.activeElement, app.$('editor'));
  const cut = app.$('editor').value.indexOf(' new105'); edit(cut, app.$('editor').value.length, '', 'deleteByCut');
  assert.equal(app.$('sessionCount').textContent, '+105'); assert.equal(app.state().xp, 120);
  app.$('undoButton').click(); assert.equal(app.$('sessionCount').textContent, '+120');
  app.$('redoButton').click(); assert.equal(app.$('sessionCount').textContent, '+105');
  app.$('copySession').click(); await new Promise(setImmediate); assert.equal(copied, added.split(' ').slice(0, 105).join(' '));
  app.$('copyDraft').click(); await new Promise(setImmediate); assert.equal(copied, app.$('editor').value);
  app.$('downloadDraft').click(); assert.equal(await downloadBlob.text(), app.$('editor').value); assert.ok(downloadName.endsWith('.txt'));
  const text = app.$('editor').value; await app.finish(); app = await boot();
  assert.equal(app.$('editor').value, text); assert.equal(app.$('sessionCount').textContent, '+105'); assert.equal(app.state().xp, 120);
  assert.equal(app.$('rank').textContent, 'Iron 1'); assert.equal(app.$('fanfare').hidden, true);
  console.log('PASS DOM: exact 3000-word regression, caret, copy-session, autosave and app restart');

  // Mid-round pace preserves the exact current card and manuscript.
  let round = app.state().drafts[0].round; const card = round.card.id;
  app.$('pace').value = 'hard'; app.$('pace').dispatchEvent(new app.w.Event('change'));
  round = app.state().drafts[0].round;
  assert.equal(round.remaining, 60000); assert.equal(round.card.id, card); assert.equal(app.$('editor').value, text); assert.equal(app.state().xp, 120);
  app.$('pinButton').click(); app.$('nextButton').click(); assert.equal(app.state().drafts[0].round.card.id, card);
  app.$('pinButton').click(); app.$('nextButton').click(); assert.notEqual(app.state().drafts[0].round.card.id, card);
  app.$('usedButton').click(); app.$('usedButton').click(); assert.equal(app.state().xp, 125);
  app.$('pauseButton').click(); assert.equal(app.state().drafts[0].round.paused, true);
  app.$('customMinutes').value = '.02'; app.$('customForm').dispatchEvent(new app.w.Event('submit', { cancelable: true }));
  assert.equal(app.state().drafts[0].round.remaining, 1200); assert.equal(app.state().drafts[0].round.paused, true);
  assert.equal(app.state().settings.pace, 'custom');
  app.$('pauseButton').click();
  app.$('customMinutes').value = '.001'; app.$('customForm').dispatchEvent(new app.w.Event('submit', { cancelable: true }));
  app.$('editor').focus(); app.$('editor').setSelectionRange(10, 10);
  let timedCard = app.state().drafts[0].round.card.id;
  app.advance(500); assert.notEqual(app.state().drafts[0].round.card.id, timedCard);
  assert.equal(app.$('editor').selectionStart, 10); assert.equal(app.w.document.activeElement, app.$('editor'));
  app.$('pinButton').click(); timedCard = app.state().drafts[0].round.card.id;
  app.advance(500); assert.equal(app.state().drafts[0].round.card.id, timedCard);
  app.$('pinButton').click(); app.setHidden(true); app.advance(2000);
  assert.equal(app.state().drafts[0].round.card.id, timedCard);
  app.setHidden(false); app.advance(5000); assert.equal(app.state().drafts[0].round.card.id, timedCard);
  app.$('pauseButton').click(); app.advance(2000); assert.equal(app.state().drafts[0].round.card.id, timedCard);
  console.log('PASS DOM: pace changes, custom interval, current-card preservation, pin, pause, manual bonus deduplication');

  // Create and reopen drafts; per-device progression is not reset.
  app.$('newDraftTitle').value = 'A second scene'; app.$('newDraftForm').dispatchEvent(new app.w.Event('submit', { cancelable: true }));
  assert.equal(app.state().drafts.length, 2); assert.equal(app.$('draftTitle').value, 'A second scene');
  app.$('drillButton').click(); assert.equal(app.state().drafts[1].round.mode, 'drill');
  edit(0, 0, 'A boat waited.'); assert.equal(app.state().xp, 128);
  app.$('draftList').querySelectorAll('button')[1].click(); assert.equal(app.$('editor').value, text);
  assert.equal(app.$('sessionCount').textContent, '+105'); assert.equal(app.state().xp, 128);
  app.$('settingsButton').click(); app.$('wordnikEndpoint').value = 'https://words.example.test/word'; app.$('saveSettings').click();
  await new Promise(setImmediate); assert.equal(fetchCount, 0);
  await connect('https://words.example.test/word'); assert.ok(fetchCount >= 1);
  // A failed optional endpoint never prevents local dealing.
  app.$('categoriesButton').click();
  for (const input of app.$('categoryChoices').querySelectorAll('input')) input.checked = input.value === 'words';
  app.$('categoriesForm').dispatchEvent(new app.w.Event('submit', { cancelable: true }));
  app.$('nextButton').click(); assert.equal(app.state().drafts[0].round.card.source, 'local');
  app.$('pauseButton').click();
  const word = app.state().drafts[0].round.card.title;
  const at = app.$('editor').value.length; const xpBefore = app.state().xp;
  edit(at, at, ' ' + word.toUpperCase() + '.');
  assert.equal(app.state().xp, xpBefore + 6);
  app.$('usedButton').click(); assert.equal(app.state().xp, xpBefore + 6);
  const drawsBeforeReload = fetchCount;
  await app.finish(); app = await boot(); assert.equal(app.state().drafts[0].round.card.used, true);
  assert.equal(app.state().xp, xpBefore + 6);
  assert.equal(fetchCount, drawsBeforeReload); assert.equal(app.$('disconnectWordnik').hidden, true);
  liveResponse = { status: 200, body: { word: 'zephyr', definition: 'A light breeze.' } };
  await connect('https://words.example.test/word');
  app.$('nextButton').click(); assert.equal(app.state().drafts[0].round.card.source, 'wordnik'); assert.equal(app.state().drafts[0].round.card.title, 'zephyr');
  liveResponse = { throw: true };
  await connect('https://words.example.test/offline');
  app.$('nextButton').click(); assert.equal(app.state().drafts[0].round.card.source, 'local');
  console.log('PASS DOM: draft creation/switching, per-draft restore, drill mode, endpoint 429 fallback, whole-word bonus and restore deduplication');
  // Only the endpoint URL is persisted; passwords and bearer tokens are transient.
  assert.ok(!JSON.stringify(app.state()).includes(TEST_TOKEN)); assert.ok(!JSON.stringify(app.state()).includes(TEST_PASSWORD));
  assert.equal(app.w.sessionStorage.length, 0);
  for (const request of authRequests) {
    assert.equal(request.credentials, 'omit'); assert.equal(request.redirect, 'error'); assert.equal(request.cache, 'no-store');
  }
  const manuscript = app.$('editor').value, savedXP = app.state().xp, savedRound = app.state().drafts[0].round.id;
  app.$('disconnectWordnik').click();
  let draws = fetchCount; app.$('nextButton').click(); assert.equal(fetchCount, draws);
  assert.equal(app.$('editor').value, manuscript); assert.equal(app.state().xp, savedXP); assert.equal(app.state().drafts[0].round.id, savedRound);
  app.$('settingsButton').click(); app.$('connectWordnik').click(); app.$('wordnikPassword').value = 'wrong-password';
  app.$('wordnikAuthForm').dispatchEvent(new app.w.Event('submit', { cancelable: true })); await new Promise(setImmediate);
  assert.match(app.$('wordnikAuthError').textContent, /password/); assert.equal(fetchCount, draws); assert.equal(app.$('wordnikPassword').value, '');
  app.$('wordnikAuthDialog').close();
  authStatus = 429; await connect('https://words.example.test/word');
  assert.match(app.$('wordnikAuthError').textContent, /Wait a minute/); assert.equal(fetchCount, draws);
  app.$('wordnikAuthDialog').close();
  authStatus = 503; authDiagnostic = { error: 'Word service not configured', missing: ['WORDNIK_ACCESS_PASSWORD', 'SESSION_SIGNING_KEY', 'AUTH_RATE_LIMITER', 'unexpected-server-detail'] };
  await connect('https://words.example.test/word');
  assert.match(app.$('wordnikAuthError').textContent, /WORDNIK_ACCESS_PASSWORD \(16–256 characters\)/);
  assert.match(app.$('wordnikAuthError').textContent, /SESSION_SIGNING_KEY/);
  assert.match(app.$('wordnikAuthError').textContent, /AUTH_RATE_LIMITER binding/);
  assert.ok(!app.$('wordnikAuthError').textContent.includes('unexpected-server-detail'));
  assert.equal(fetchCount, draws); app.$('wordnikAuthDialog').close();
  authStatus = 200; authDiagnostic = null;
  liveResponse = { status: 401 }; await connect('https://words.example.test/word');
  assert.equal(app.$('disconnectWordnik').hidden, true); draws = fetchCount;
  app.$('nextButton').click(); assert.equal(fetchCount, draws); assert.equal(app.state().drafts[0].round.card.source, 'local');
  liveResponse = { status: 200, body: { word: 'zephyr', definition: 'A light breeze.' } };
  await connect('https://words.example.test/word'); assert.equal(app.$('disconnectWordnik').hidden, false);
  app.w.Date.now = () => Date.now() + 3600001;
  app.$('settingsButton').click(); assert.equal(app.$('disconnectWordnik').hidden, true);
  draws = fetchCount; app.$('nextButton').click(); assert.equal(fetchCount, draws);
  let release;
  authDelay = new Promise(resolve => { release = resolve; });
  app.$('connectWordnik').click(); app.$('wordnikPassword').value = TEST_PASSWORD;
  app.$('wordnikAuthForm').dispatchEvent(new app.w.Event('submit', { cancelable: true }));
  app.$('wordnikAuthDialog').close(); release(); await new Promise(setImmediate); authDelay = null;
  assert.equal(app.$('disconnectWordnik').hidden, true); assert.equal(fetchCount, draws);
  assert.ok(!app.w.localStorage.getItem('text-fight-v1').includes(TEST_TOKEN));
  assert.ok(!app.w.localStorage.getItem('text-fight-v1').includes(TEST_PASSWORD));
  assert.equal(app.$('editor').value, manuscript); assert.equal(app.state().xp, savedXP);
  console.log('PASS DOM: password login, memory-only tokens, reload/expiry/logout, login throttling, 401 fallback and cancelled login');
  await app.finish();
  const previousSave = JSON.parse(storage);
  for (const [xp, rank, pips, rating] of [
    [119, 'Rookie', 0, null], [320, 'Iron 2', 2, null], [14319, 'Diamond 5', 5, null],
    [14320, 'Master', 0, 1500], [18320, 'High Master', 0, 1600],
    [22320, 'Grand Master', 0, 1700], [30000, 'Ultimate Master', 0, 1892]
  ]) {
    const existing = structuredClone(previousSave); existing.xp = xp; storage = JSON.stringify(existing);
    app = await boot();
    assert.equal(app.$('rank').textContent, rank);
    assert.equal(app.$('rankDetail').querySelectorAll('.filled').length, pips);
    if (rating !== null) assert.equal(app.$('rankDetail').textContent, `WR ${rating}`);
    assert.deepEqual(app.state(), existing);
    assert.equal(app.$('fanfare').hidden, true);
    await app.finish();
  }
  console.log('PASS DOM: original rank ladder, pip display, Master ratings, promotion focus and preservation of existing saves');
  assert.deepEqual(errors, []);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
