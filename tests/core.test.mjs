import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRound, editRound, undoRound, sessionCount, countWords, sessionText, dealLocal, awardPrompt, vocabularyUsed, advanceTimer, progress, PACES, CATEGORY_NAMES } from '../core.js';

test('exact 3000-word regression: append 120, correct earlier typo, cut 15, undo, redo, restore', () => {
  const base = 'teh ' + Array.from({ length: 2999 }, (_, i) => `old${i}`).join(' ');
  const added = Array.from({ length: 120 }, (_, i) => `new${i}`).join(' ');
  assert.equal(countWords(base), 3000);
  let text = base; let round = createRound(text); let xp = 0;
  let next = text + '\n\n' + added;
  xp += editRound(round, text, next, { selection: { start: text.length, end: text.length } }); text = next;
  assert.equal(sessionCount(text, round), 120); assert.equal(xp, 120);
  // A caret move/selection/scroll never calls editRound or changes the baseline.
  next = text.replace(/^teh/, 'the');
  xp += editRound(round, text, next, { selection: { start: 0, end: 3 } }); text = next;
  assert.equal(sessionCount(text, round), 120); assert.equal(xp, 120);
  assert.equal(sessionText(text, round), added);
  const start = text.indexOf(' new105'); next = text.slice(0, start);
  xp += editRound(round, text, next, { selection: { start, end: text.length } }); text = next;
  assert.equal(sessionCount(text, round), 105); assert.equal(xp, 120);
  text = undoRound(round, text).text; assert.equal(sessionCount(text, round), 120);
  text = undoRound(round, text, true).text; assert.equal(sessionCount(text, round), 105);
  const restored = JSON.parse(JSON.stringify({ text, round, xp }));
  assert.equal(countWords(restored.text), 3105); assert.equal(sessionCount(restored.text, restored.round), 105);
  assert.equal(restored.xp, 120); assert.equal(restored.round.wordXP, 120);
  assert.equal(sessionText(restored.text, restored.round), added.split(' ').slice(0, 105).join(' '));
});
test('native grouped undo and redo preserve provenance and never award twice', () => {
  const round = createRound('Old prose.'); let text = 'Old prose.', xp = 0;
  for (const inserted of [' A', ' quiet', ' door.']) { const next = text + inserted; xp += editRound(round, text, next); text = next; }
  assert.equal(xp, 3);
  const end = text;
  xp += editRound(round, text, 'Old prose.', { inputType: 'historyUndo' }); text = 'Old prose.';
  assert.equal(round.cursor, 0); assert.equal(sessionText(text, round), '');
  xp += editRound(round, text, end, { inputType: 'historyRedo' });
  assert.equal(round.cursor, 3); assert.equal(xp, 3); assert.equal(sessionText(end, round), 'A quiet door.');
});
test('typing in the middle attributes new words and preserves original prose', () => {
  const base = 'She opened the door.', round = createRound(base), start = base.indexOf('the');
  const after = base.slice(0, start) + 'very slowly ' + base.slice(start);
  assert.equal(editRound(round, base, after, { selection: { start, end: start } }), 2);
  assert.equal(sessionCount(after, round), 2); assert.equal(sessionText(after, round), 'very slowly');
});
test('selected session prose is corrected without copying the baseline', () => {
  const base = 'An old paragraph.', round = createRound(base);
  let text = base + '\n\nA caat waited.';
  assert.equal(editRound(round, base, text), 3);
  const start = text.indexOf('caat'), next = text.replace('caat', 'cat');
  assert.equal(editRound(round, text, next, { selection: { start, end: start + 4 } }), 0);
  assert.equal(sessionText(next, round), 'A cat waited.');
});
test('copying separate session additions preserves quotes and punctuation', () => {
  const base = 'Original prose. More original prose.', round = createRound(base);
  let text = '"Wait!" ' + base;
  editRound(round, base, text, { selection: { start: 0, end: 0 } });
  const next = text + '\n\nShe waited…'; editRound(round, text, next);
  assert.equal(sessionText(next, round), '"Wait!"\n\nShe waited…');
});
test('replacing an old selection awards only net new words', () => {
  const base = 'A door stood open.', round = createRound(base);
  const next = 'A narrow iron gate stood open.';
  assert.equal(editRound(round, base, next, { selection: { start: 2, end: 6 } }), 2);
  assert.equal(sessionCount(next, round), 2); assert.equal(sessionText(next, round), 'narrow iron gate');
});
test('mobile-style dictation inserts multiple words in one event', () => {
  const round = createRound(''); const text = 'Rain hammered the copper roof.';
  assert.equal(editRound(round, '', text, { inputType: 'insertFromDictation' }), 5);
  assert.equal(sessionCount(text, round), 5); assert.equal(sessionText(text, round), text);
});
test('opening and starting a round on existing prose awards no XP', () => {
  const round = createRound('The old scene stays here.');
  assert.equal(round.wordXP, 0); assert.equal(round.highWater, 0);
  assert.equal(sessionCount('The old scene stays here.', round), 0);
  assert.equal(sessionText('The old scene stays here.', round), '');
});
test('new prose after a cut earns XP while restoring the cut does not', () => {
  const round = createRound(''); let text = 'One two three four five.';
  let xp = editRound(round, '', text);
  xp += editRound(round, text, 'One two'); text = 'One two';
  assert.equal(xp, 5);
  xp += editRound(round, text, text + ' six seven'); text += ' six seven';
  assert.equal(xp, 7); assert.equal(sessionCount(text, round), 4);
  const previous = text; text = undoRound(round, text).text;
  text = undoRound(round, text, true).text; assert.equal(text, previous); assert.equal(round.wordXP, 7);
});
test('word counting handles Unicode, apostrophes, em dashes and punctuation', () => {
  assert.equal(countWords("Don't re-enter—café naïve. 123"), 5);
  assert.equal(countWords('  … !!! \n'), 0);
});
test('vocabulary is whole-word, case-insensitive, and only in session prose', () => {
  const base = 'A lantern glowed.', round = createRound(base);
  assert.equal(vocabularyUsed(base, round, 'lantern'), false);
  let text = base + ' Lanterns'; editRound(round, base, text);
  assert.equal(vocabularyUsed(text, round, 'lantern'), false);
  const next = text + ' LANTERN!'; editRound(round, text, next);
  assert.equal(vocabularyUsed(next, round, 'lantern'), true);
});
test('automatic and manual use share exactly one bonus per dealt card', () => {
  const round = createRound(''); round.card = { id: 'one', used: false };
  assert.equal(awardPrompt(round), 5); assert.equal(awardPrompt(round), 0);
  const restored = JSON.parse(JSON.stringify(round)); assert.equal(awardPrompt(restored), 0);
  restored.card = { id: 'two', used: false }; assert.equal(awardPrompt(restored), 5);
});
test('category first selection is balanced regardless of deck size and avoids repeats', () => {
  const decks = { tiny: ['one', 'two'], huge: Array.from({ length: 1000 }, (_, i) => `x${i}`) }, last = {};
  assert.equal(dealLocal(decks, ['tiny', 'huge'], last, () => .49).category, 'tiny');
  assert.equal(dealLocal(decks, ['tiny', 'huge'], last, () => .51).category, 'huge');
  let previous;
  for (let i = 0; i < 20; i++) { const card = dealLocal(decks, ['tiny'], last, () => 0); assert.notEqual(card.title, previous); previous = card.title; }
  assert.throws(() => dealLocal(decks, [], last));
});
test('timer pauses when hidden, paused or pinned; overdue time deals once', () => {
  const round = createRound('', 'continue', PACES.chill);
  assert.equal(advanceTimer(round, 10000, PACES.chill, false), false); assert.equal(round.remaining, PACES.chill);
  round.paused = true; advanceTimer(round, 10000, PACES.chill); assert.equal(round.remaining, PACES.chill);
  round.paused = false; round.pinned = true; advanceTimer(round, 10000, PACES.chill); assert.equal(round.remaining, PACES.chill);
  round.pinned = false; assert.equal(advanceTimer(round, 999999, PACES.chill), true); assert.equal(round.remaining, PACES.chill);
  assert.equal(advanceTimer(round, 100, PACES.chill), false);
});
test('ranks advance less often than levels', () => {
  assert.deepEqual(progress(0), { level: 1, within: 0, rank: 'Rookie' });
  assert.equal(progress(100).level, 2); assert.equal(progress(100).rank, 'Rookie');
  assert.equal(progress(120).rank, 'Iron 1');
  assert.equal(progress(300).level, 4); assert.equal(progress(300).rank, 'Iron 1');
  assert.equal(progress(320).rank, 'Iron 2');
});
test('the full original craft dataset and offline word deck are bundled', async () => {
  const deck = JSON.parse(await readFile(new URL('../data/sentence-trainer.json', import.meta.url)));
  assert.deepEqual(Object.fromEntries(Object.entries(deck).map(([k, v]) => [k, v.length])), { starters: 24, craftDevices: 101, enders: 20, prompts: 341, sentenceEnhancements: 376, registers: 88 });
  for (const [key, entries] of Object.entries(deck)) for (const entry of entries) assert.ok(key === 'prompts' ? typeof entry === 'string' : entry.type && entry.example);
  const words = JSON.parse(await readFile(new URL('../data/words.json', import.meta.url)));
  assert.equal(words.length, 1168); assert.equal(new Set(words.map(w => w.type.toLowerCase())).size, words.length);
  for (const word of words) { assert.ok(word.type.trim()); assert.ok(word.example.trim()); }
  assert.deepEqual(Object.keys(CATEGORY_NAMES).sort(), ['words', ...Object.keys(deck)].sort());
});
