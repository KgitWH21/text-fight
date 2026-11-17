import { CATEGORY_NAMES, CONTINUE_CATEGORIES, PACES, PROGRESSION, countWords, createRound, editRound, undoRound, sessionCount, sessionText, vocabularyUsed, awardPrompt, dealLocal, advanceTimer, progress, rankFromXP, changedRange, wordnikDeck } from './core.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'text-fight-v1';
const uuid = () => crypto.randomUUID();
const newDraft = title => ({ id: uuid(), title: title || 'Untitled scene', text: '', updated: Date.now(), round: null });
const initial = () => { const draft = newDraft(); return { version: 1, drafts: [draft], activeId: draft.id, xp: 0,
  settings: { pace: 'chill', customMinutes: 5, sound: false, categories: { continue: [...CONTINUE_CATEGORIES], drill: Object.keys(CATEGORY_NAMES) } } }; };
let state, storageOK = true, corruptStorage = false;
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  state = raw ? JSON.parse(raw) : initial();
  if (state.version !== 1 || !Array.isArray(state.drafts) || !state.drafts.length || !state.settings || !Number.isFinite(state.xp)) throw Error('Invalid save');
  if (!state.drafts.some(d => d.id === state.activeId)) state.activeId = state.drafts[0].id;
  if (state.settings) delete state.settings.endpoint;
} catch (error) {
  // Never overwrite an unreadable save with an empty manuscript.
  state = initial(); storageOK = false; corruptStorage = true;
}
let decks, beforeInput = null, lastTick = performance.now(), lastSavedTick = performance.now(), toastTimeout, fanfareTimeout;
let installPrompt = null, swRegistration;
let writingFullscreen = false, nativeWritingFullscreen = false, fullscreenRevision = 0;
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
function focusEditor() {
  const el = $('editor'), start = el.selectionStart, end = el.selectionEnd, direction = el.selectionDirection;
  const top = el.scrollTop, left = el.scrollLeft;
  el.focus({ preventScroll: true }); el.setSelectionRange(start, end, direction);
  el.scrollTop = top; el.scrollLeft = left;
}
function setWritingFullscreen(enabled) {
  writingFullscreen = enabled;
  document.body.classList.toggle('writing-fullscreen', enabled);
  $('fullscreenButton').setAttribute('aria-pressed', String(enabled));
  $('exitFullscreen').hidden = !enabled;
  if (!enabled) { $('fanfare').hidden = true; $('toast').hidden = true; }
  resize();
}
async function enterWritingFullscreen() {
  if (writingFullscreen || !decks) return;
  // Starting from an idle manuscript establishes its baseline once. Existing
  // rounds, including their pace, pause and pin state, are left intact.
  if (!draft().round) startRound('continue');
  const revision = ++fullscreenRevision;
  setWritingFullscreen(true); focusEditor();
  if (!document.fullscreenEnabled || !document.documentElement.requestFullscreen || document.fullscreenElement) return;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    // An exit during the native transition must not reopen fullscreen later.
    if (revision !== fullscreenRevision || !writingFullscreen) {
      if (document.fullscreenElement === document.documentElement) await document.exitFullscreen();
      return;
    }
    nativeWritingFullscreen = document.fullscreenElement === document.documentElement;
    focusEditor();
  } catch { /* The editor-only layout also works without native fullscreen. */ }
  resize();
}
async function exitWritingFullscreen() {
  ++fullscreenRevision; setWritingFullscreen(false);
  if (nativeWritingFullscreen && document.fullscreenElement === document.documentElement) {
    nativeWritingFullscreen = false;
    try { await document.exitFullscreen(); } catch { nativeWritingFullscreen = document.fullscreenElement === document.documentElement; }
  }
  focusEditor();
}
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement === document.documentElement && writingFullscreen) nativeWritingFullscreen = true;
  else if (!document.fullscreenElement && nativeWritingFullscreen) {
    nativeWritingFullscreen = false; ++fullscreenRevision; setWritingFullscreen(false);
  }
  resize();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !event.isComposing && writingFullscreen) { event.preventDefault(); exitWritingFullscreen(); }
});
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
  r.card = dealLocal(decks, categories(), r.last);
  r.remaining = interval(); r.pinned = false; lastTick = performance.now();
  renderRound(); save();
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
for (const id of ['nextButton', 'pinButton', 'usedButton', 'pauseButton', 'fullscreenButton', 'exitFullscreen']) $(id).addEventListener('pointerdown', event => { if (document.activeElement === $('editor')) event.preventDefault(); });
$('fullscreenButton').addEventListener('click', enterWritingFullscreen);
$('exitFullscreen').addEventListener('click', exitWritingFullscreen);
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
$('settingsButton').addEventListener('click', () => { $('sound').checked = state.settings.sound; $('settingsDialog').showModal(); });
$('saveSettings').addEventListener('click', () => {
  state.settings.sound = $('sound').checked; unlockAudio(); save(); $('settingsDialog').close(); toast('Settings saved.');
});
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
document.addEventListener('pointerdown', unlockAudio, { passive: true });
document.addEventListener('visibilitychange', () => { lastTick = performance.now(); rememberEditor(); save(); });
window.addEventListener('pagehide', () => { lastTick = performance.now(); rememberEditor(); save(); });
function networkStatus() { $('connection').textContent = navigator.onLine ? 'LOCAL FIRST' : 'OFFLINE · READY'; }
window.addEventListener('online', networkStatus); window.addEventListener('offline', networkStatus);
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('installButton').hidden = false; });
$('installButton').addEventListener('click', async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; $('installButton').hidden = true; } });
window.addEventListener('appinstalled', () => { $('installButton').hidden = true; toast('Text Fight installed.'); });
function resize() {
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${height}px`);
  document.body.classList.toggle('writing-compact', height < 600);
}
window.visualViewport?.addEventListener('resize', resize); window.addEventListener('resize', resize); resize();

restoreEditor(); $('draftTitle').value = draft().title;
renderDraftList(); renderRound(); updateCounts(); networkStatus();
if (corruptStorage) toast('Saved data could not be read. It has been preserved; download any new writing.');
else save();
try {
  const readJson = url => fetch(url).then(response => { if (!response.ok) throw Error(); return response.json(); });
  const [craft, words, wordnik] = await Promise.all([
    readJson('./data/sentence-trainer.json'),
    readJson('./data/words.json'),
    readJson('./data/wordnik-words.json').catch(() => null)
  ]);
  const fresh = wordnikDeck(wordnik);
  decks = { ...craft, words: fresh.length ? fresh : words };
  $('fullscreenButton').disabled = false;
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
