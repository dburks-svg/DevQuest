import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  getXpForLevel,
  getLevelFromTotalXp,
  getDurationBonus,
  updateStreak,
  updateQuestStreak,
  updateTestStreak,
  getProfile,
  saveProfile,
  awardXP,
  awardDurationBonus
} from '../src/xp.js';

describe('getXpForLevel', () => {
  it('follows the floor(100 * level^1.5) curve', () => {
    expect(getXpForLevel(1)).toBe(100);
    expect(getXpForLevel(2)).toBe(282);
    expect(getXpForLevel(3)).toBe(519);
  });
});

describe('getLevelFromTotalXp', () => {
  it('maps total XP to level and remainder', () => {
    expect(getLevelFromTotalXp(0)).toEqual({ level: 1, xp: 0 });
    expect(getLevelFromTotalXp(99)).toEqual({ level: 1, xp: 99 });
    expect(getLevelFromTotalXp(100)).toEqual({ level: 2, xp: 0 });
    expect(getLevelFromTotalXp(150)).toEqual({ level: 2, xp: 50 });
    expect(getLevelFromTotalXp(382)).toEqual({ level: 3, xp: 0 });
  });
});

describe('getDurationBonus', () => {
  it('awards tiered bonuses by minutes', () => {
    expect(getDurationBonus(0)).toBe(0);
    expect(getDurationBonus(60 * 1000)).toBe(0);
    expect(getDurationBonus(2 * 60 * 1000)).toBe(25);
    expect(getDurationBonus(5 * 60 * 1000)).toBe(50);
    expect(getDurationBonus(15 * 60 * 1000)).toBe(100);
    expect(getDurationBonus(60 * 60 * 1000)).toBe(100);
  });
});

describe('updateStreak', () => {
  it('increments on consecutive local days and resets after a gap', () => {
    const profile = { lastStreakDate: null, streakDays: 0 };
    updateStreak(profile, new Date(2024, 0, 1, 10));
    expect(profile.streakDays).toBe(1);
    updateStreak(profile, new Date(2024, 0, 1, 18)); // same day
    expect(profile.streakDays).toBe(1);
    updateStreak(profile, new Date(2024, 0, 2, 9)); // next day
    expect(profile.streakDays).toBe(2);
    updateStreak(profile, new Date(2024, 0, 5, 9)); // gap
    expect(profile.streakDays).toBe(1);
  });
});

describe('updateQuestStreak', () => {
  function questProfile() {
    return {
      questMode: true,
      lastQuestDay: null,
      streaks: { questCurrent: 0, questLongest: 0, testCurrent: 0 }
    };
  }

  it('counts consecutive quest days and tracks the longest', () => {
    const profile = questProfile();
    expect(updateQuestStreak(profile, new Date(2024, 0, 1, 10))).toEqual({ updated: true, current: 1 });
    expect(updateQuestStreak(profile, new Date(2024, 0, 1, 20))).toEqual({ updated: false, current: 1 });
    expect(updateQuestStreak(profile, new Date(2024, 0, 2, 9))).toEqual({ updated: true, current: 2 });
    expect(profile.streaks.questLongest).toBe(2);
    expect(updateQuestStreak(profile, new Date(2024, 0, 5, 9))).toEqual({ updated: true, current: 1 });
    expect(profile.streaks.questLongest).toBe(2);
  });

  it('does nothing when quest mode is off', () => {
    const profile = { questMode: false, lastQuestDay: null, streaks: { questCurrent: 3 } };
    expect(updateQuestStreak(profile, new Date(2024, 0, 1))).toEqual({ updated: false, current: 3 });
  });
});

describe('updateTestStreak', () => {
  it('increments on test and resets on an intervening non-test action', () => {
    const profile = { questMode: true, streaks: { testCurrent: 0 } };
    expect(updateTestStreak(profile, 'test')).toEqual({ updated: true, current: 1 });
    expect(updateTestStreak(profile, 'test')).toEqual({ updated: true, current: 2 });
    expect(updateTestStreak(profile, 'commit')).toEqual({ updated: false, current: 0 });
    expect(updateTestStreak(profile, 'test')).toEqual({ updated: true, current: 1 });
  });

  it('resets when quest mode is off', () => {
    const profile = { questMode: false, streaks: { testCurrent: 4 } };
    expect(updateTestStreak(profile, 'test')).toEqual({ updated: false, current: 0 });
  });
});

describe('awardXP / awardDurationBonus (persisted)', () => {
  let home;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'devquest-test-'));
    process.env.DEVQUEST_HOME = home;
  });

  afterEach(async () => {
    delete process.env.DEVQUEST_HOME;
    await fs.rm(home, { recursive: true, force: true });
  });

  it('awards base XP and persists it', async () => {
    const result = await awardXP('commit', { now: new Date(), repoPath: home });
    expect(result.awarded).toBe(true);
    expect(result.xp).toBe(50);
    const profile = await getProfile();
    expect(profile.totalXp).toBe(50);
    expect(profile.stats.commits).toBe(1);
  });

  it('returns awarded:false for an unknown action', async () => {
    const result = await awardXP('frobnicate', { now: new Date(), repoPath: home });
    expect(result.awarded).toBe(false);
  });

  it('unlocks Marathon Runner from a standalone duration bonus (regression)', async () => {
    const profile = await getProfile();
    profile.questMode = true;
    await saveProfile(profile);

    const result = await awardDurationBonus(16 * 60 * 1000, { now: new Date(), repoPath: home });
    expect(result.awarded).toBe(true);
    expect(result.durationBonus).toBe(100);
    expect(result.achievements.map((a) => a.id)).toContain('Marathon Runner');

    const saved = await getProfile();
    expect(saved.achievements.map((a) => a.id)).toContain('Marathon Runner');
  });

  it('evaluates XP-threshold achievements against the true total including the bonus (regression)', async () => {
    const profile = await getProfile();
    profile.questMode = true;
    profile.totalXp = 9850;
    await saveProfile(profile);

    // +100 (test) and +100 (duration bonus) => 10050. The old code checked
    // totalXp minus the bonus (9950) and would have missed the 10000 threshold.
    const result = await awardXP('test', {
      now: new Date(),
      durationMs: 16 * 60 * 1000,
      repoPath: home
    });
    expect(result.durationBonus).toBe(100);
    expect(result.achievements.map((a) => a.id)).toContain('Insane in the Membrane');
  });

  it('breaks the test streak on an intervening commit (regression)', async () => {
    let profile = await getProfile();
    profile.questMode = true;
    await saveProfile(profile);

    let result = await awardXP('test', { now: new Date(), repoPath: home });
    expect(result.testStreak.current).toBe(1);
    result = await awardXP('commit', { now: new Date(), repoPath: home });
    expect(result.testStreak.current).toBe(0);
    result = await awardXP('test', { now: new Date(), repoPath: home });
    expect(result.testStreak.current).toBe(1);
  });
});
