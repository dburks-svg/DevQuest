import { describe, it, expect } from 'vitest';
import { ACHIEVEMENTS, evaluateAchievements } from '../src/achievements.js';

function baseProfile(overrides = {}) {
  return {
    totalXp: 0,
    streakDays: 0,
    stats: { commits: 0, tests: 0, deploys: 0, pushes: 0, merges: 0 },
    streaks: { questCurrent: 0, questLongest: 0, testCurrent: 0 },
    achievements: [],
    ...overrides
  };
}

// A neutral weekday at noon so day/time achievements do not fire by accident.
const NEUTRAL_NOW = new Date(2024, 0, 3, 12, 0, 0); // Wed 2024-01-03 12:00 local

function ids(profile, context = {}) {
  return evaluateAchievements(profile, { now: NEUTRAL_NOW, ...context }).map((a) => a.id);
}

describe('evaluateAchievements', () => {
  it('unlocks XP-threshold achievements', () => {
    expect(ids(baseProfile({ totalXp: 1 }))).toContain('First Blood');
    expect(ids(baseProfile({ totalXp: 100 }))).toContain('Century');
    expect(ids(baseProfile({ totalXp: 10000 }))).toContain('Insane in the Membrane');
    expect(ids(baseProfile({ totalXp: 50 }))).not.toContain('Century');
  });

  it('unlocks stat-based achievements', () => {
    expect(ids(baseProfile({ stats: { tests: 1 } }))).toContain('Test Believer');
    expect(ids(baseProfile({ stats: { deploys: 1 } }))).toContain('Deployer');
  });

  it('unlocks Bug Hunter only for commit actions with a bug-like message', () => {
    expect(ids(baseProfile(), { action: 'commit', commitMessage: 'fix login crash' })).toContain('Bug Hunter');
    expect(ids(baseProfile(), { action: 'commit', commitMessage: 'add new feature' })).not.toContain('Bug Hunter');
    expect(ids(baseProfile(), { action: 'push', commitMessage: 'fix login crash' })).not.toContain('Bug Hunter');
  });

  it('unlocks Marathon Runner from a qualifying duration bonus', () => {
    expect(ids(baseProfile(), { durationBonus: 100 })).toContain('Marathon Runner');
    expect(ids(baseProfile(), { durationBonus: 50 })).not.toContain('Marathon Runner');
  });

  it('unlocks streak achievements', () => {
    expect(ids(baseProfile({ streakDays: 7 }))).toContain('Streak 7');
    expect(ids(baseProfile({ streaks: { questCurrent: 7 } }))).toContain('Steady Builder');
  });

  it('unlocks time-of-day achievements using local time', () => {
    const nightOwl = evaluateAchievements(baseProfile(), { now: new Date(2024, 0, 3, 2, 0, 0) }).map((a) => a.id);
    expect(nightOwl).toContain('Night Owl');
    const earlyBird = evaluateAchievements(baseProfile(), { now: new Date(2024, 0, 3, 7, 0, 0) }).map((a) => a.id);
    expect(earlyBird).toContain('Early Bird');
    const weekend = evaluateAchievements(baseProfile(), { now: new Date(2024, 0, 6, 12, 0, 0) }).map((a) => a.id); // Saturday
    expect(weekend).toContain('Weekend Warrior');
  });

  it('does not re-unlock achievements already earned', () => {
    const profile = baseProfile({ totalXp: 100, achievements: [{ id: 'First Blood', unlockedAt: 'x' }] });
    const result = ids(profile);
    expect(result).not.toContain('First Blood');
    expect(result).toContain('Century');
  });

  it('stamps unlockedAt with the context time', () => {
    const result = evaluateAchievements(baseProfile({ totalXp: 1 }), { now: NEUTRAL_NOW });
    const firstBlood = result.find((a) => a.id === 'First Blood');
    expect(firstBlood.unlockedAt).toBe(NEUTRAL_NOW.toISOString());
  });

  it('unlocks mid-game XP milestones', () => {
    expect(ids(baseProfile({ totalXp: 1000 }))).toContain('Adventurer of Renown');
    expect(ids(baseProfile({ totalXp: 5000 }))).toContain('Hero of the Realm');
    expect(ids(baseProfile({ totalXp: 999 }))).not.toContain('Adventurer of Renown');
  });

  it('unlocks level milestones', () => {
    expect(ids(baseProfile({ level: 5 }))).toContain('Seasoned');
    expect(ids(baseProfile({ level: 10 }))).toContain('Veteran');
    expect(ids(baseProfile({ level: 20 }))).toContain('Legend');
    expect(ids(baseProfile({ level: 4 }))).not.toContain('Seasoned');
    expect(ids(baseProfile())).not.toContain('Seasoned'); // level absent
  });

  it('unlocks lifetime stat milestones', () => {
    expect(ids(baseProfile({ stats: { commits: 50 } }))).toContain('Chronicler');
    expect(ids(baseProfile({ stats: { commits: 100 } }))).toContain('Lorekeeper');
    expect(ids(baseProfile({ stats: { tests: 100 } }))).toContain('Trial by Fire');
    expect(ids(baseProfile({ stats: { deploys: 10 } }))).toContain('Siege Master');
    expect(ids(baseProfile({ streakDays: 30 }))).toContain('Unbroken');
  });

  it('gives every achievement a unique id and a description', () => {
    const seen = new Set();
    ACHIEVEMENTS.forEach((achievement) => {
      expect(seen.has(achievement.id)).toBe(false);
      seen.add(achievement.id);
      expect(typeof achievement.description).toBe('string');
      expect(achievement.description.length).toBeGreaterThan(0);
    });
  });
});
