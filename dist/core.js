// Original Text Fight ladder, adapted to this app's lifetime XP. Earnings and
// numeric levels stay independent; all progression tuning lives in this object.
export const PROGRESSION = {
  xpPerWord: 1, promptBonus: 5, levelStep: 100,
  leagues: [
    { name: 'Rookie', steps: 1, xpPerStep: 120 },
    { name: 'Iron', steps: 5, xpPerStep: 200 },
    { name: 'Bronze', steps: 5, xpPerStep: 280 },
    { name: 'Silver', steps: 5, xpPerStep: 360 },
    { name: 'Gold', steps: 5, xpPerStep: 480 },
    { name: 'Platinum', steps: 5, xpPerStep: 640 },
    { name: 'Diamond', steps: 5, xpPerStep: 880 }
  ],
  master: {
    xpPerRating: 40,
    bands: [
      { rating: 1500, name: 'Master' }, { rating: 1600, name: 'High Master' },
      { rating: 1700, name: 'Grand Master' }, { rating: 1800, name: 'Ultimate Master' }
    ]
  }
};
export const CATEGORY_NAMES = { words: 'Vocabulary', starters: 'Starters', craftDevices: 'Craft devices', enders: 'Enders', prompts: 'Training prompts', registers: 'Registers', sentenceEnhancements: 'Enhancements' };
export const CONTINUE_CATEGORIES = ['words', 'starters', 'enders', 'craftDevices'];
export const PACES = { chill: 300000, steady: 180000, hard: 60000 };
export const wordTokens = text => [...text.matchAll(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)];
export const countWords = text => wordTokens(text).length;
export function rankFromXP(xp) {
  const points = Math.max(0, xp);
  let start = 0;
  for (const [index, league] of PROGRESSION.leagues.entries()) {
    const end = start + league.steps * league.xpPerStep;
    if (points < end) {
      const step = Math.floor((points - start) / league.xpPerStep) + 1;
      const nextLeague = PROGRESSION.leagues[index + 1];
      return {
        label: league.steps === 1 ? league.name : `${league.name} ${step}`,
        step: league.steps === 1 ? null : step, steps: league.steps === 1 ? 0 : league.steps,
        into: (points - start) % league.xpPerStep, needed: league.xpPerStep,
        nextLabel: step < league.steps ? `${league.name} ${step + 1}` : nextLeague ? `${nextLeague.name} 1` : PROGRESSION.master.bands[0].name,
        writerRate: null
      };
    }
    start = end;
  }
  const { xpPerRating, bands } = PROGRESSION.master;
  const overflow = points - start;
  const writerRate = bands[0].rating + Math.floor(overflow / xpPerRating);
  const bandIndex = bands.findLastIndex(band => writerRate >= band.rating);
  const band = bands[bandIndex], next = bands[bandIndex + 1];
  return {
    label: band.name, step: null, steps: 0, writerRate,
    into: next ? overflow - (band.rating - bands[0].rating) * xpPerRating : overflow % xpPerRating,
    needed: next ? (next.rating - band.rating) * xpPerRating : xpPerRating,
    nextLabel: next?.name || `WR ${writerRate + 1}`
  };
}
export function progress(xp) {
  return { level: Math.floor(xp / PROGRESSION.levelStep) + 1, within: xp % PROGRESSION.levelStep,
    rank: rankFromXP(xp).label };
}
export function createRound(text, mode = 'continue', interval = PACES.chill) {
  return { id: globalThis.crypto.randomUUID(), mode, baseline: countWords(text),
    origins: '0'.repeat(text.length), highWater: 0, wordXP: 0, bonusXP: 0,
    paused: false, pinned: false, remaining: interval, card: null, last: {}, journal: [], cursor: 0 };
}
export const sessionCount = (text, round) => round ? countWords(text) - round.baseline : 0;

// Prefer the actual beforeinput range. The fallback handles dictation, autofill,
// composition, and browsers that do not expose a useful beforeinput operation.
export function changedRange(before, after, selection) {
  if (selection) {
    const { start, end } = selection;
    const addedLength = after.length - before.length + end - start;
    if (addedLength >= 0 && before.slice(0, start) === after.slice(0, start) &&
        before.slice(end) === after.slice(start + addedLength)) {
      return { start, end, inserted: after.slice(start, start + addedLength) };
    }
  }
  let start = 0, end = before.length, tail = after.length;
  while (start < end && start < tail && before[start] === after[start]) start++;
  while (end > start && tail > start && before[end - 1] === after[tail - 1]) { end--; tail--; }
  return { start, end, inserted: after.slice(start, tail) };
}
function applyPatch(text, origins, p, reverse = false) {
  const removed = reverse ? p.inserted : p.deleted, added = reverse ? p.deleted : p.inserted;
  const flags = reverse ? p.deletedOrigins : p.insertedOrigins;
  if (text.slice(p.start, p.start + removed.length) !== removed) return null;
  return { text: text.slice(0, p.start) + added + text.slice(p.start + removed.length),
    origins: origins.slice(0, p.start) + flags + origins.slice(p.start + removed.length) };
}
export function editRound(round, before, after, { selection, inputType = '' } = {}) {
  if (before === after) return 0;
  const oldOrigins = round.origins;
  let restored = false;
  if (inputType === 'historyUndo' || inputType === 'historyRedo') {
    const backwards = inputType === 'historyUndo';
    let temp = { text: before, origins: oldOrigins }, cursor = round.cursor;
    while (backwards ? cursor > 0 : cursor < round.journal.length) {
      const p = round.journal[backwards ? --cursor : cursor++];
      temp = applyPatch(temp.text, temp.origins, p, backwards);
      if (!temp) break;
      if (temp.text === after) { round.origins = temp.origins; round.cursor = cursor; restored = true; break; }
    }
  }
  if (!restored) {
    const { start, end, inserted } = changedRange(before, after, selection);
    const deletedOrigins = oldOrigins.slice(start, end);
    // A correction inside an original word remains original prose. New words,
    // including those inserted in an earlier paragraph, belong to this round.
    const letter = c => c && /[\p{L}\p{N}'’\-]/u.test(c);
    let originalCorrection = false;
    if (deletedOrigins && !deletedOrigins.includes('1') && !/\s/u.test(inserted) && !/\s/u.test(before.slice(start, end))) originalCorrection = true;
    if (start === end && !/\s/u.test(inserted) &&
        ((letter(before[start - 1]) && oldOrigins[start - 1] === '0') ||
         (letter(before[start]) && oldOrigins[start] === '0'))) originalCorrection = true;
    const insertedOrigins = (originalCorrection ? '0' : '1').repeat(inserted.length);
    const p = { start, deleted: before.slice(start, end), inserted, deletedOrigins, insertedOrigins };
    round.origins = oldOrigins.slice(0, start) + insertedOrigins + oldOrigins.slice(end);
    round.journal.splice(round.cursor);
    round.journal.push(p); round.cursor++;
  }
  // A normal edit earns its positive word delta. History traversal restores
  // already credited edits, including grouped native undo, so it earns nothing.
  // This also lets genuinely new prose earn XP after an earlier cut.
  const net = Math.max(0, sessionCount(after, round));
  const earned = inputType.startsWith('history') ? 0 : Math.max(0, countWords(after) - countWords(before)) * PROGRESSION.xpPerWord;
  round.highWater = Math.max(round.highWater, net); round.wordXP += earned;
  return earned;
}
export function undoRound(round, text, redo = false) {
  const p = round.journal[redo ? round.cursor : round.cursor - 1];
  if (!p) return null;
  const result = applyPatch(text, round.origins, p, !redo);
  if (!result) return null;
  round.cursor += redo ? 1 : -1; round.origins = result.origins;
  return { text: result.text, caret: p.start + (redo ? p.inserted.length : p.deleted.length) };
}
export function sessionText(text, round) {
  if (!round) return '';
  // Keep added punctuation and paragraph breaks as well as whole corrected
  // words. Separate additions when original prose lies between their runs.
  const included = Uint8Array.from(round.origins, c => c === '1' ? 1 : 0);
  for (const token of wordTokens(text)) {
    const end = token.index + token[0].length;
    if (round.origins.slice(token.index, end).includes('1')) included.fill(1, token.index, end);
  }
  const chunks = [];
  for (let i = 0; i < text.length;) {
    if (!included[i]) { i++; continue; }
    const start = i;
    while (i < text.length && included[i]) i++;
    const chunk = text.slice(start, i).trim(); if (chunk) chunks.push(chunk);
  }
  return chunks.join('\n\n');
}
export function vocabularyUsed(text, round, word) {
  const target = word.toLocaleLowerCase();
  return wordTokens(text).some(t => t[0].toLocaleLowerCase() === target && round.origins.slice(t.index, t.index + t[0].length).includes('1'));
}
export function awardPrompt(round) {
  if (!round.card || round.card.used) return 0;
  round.card.used = true; round.bonusXP += PROGRESSION.promptBonus; return PROGRESSION.promptBonus;
}
export function dealLocal(decks, enabled, last, random = Math.random) {
  const available = enabled.filter(k => decks[k]?.length);
  if (!available.length) throw new Error('Choose at least one category.');
  const category = available[Math.floor(random() * available.length)];
  const deck = decks[category];
  const choices = deck.map((entry, i) => i).filter(i => deck.length === 1 || i !== last[category]);
  const index = choices[Math.floor(random() * choices.length)];
  last[category] = index;
  const entry = deck[index];
  return { id: globalThis.crypto.randomUUID(), category, title: typeof entry === 'string' ? entry : entry.type,
    explanation: typeof entry === 'string' ? 'Let this be the seed of your next sentence.' : entry.example, source: 'local', used: false };
}
export function advanceTimer(round, elapsed, interval, visible = true) {
  if (!round || round.paused || round.pinned || !visible) return false;
  round.remaining = Math.max(0, round.remaining - Math.max(0, elapsed));
  if (round.remaining > 0) return false;
  round.remaining = interval; return true;
}
