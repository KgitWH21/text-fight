import test from 'node:test';
import assert from 'node:assert/strict';
import { rankFromXP, progress, PROGRESSION } from '../core.js';

test('the original ladder promotes at every exact league boundary', () => {
  for (const [xp, rank, previous] of [
    [120, 'Iron 1', 'Rookie'], [1120, 'Bronze 1', 'Iron 5'],
    [2520, 'Silver 1', 'Bronze 5'], [4320, 'Gold 1', 'Silver 5'],
    [6720, 'Platinum 1', 'Gold 5'], [9920, 'Diamond 1', 'Platinum 5'],
    [14320, 'Master', 'Diamond 5']
  ]) {
    assert.equal(rankFromXP(xp - 1).label, previous);
    assert.equal(rankFromXP(xp).label, rank);
    assert.equal(rankFromXP(xp).into, 0);
    assert.equal(progress(xp).rank, rank);
  }
  assert.equal(rankFromXP(-1).label, 'Rookie');
});

test('league steps, pip counts and next promotion progress follow the original costs', () => {
  for (const [xp, rank, step, into, needed, nextLabel] of [
    [0, 'Rookie', null, 0, 120, 'Iron 1'],
    [319, 'Iron 1', 1, 199, 200, 'Iron 2'],
    [320, 'Iron 2', 2, 0, 200, 'Iron 3'],
    [1000, 'Iron 5', 5, 80, 200, 'Bronze 1'],
    [1400, 'Bronze 2', 2, 0, 280, 'Bronze 3'],
    [3960, 'Silver 5', 5, 0, 360, 'Gold 1'],
    [6240, 'Gold 5', 5, 0, 480, 'Platinum 1'],
    [9280, 'Platinum 5', 5, 0, 640, 'Diamond 1'],
    [14319, 'Diamond 5', 5, 879, 880, 'Master']
  ]) {
    const actual = rankFromXP(xp);
    assert.equal(actual.label, rank); assert.equal(actual.step, step);
    assert.equal(actual.steps, step === null ? 0 : 5);
    assert.equal(actual.into, into); assert.equal(actual.needed, needed);
    assert.equal(actual.nextLabel, nextLabel); assert.equal(actual.writerRate, null);
  }
});

test('Master ratings and higher bands retain original thresholds without changing XP or levels', () => {
  for (const [xp, label, rating] of [
    [14320, 'Master', 1500], [14359, 'Master', 1500], [14360, 'Master', 1501],
    [18319, 'Master', 1599], [18320, 'High Master', 1600],
    [22319, 'High Master', 1699], [22320, 'Grand Master', 1700],
    [26319, 'Grand Master', 1799], [26320, 'Ultimate Master', 1800],
    [30000, 'Ultimate Master', 1892]
  ]) {
    const rank = rankFromXP(xp), level = progress(xp);
    assert.equal(rank.label, label); assert.equal(rank.writerRate, rating);
    assert.equal(rank.steps, 0); assert.equal(rank.step, null);
    assert.equal(level.level, Math.floor(xp / 100) + 1); assert.equal(level.within, xp % 100);
  }
  assert.equal(rankFromXP(14320).nextLabel, 'High Master');
  assert.equal(rankFromXP(26320).nextLabel, 'WR 1801');
  assert.equal(rankFromXP(26320).needed, 40);
  assert.equal(PROGRESSION.xpPerWord, 1); assert.equal(PROGRESSION.promptBonus, 5);
});
