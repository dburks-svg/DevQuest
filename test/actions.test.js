import { describe, it, expect } from 'vitest';
import { DEFAULT_ACTIONS, buildMatchers, detectAction, extractCommitMessage } from '../src/actions.js';

describe('detectAction', () => {
  it('matches known action prefixes with their XP', () => {
    expect(detectAction(['git', 'commit', '-m', 'msg'])).toEqual({ action: 'commit', xp: 50 });
    expect(detectAction(['git', 'push', 'origin', 'main'])).toEqual({ action: 'push', xp: 75 });
    expect(detectAction(['git', 'merge', 'feature'])).toEqual({ action: 'merge', xp: 150 });
    expect(detectAction(['npm', 'test'])).toEqual({ action: 'test', xp: 100 });
    expect(detectAction(['npm', 'run', 'deploy'])).toEqual({ action: 'deploy', xp: 500 });
  });

  it('detects test runners beyond npm', () => {
    expect(detectAction(['pnpm', 'test'])?.action).toBe('test');
    expect(detectAction(['yarn', 'test'])?.action).toBe('test');
    expect(detectAction(['bun', 'test'])?.action).toBe('test');
    expect(detectAction(['npx', 'vitest', 'run'])?.action).toBe('test');
    expect(detectAction(['pytest', '-x'])?.action).toBe('test');
    expect(detectAction(['cargo', 'test'])?.action).toBe('test');
    expect(detectAction(['go', 'test', './...'])?.action).toBe('test');
  });

  it('detects gh pr merge as a merge', () => {
    expect(detectAction(['gh', 'pr', 'merge', '9'])?.action).toBe('merge');
  });

  it('requires the full prefix in order', () => {
    expect(detectAction(['git'])).toBeNull();
    expect(detectAction(['npm', 'run'])).toBeNull();
    expect(detectAction(['npm', 'run', 'build'])).toBeNull();
    expect(detectAction(['commit', 'git'])).toBeNull();
  });

  it('returns null for unrelated commands', () => {
    expect(detectAction(['ls', '-la'])).toBeNull();
    expect(detectAction([])).toBeNull();
  });

  it('does not match flags that merely resemble a prefix token', () => {
    // `git -c user.name=x commit` is not detected; the prefix must be exact.
    expect(detectAction(['git', '-c', 'user.name=x', 'commit'])).toBeNull();
  });

  it('prefers the most specific pattern when prefixes overlap', () => {
    const matchers = buildMatchers({
      short: { xp: 10, patterns: [['make']] },
      long: { xp: 20, patterns: [['make', 'deploy']] }
    });
    expect(detectAction(['make', 'deploy'], matchers)).toEqual({ action: 'long', xp: 20 });
    expect(detectAction(['make', 'build'], matchers)).toEqual({ action: 'short', xp: 10 });
  });

  it('supports custom actions from a merged config', () => {
    const matchers = buildMatchers({
      ...DEFAULT_ACTIONS,
      docs: { xp: 30, patterns: [['npm', 'run', 'docs']] }
    });
    expect(detectAction(['npm', 'run', 'docs'], matchers)).toEqual({ action: 'docs', xp: 30 });
    expect(detectAction(['git', 'commit'], matchers)).toEqual({ action: 'commit', xp: 50 });
  });
});

describe('extractCommitMessage', () => {
  it('reads -m with a separate argument', () => {
    expect(extractCommitMessage(['git', 'commit', '-m', 'fix login bug'])).toBe('fix login bug');
  });

  it('reads --message with a separate argument', () => {
    expect(extractCommitMessage(['git', 'commit', '--message', 'msg'])).toBe('msg');
  });

  it('reads the glued -mmsg form', () => {
    expect(extractCommitMessage(['git', 'commit', '-mfix it'])).toBe('fix it');
  });

  it('reads the --message=msg form', () => {
    expect(extractCommitMessage(['git', 'commit', '--message=fix it'])).toBe('fix it');
  });

  it('returns an empty string when no message flag is present', () => {
    expect(extractCommitMessage(['git', 'commit'])).toBe('');
    expect(extractCommitMessage(['git', 'commit', '-m'])).toBe('');
  });
});
