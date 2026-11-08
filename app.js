import { CATEGORY_NAMES, CONTINUE_CATEGORIES, PACES, PROGRESSION, countWords, createRound, editRound, undoRound, sessionCount, sessionText, vocabularyUsed, awardPrompt, dealLocal, advanceTimer, progress, rankFromXP, changedRange } from './core.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'text-fight-v1';
const uuid = () => crypto.randomUUID();
const newDraft = title => ({ id: uuid(), title: title || 'Untitled scene', text: '', updated: Date.now(), round: null });
const initial = () => { const draft = newDraft(); return { version: 1, drafts: [draft], activeId: draft.id, xp: 0,
  settings: { pace: 'chill', customMinutes: 5, sound: false, endpoint: '', categories: { continue: [...CONTINUE_CATEGORIES], drill: Object.keys(CATEGORY_NAMES) } } }; };
let state, storageOK = true, corruptStorage = false;
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  state = raw ? JSON.parse(raw) : initial();
  if (state.version !== 1 || !Array.isArray(state.drafts) || !state.drafts.length || !state.settings || !Number.isFinite(state.xp)) throw Error('Invalid save');
  if (!state.drafts.some(d => d.id === state.activeId)) state.activeId = state.drafts[0].id;
} catch (error) {
  // Never overwrite an unreadable save with an empty manuscript.
  state = initial(); storageOK = false; corruptStorage = true;
}
let decks, beforeInput = null, lastTick = performance.now(), lastSavedTick = performance.now(), toastTimeout, fanfareTimeout;
let liveWords = [], fetchingWords = false, lastLiveFetch = 0, installPrompt = null, swRegistration;
// Wordnik credentials never enter saved app state or browser storage.
let wordnikSession = null, wordFetchController = null, authController = null, connectionEpoch = 0;
const draft = () => state.drafts.find(d => d.id === state.activeId);
const interval = () => PACES[state.settings.pace] || state.settings.customMinutes * 60000;
const mode = () => draft().round?.mode || 'continue';
const categories = () => state.settings.categories[mode()];

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { $('toast').hidden = true; }, 3000);
}
function save() {
  if (corruptStorage) { $('saveStatus').textContent = 'Save unreadable · export text'; return; }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageOK = true; $('saveStatus').textContent = 'Saved on device';
  } catch (error) {
    $('saveStatus').textContent = 'Not saved · download a copy';
    if (storageOK) toast('Device storage is full or unavailable. Download your draft to keep a copy.');
    storageOK = false;
  }
}
function rememberEditor() {
  const el = $('editor');
  draft().selection = [el.selectionStart, el.selectionEnd]; draft().scrollTop = el.scrollTop;
}
function restoreEditor() {
  const d = draft(), el = $('editor');
  el.value = d.text;
  const [start, end] = d.selection || [0, 0];
  el.setSelectionRange(Math.min(start, d.text.length), Math.min(end, d.text.length));
  el.scrollTop = d.scrollTop || 0;
}
function updateCounts() {
  const d = draft(), net = sessionCount(d.text, d.round), p = progress(state.xp);
  const career = rankFromXP(state.xp);
  $('fullCount').textContent = `${countWords(d.text).toLocaleString()} draft words`;
  $('sessionCount').textContent = `${net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString()}`;
  $('rank').textContent = p.rank; $('level').textContent = `LVL ${String(p.level).padStart(2, '0')}`;
  const rankProgress = `${career.into} / ${career.needed} XP to ${career.nextLabel}`;
  $('rank').title = rankProgress;
  $('rank').setAttribute('aria-label', `${p.rank}. ${rankProgress}`);
  $('rankDetail').replaceChildren();
  $('rankDetail').hidden = !career.steps && career.writerRate === null;
  if (career.writerRate !== null) {
    $('rankDetail').textContent = `WR ${career.writerRate}`;
    $('rankDetail').setAttribute('aria-label', `Writer Rate ${career.writerRate}`);
  } else if (career.steps) {
    $('rankDetail').setAttribute('aria-label', `Step ${career.step} of ${career.steps}`);
    for (let step = 1; step <= career.steps; step++) {
      const pip = document.createElement('span'); pip.className = 'rank-pip' + (step <= career.step ? ' filled' : '');
      $('rankDetail').append(pip);
    }
  }
  $('xpLabel').textContent = `${p.within} / ${PROGRESSION.levelStep} XP`;
  $('lifetimeXP').textContent = `${state.xp.toLocaleString()} lifetime XP`;
  $('xpFill').style.width = `${p.within / PROGRESSION.levelStep * 100}%`;
  $('xpTrack').setAttribute('aria-valuenow', p.within);
  $('xpTrack').setAttribute('aria-valuemax', PROGRESSION.levelStep);
  $('undoButton').disabled = !d.round || d.round.cursor === 0;
  $('redoButton').disabled = !d.round || d.round.cursor >= d.round.journal.length;
}
function gainXP(amount) {
  if (!amount) return;
  const old = progress(state.xp); state.xp += amount; const next = progress(state.xp);
  $('xpBlock').classList.remove('pulse'); void $('xpBlock').offsetWidth; $('xpBlock').classList.add('pulse');
  if (next.rank !== old.rank || next.level > old.level) {
    $('fanfare').textContent = next.rank !== old.rank ? `RANK UP · ${next.rank.toUpperCase()}` : `LEVEL ${next.level} · ${next.rank.toUpperCase()}`;
    $('fanfare').hidden = false; clearTimeout(fanfareTimeout);
    fanfareTimeout = setTimeout(() => { $('fanfare').hidden = true; }, 2200);
    playFanfare();
  }
}
let audioContext;
function unlockAudio() {
  if (!state.settings.sound) return;
  try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume(); } catch {}
}
function playFanfare() {
  if (!state.settings.sound || !audioContext) return;
  try {
    [392, 523.25, 783.99].forEach((frequency, i) => {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(), at = audioContext.currentTime + i * .09;
      oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.035, at + .01); gain.gain.exponentialRampToValueAtTime(.001, at + .17);
      oscillator.start(at); oscillator.stop(at + .18);
    });
  } catch {}
}
function renderDraftList() {
  for (const container of [$('draftList'), $('mobileDraftList')]) {
    container.replaceChildren();
    for (const d of [...state.drafts].sort((a, b) => b.updated - a.updated)) {
      const button = document.createElement('button'); button.className = 'draft-item' + (d.id === state.activeId ? ' active' : '');
      const title = document.createElement('strong'); title.textContent = d.title || 'Untitled scene';
      const subtitle = document.createElement('small'); subtitle.textContent = `${countWords(d.text).toLocaleString()} words${d.round ? ' · Round saved' : ''}`;
      button.append(title, subtitle); button.setAttribute('aria-label', `Open draft: ${d.title}`);
      button.addEventListener('click', () => { openDraft(d.id); $('draftsDialog').close(); }); container.append(button);
    }
  }
}
function renderRound() {
  const r = draft().round;
  $('startControls').hidden = !!r; $('activeControls').hidden = !r;
  $('roundStatus').textContent = r ? `${r.paused ? 'PAUSED' : r.mode === 'drill' ? 'DRILL IN PROGRESS' : 'ROUND IN PROGRESS'}` : 'READY TO WRITE';
  $('roundDot').style.background = r?.paused ? '#a3a9b0' : '';
  $('pauseButton').textContent = r?.paused ? 'Resume' : 'Pause';
  $('promptCategory').textContent = r?.card ? CATEGORY_NAMES[r.card.category] + (r.card.source === 'wordnik' ? ' · WORDNIK' : '') : 'WRITING PROMPT';
  $('promptTitle').textContent = r?.card?.title || 'Start a round';
  $('promptExplanation').textContent = r?.card?.explanation || 'Choose Continue a draft or Start a drill to receive prompts.';
  $('pinButton').disabled = !r; $('nextButton').disabled = !r;
  $('usedButton').disabled = !r?.card || r.card.used;
  $('usedButton').textContent = r?.card?.used ? '✓ Used · +5 XP' : 'Used it +5';
  $('pinButton').textContent = r?.pinned ? 'Unpin' : 'Pin'; $('pinButton').setAttribute('aria-pressed', String(!!r?.pinned));
  $('pace').value = state.settings.pace; renderTimer();
}
function renderTimer() {
  const r = draft().round;
  if (!r) { $('timer').textContent = `${state.settings.pace.toUpperCase()}`; return; }
  const seconds = Math.ceil(r.remaining / 1000);
  $('timer').textContent = r.pinned ? 'PINNED · TAKE YOUR TIME' : r.paused ? 'PAUSED' : `NEXT IN ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function openDraft(id) {
  tick(); rememberEditor(); save(); state.activeId = id; beforeInput = null; lastTick = performance.now();
  $('draftTitle').value = draft().title; restoreEditor();
  renderRound(); updateCounts(); renderDraftList(); save();
}
function startRound(roundMode) {
  if (!decks) return;
  draft().round = createRound(draft().text, roundMode, interval());
  lastTick = performance.now(); deal(); renderDraftList(); updateCounts(); save();
  $('roundDialog').close();
}
function deal() {
  const r = draft().round; if (!r || !decks) return;
  const card = dealLocal(decks, categories(), r.last);
  if (card.category === 'words') {
    liveWords = liveWords.filter(w => w.word.toLowerCase() !== r.lastWordTitle?.toLowerCase());
    if (liveWords.length) {
      const entry = liveWords.shift(); card.title = entry.word; card.explanation = entry.definition; card.source = 'wordnik';
    } else if (card.title.toLowerCase() === r.lastWordTitle?.toLowerCase() && decks.words.length > 1) {
      const replacement = dealLocal(decks, ['words'], r.last);
      Object.assign(card, replacement);
    }
    r.lastWordTitle = card.title;
  }
  r.card = card; r.remaining = interval(); r.pinned = false; lastTick = performance.now();
  renderRound(); save(); prefetchWords();
}
function usePrompt() {
  const r = draft().round; if (!r) return;
  gainXP(awardPrompt(r)); renderRound(); updateCounts(); save();
}
function tick() {
  const now = performance.now(), elapsed = now - lastTick; lastTick = now;
  // A delayed event-loop tick (suspend, sleep) is not active writing time.
  if (advanceTimer(draft().round, elapsed > 2500 ? 0 : elapsed, interval(), !document.hidden)) deal();
  renderTimer();
  if (now - lastSavedTick > 5000 && !document.hidden && draft().round) { save(); lastSavedTick = now; }
}
function setPace(pace, minutes) {
  state.settings.pace = pace;
  if (minutes !== undefined) state.settings.customMinutes = minutes;
  if (draft().round) draft().round.remaining = interval();
  lastTick = performance.now(); renderRound(); save();
}
function openCategories() {
  const enabled = categories(); $('categoryChoices').replaceChildren(); $('categoryError').textContent = '';
  for (const [key, name] of Object.entries(CATEGORY_NAMES)) {
    const label = document.createElement('label'); label.className = 'check';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.name = 'category'; checkbox.value = key; checkbox.checked = enabled.includes(key);
    label.append(checkbox, document.createTextNode(`${name} · ${decks?.[key]?.length || 0}`)); $('categoryChoices').append(label);
  }
  $('categoriesDialog').showModal();
}
async function copyText(text) {
  if (!text) { toast('No text to copy yet.'); return; }
  try {
    await navigator.clipboard.writeText(text); toast('Copied to clipboard.');
  } catch {
    // Clipboard fallback is confined to the tools dialog, never the manuscript.
    const fallback = document.createElement('textarea'); fallback.value = text; fallback.setAttribute('aria-label', 'Text to copy');
    $('toolsDialog').append(fallback); fallback.select();
    const success = document.execCommand('copy'); fallback.remove();
    toast(success ? 'Copied to clipboard.' : 'Clipboard unavailable. Use the plain-text download.');
  }
}
function download() {
  const blob = new Blob([draft().text], { type: 'text/plain;charset=utf-8' }), link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = `${(draft().title || 'Untitled scene').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')}.txt`;
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); toast('Plain-text draft downloaded.');
}
function validEndpoint(value) {
  if (!value.trim()) return '';
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('Use an HTTPS endpoint URL without credentials, query parameters, or a fragment. Never enter an API key.');
  return url.href;
}
function clearWordnikConnection() {
  connectionEpoch++; wordnikSession = null; liveWords = []; lastLiveFetch = 0;
  wordFetchController?.abort(); wordFetchController = null; fetchingWords = false;
  authController?.abort(); authController = null;
}
function currentWordnikSession() {
  if (wordnikSession && (wordnikSession.endpoint !== state.settings.endpoint || wordnikSession.expiresAt <= Date.now())) clearWordnikConnection();
  return wordnikSession;
}
function renderWordnikStatus(message) {
  const session = currentWordnikSession();
  $('wordnikStatus').textContent = message || (!state.settings.endpoint ? 'Offline word deck active.' : session ? 'Connected for this tab. Reconnect after one hour or a reload.' : 'Connect to use live Wordnik words. Offline words are always available.');
  $('disconnectWordnik').hidden = !session;
  $('connectWordnik').textContent = session ? 'Reconnect Wordnik' : 'Connect Wordnik';
}
async function prefetchWords() {
  const session = currentWordnikSession();
  if (!session || !navigator.onLine || fetchingWords || liveWords.length >= 3 || Date.now() - lastLiveFetch < 10000) return;
  fetchingWords = true; lastLiveFetch = Date.now(); const endpoint = state.settings.endpoint;
  const epoch = connectionEpoch;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 2500);
  wordFetchController = controller;
  try {
    const response = await fetch(endpoint, { signal: controller.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error', headers: { Authorization: `Bearer ${session.token}` } });
    if (connectionEpoch !== epoch || currentWordnikSession() !== session) return;
    if (response.status === 401 || response.status === 403) { clearWordnikConnection(); renderWordnikStatus('Wordnik connection ended. Connect again; offline words are active.'); return; }
    if (!response.ok) throw Error('Unavailable');
    const data = await response.json();
    if (connectionEpoch !== epoch || currentWordnikSession() !== session) return;
    const entries = Array.isArray(data) ? data : [data];
    for (const entry of entries.slice(0, 8)) {
      if (typeof entry.word === 'string' && /^[\p{L}][\p{L}'’\-]{1,39}$/u.test(entry.word) && typeof entry.definition === 'string' && entry.definition.length < 600 &&
          !liveWords.some(w => w.word.toLowerCase() === entry.word.toLowerCase()) && entry.word.toLowerCase() !== draft().round?.card?.title.toLowerCase()) liveWords.push(entry);
    }
  } catch { /* The local deck is available immediately on every draw. */ }
  finally { clearTimeout(timeout); if (wordFetchController === controller) { fetchingWords = false; wordFetchController = null; } }
}

$('editor').addEventListener('beforeinput', event => {
  beforeInput = { start: $('editor').selectionStart, end: $('editor').selectionEnd, inputType: event.inputType };
});
$('editor').addEventListener('input', event => {
  const d = draft(), before = d.text, after = $('editor').value;
  const r = d.round, range = changedRange(before, after, beforeInput);
  const inputType = event.inputType || beforeInput?.inputType || '';
  if (r) {
    gainXP(editRound(r, before, after, { selection: beforeInput, inputType }));
    // Detect only in a word affected by this edit, never a previously written
    // occurrence elsewhere in the document, and never during undo/redo.
    if (r.card?.category === 'words' && !r.card.used && !inputType.startsWith('history')) {
      const left = after.slice(0, range.start).match(/[\p{L}\p{N}'’\-]*$/u)?.[0] || '';
      const right = after.slice(range.start + range.inserted.length).match(/^[\p{L}\p{N}'’\-]*/u)?.[0] || '';
      const start = range.start - left.length, end = range.start + range.inserted.length + right.length;
      if ((range.inserted.length || range.end > range.start) && vocabularyUsed(after.slice(start, end), { origins: r.origins.slice(start, end) }, r.card.title)) gainXP(awardPrompt(r));
    }
  }
  d.text = after; d.updated = Date.now(); beforeInput = null;
  rememberEditor();
  updateCounts(); if (r?.card?.used) { $('usedButton').textContent = '✓ Used · +5 XP'; $('usedButton').disabled = true; }
  save();
});
$('editor').addEventListener('select', rememberEditor);
$('editor').addEventListener('scroll', rememberEditor, { passive: true });
$('draftTitle').addEventListener('input', () => { draft().title = $('draftTitle').value; draft().updated = Date.now(); save(); });
$('draftTitle').addEventListener('blur', renderDraftList);
function undo(redo = false) {
  const d = draft(); if (!d.round) return;
  const result = undoRound(d.round, d.text, redo); if (!result) return;
  d.text = result.text; d.updated = Date.now(); $('editor').value = result.text;
  $('editor').focus({ preventScroll: true }); $('editor').setSelectionRange(result.caret, result.caret);
  rememberEditor(); beforeInput = null; updateCounts(); save();
}
$('undoButton').addEventListener('click', () => undo()); $('redoButton').addEventListener('click', () => undo(true));
$('editor').addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && draft().round) { event.preventDefault(); undo(event.shiftKey); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y' && draft().round) { event.preventDefault(); undo(true); }
});
$('continueButton').addEventListener('click', () => startRound('continue'));
$('drillButton').addEventListener('click', () => startRound('drill'));
$('restartContinue').addEventListener('click', () => startRound('continue'));
$('restartDrill').addEventListener('click', () => startRound('drill'));
$('sidebarDrill').addEventListener('click', () => { if (draft().round) $('roundDialog').showModal(); else startRound('drill'); });
$('roundsButton').addEventListener('click', () => $('roundDialog').showModal());
$('pauseButton').addEventListener('click', () => { tick(); draft().round.paused = !draft().round.paused; lastTick = performance.now(); renderRound(); save(); });
$('nextButton').addEventListener('click', () => { if (draft().round.pinned) { toast('Unpin this card to deal the next one.'); return; } deal(); });
$('pinButton').addEventListener('click', () => { tick(); const r = draft().round; r.pinned = !r.pinned; r.remaining = interval(); lastTick = performance.now(); renderRound(); save(); });
$('usedButton').addEventListener('click', usePrompt);
// Prompt actions can be tapped while composing without blurring the textarea.
for (const id of ['nextButton', 'pinButton', 'usedButton', 'pauseButton']) $(id).addEventListener('pointerdown', event => { if (document.activeElement === $('editor')) event.preventDefault(); });
$('pace').addEventListener('change', () => {
  if ($('pace').value === 'custom') { $('customMinutes').value = state.settings.customMinutes; $('customDialog').showModal(); }
  else setPace($('pace').value);
});
$('customDialog').addEventListener('close', () => { $('pace').value = state.settings.pace; });
$('customForm').addEventListener('submit', event => {
  event.preventDefault(); const minutes = Number($('customMinutes').value);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes * 60000 > Number.MAX_SAFE_INTEGER) { $('customMinutes').setCustomValidity('Enter a positive, finite number of minutes.'); $('customMinutes').reportValidity(); return; }
  setPace('custom', minutes); $('customDialog').close();
});
$('customMinutes').addEventListener('input', () => $('customMinutes').setCustomValidity(''));
$('categoriesButton').addEventListener('click', openCategories);
$('categoriesForm').addEventListener('submit', event => {
  event.preventDefault(); const enabled = [...$('categoryChoices').querySelectorAll('input:checked')].map(el => el.value);
  if (!enabled.length) { $('categoryError').textContent = 'Choose at least one category.'; return; }
  state.settings.categories[mode()] = enabled; save(); $('categoriesDialog').close();
});
$('draftsButton').addEventListener('click', () => { renderDraftList(); $('draftsDialog').showModal(); });
for (const id of ['newDraft', 'mobileNewDraft']) $(id).addEventListener('click', () => { $('draftsDialog').close(); $('newDraftTitle').value = ''; $('newDraftDialog').showModal(); });
$('newDraftForm').addEventListener('submit', event => {
  event.preventDefault(); const d = newDraft($('newDraftTitle').value.trim()); state.drafts.push(d); openDraft(d.id); $('newDraftDialog').close();
});
$('toolsButton').addEventListener('click', () => $('toolsDialog').showModal());
$('copyDraft').addEventListener('click', () => copyText(draft().text));
$('copySession').addEventListener('click', () => copyText(sessionText(draft().text, draft().round)));
$('downloadDraft').addEventListener('click', download);
$('settingsButton').addEventListener('click', () => { $('sound').checked = state.settings.sound; $('wordnikEndpoint').value = state.settings.endpoint; renderWordnikStatus(); $('settingsDialog').showModal(); });
$('saveSettings').addEventListener('click', () => {
  try {
    const endpoint = validEndpoint($('wordnikEndpoint').value);
    if (endpoint !== state.settings.endpoint) clearWordnikConnection();
    state.settings.endpoint = endpoint; state.settings.sound = $('sound').checked; unlockAudio(); save(); prefetchWords(); $('settingsDialog').close(); toast('Settings saved.');
  } catch (error) { $('wordnikEndpoint').setCustomValidity(error.message); $('wordnikEndpoint').reportValidity(); }
});
$('wordnikEndpoint').addEventListener('input', () => $('wordnikEndpoint').setCustomValidity(''));
$('connectWordnik').addEventListener('click', () => {
  try {
    const endpoint = validEndpoint($('wordnikEndpoint').value);
    if (!endpoint) throw Error('Enter your HTTPS Wordnik endpoint first.');
    if (endpoint !== state.settings.endpoint) { clearWordnikConnection(); state.settings.endpoint = endpoint; save(); }
    renderWordnikStatus();
    $('wordnikAuthHost').textContent = `Connect to ${new URL(endpoint).host}`;
    $('wordnikAuthError').textContent = ''; $('wordnikPassword').value = '';
    $('wordnikAuthSubmit').disabled = false; $('wordnikAuthDialog').showModal();
  } catch (error) { $('wordnikEndpoint').setCustomValidity(error.message); $('wordnikEndpoint').reportValidity(); }
});
$('wordnikAuthForm').addEventListener('submit', async event => {
  event.preventDefault(); if (authController) return;
  const endpoint = state.settings.endpoint, epoch = connectionEpoch;
  const loginURL = new URL(endpoint); loginURL.pathname = loginURL.pathname.replace(/\/+$/, '') + '/auth';
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
  authController = controller; $('wordnikAuthSubmit').disabled = true; $('wordnikAuthError').textContent = '';
  try {
    const pending = fetch(loginURL.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('wordnikPassword').value }), signal: controller.signal,
      credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
    $('wordnikPassword').value = '';
    const response = await pending;
    if (controller.signal.aborted || epoch !== connectionEpoch || state.settings.endpoint !== endpoint) return;
    if (!response.ok) {
      let message = response.status === 429 ? 'Too many connection attempts. Wait a minute, then try again.' : response.status === 401 ? 'Connection failed. Check your endpoint password.' : 'Could not connect. Check the endpoint setup and try again.';
      if (response.status === 503) {
        const detail = await response.json().catch(() => null);
        const labels = {
          WORDNIK_API_KEY: 'WORDNIK_API_KEY',
          WORDNIK_ACCESS_PASSWORD: 'WORDNIK_ACCESS_PASSWORD (16–256 characters)',
          SESSION_SIGNING_KEY: 'SESSION_SIGNING_KEY (a generated 43-character key)',
          AUTH_RATE_LIMITER: 'AUTH_RATE_LIMITER binding', RATE_LIMITER: 'RATE_LIMITER binding'
        };
        const missing = Array.isArray(detail?.missing) ? detail.missing.slice(0, 5).filter(name => Object.hasOwn(labels, name)).map(name => labels[name]) : [];
        if (detail?.error === 'Word service not configured' && missing.length) message = `Endpoint setup is missing or invalid: ${missing.join(', ')}. Update the Worker settings and reconnect.`;
      }
      throw Error(message);
    }
    const result = await response.json();
    if (controller.signal.aborted || epoch !== connectionEpoch || state.settings.endpoint !== endpoint) return;
    if (typeof result.token !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(result.token) || result.token.length > 1024 || !Number.isInteger(result.expiresIn) || result.expiresIn <= 0 || result.expiresIn > 3600) throw Error('The endpoint returned an invalid connection response.');
    clearWordnikConnection();
    wordnikSession = { token: result.token, endpoint, expiresAt: Date.now() + result.expiresIn * 1000 };
    renderWordnikStatus(); $('wordnikAuthDialog').close(); prefetchWords();
  } catch (error) {
    if (epoch === connectionEpoch && $('wordnikAuthDialog').open) $('wordnikAuthError').textContent = controller.signal.aborted ? 'Connection timed out. Try again when you are online.' : error.message;
  } finally {
    clearTimeout(timeout); $('wordnikPassword').value = '';
    if (authController === controller) authController = null;
    $('wordnikAuthSubmit').disabled = false;
  }
});
$('wordnikAuthDialog').addEventListener('close', () => { authController?.abort(); authController = null; $('wordnikPassword').value = ''; });
$('disconnectWordnik').addEventListener('click', () => { clearWordnikConnection(); renderWordnikStatus(); toast('Wordnik disconnected. Offline words are active.'); });
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
document.addEventListener('pointerdown', unlockAudio, { passive: true });
document.addEventListener('visibilitychange', () => { lastTick = performance.now(); rememberEditor(); save(); });
window.addEventListener('pagehide', () => { lastTick = performance.now(); rememberEditor(); save(); });
function networkStatus() { $('connection').textContent = navigator.onLine ? 'LOCAL FIRST' : 'OFFLINE · READY'; }
window.addEventListener('online', () => { networkStatus(); prefetchWords(); }); window.addEventListener('offline', networkStatus);
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('installButton').hidden = false; });
$('installButton').addEventListener('click', async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; $('installButton').hidden = true; } });
window.addEventListener('appinstalled', () => { $('installButton').hidden = true; toast('Text Fight installed.'); });
function resize() { document.documentElement.style.setProperty('--app-height', `${window.visualViewport?.height || window.innerHeight}px`); }
window.visualViewport?.addEventListener('resize', resize); window.addEventListener('resize', resize); resize();

restoreEditor(); $('draftTitle').value = draft().title;
renderDraftList(); renderRound(); updateCounts(); networkStatus();
if (corruptStorage) toast('Saved data could not be read. It has been preserved; download any new writing.');
else save();
try {
  const [craft, words] = await Promise.all([fetch('./data/sentence-trainer.json').then(r => { if (!r.ok) throw Error(); return r.json(); }), fetch('./data/words.json').then(r => { if (!r.ok) throw Error(); return r.json(); })]);
  decks = { ...craft, words };
  prefetchWords();
} catch { $('promptExplanation').textContent = 'Prompt data could not load. Reconnect once, then reload to prepare offline writing.'; }
setInterval(tick, 500);
if ('serviceWorker' in navigator) {
  try {
    swRegistration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    $('offlineStatus').textContent = 'Offline app ready. Drafts, prompts, and XP work without a connection.';
    function offerUpdate() { if (swRegistration.waiting && navigator.serviceWorker.controller) $('updateButton').hidden = false; }
    offerUpdate(); swRegistration.addEventListener('updatefound', () => swRegistration.installing?.addEventListener('statechange', offerUpdate));
    $('updateButton').addEventListener('click', () => { save(); swRegistration.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' }); });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading && !swRegistration.active?.scriptURL) return; if (reloading) return; if (!$('updateButton').hidden) { reloading = true; location.reload(); } });
  } catch { $('offlineStatus').textContent = 'Offline setup failed. Open over HTTPS (or localhost) and reconnect once.'; }
} else $('offlineStatus').textContent = 'This browser does not support the offline app shell.';
