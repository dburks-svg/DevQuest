import { describe, it, expect } from 'vitest';
import { classifyCommits } from '../src/class.js';

function commit(subject, files = []) {
  return { subject, files };
}

function statsOf(overrides = {}) {
  return {
    commits: 0,
    tests: 0,
    deploys: 0,
    pushes: 0,
    merges: 0,
    ...overrides
  };
}

describe('classifyCommits', () => {
  it('returns Adventurer when there are no commits', () => {
    expect(classifyCommits([], { stats: statsOf() })).toBe('Adventurer');
    expect(classifyCommits(null, { stats: statsOf() })).toBe('Adventurer');
  });

  it('picks the dominant commit-content class', () => {
    const commits = Array.from({ length: 5 }, () => commit('fix login bug'));
    const profile = { stats: statsOf({ commits: 5 }) };
    expect(classifyCommits(commits, profile)).toBe('Debug Dragon');
  });

  it('uses profile action stats for test/deploy classes on the same denominator', () => {
    // 1 neutral commit + 9 test actions => tests dominate the 10 tracked actions.
    const commits = [commit('add feature', ['notes.md'])];
    const profile = { stats: statsOf({ commits: 1, tests: 9 }) };
    expect(classifyCommits(commits, profile)).toBe('Test Cleric');
  });

  it('falls back to commit count as the denominator when no actions are tracked', () => {
    const commits = Array.from({ length: 4 }, () => commit('hotfix crash'));
    const profile = { stats: statsOf() }; // totalActions === 0
    expect(classifyCommits(commits, profile)).toBe('Debug Dragon');
  });

  it('returns the generalist for a balanced spread', () => {
    const commits = [
      commit('fix a', []),
      commit('refactor b', []),
      commit('ui c', ['src/ui/x.css']),
      commit('docs d', ['notes.md'])
    ];
    const profile = { stats: statsOf({ commits: 4 }) };
    expect(classifyCommits(commits, profile)).toBe('Full Stack Druid');
  });

  it('no longer returns a stale class in the former 0.35-0.40 dead zone', () => {
    // 3 of 8 actions are bug commits => leader share 0.375, below the 0.40 bar.
    const commits = [
      ...Array.from({ length: 3 }, () => commit('fix bug')),
      ...Array.from({ length: 5 }, () => commit('add stuff', ['notes.md']))
    ];
    const profile = { class: 'Backend Warrior', stats: statsOf({ commits: 8 }) };
    const result = classifyCommits(commits, profile);
    expect(result).toBe('Full Stack Druid');
    expect(result).not.toBe('Backend Warrior'); // the stale-class bug is gone
  });
});
