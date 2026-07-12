import { describe, it, expect } from 'vitest';
import { detectAction, extractCommitMessage } from '../src/actions.js';

describe('detectAction', () => {
  it('matches known action prefixes', () => {
    expect(detectAction(['git', 'commit', '-m', 'msg'])).toBe('commit');
    expect(detectAction(['git', 'push', 'origin', 'main'])).toBe('push');
    expect(detectAction(['git', 'merge', 'feature'])).toBe('merge');
    expect(detectAction(['npm', 'test'])).toBe('test');
    expect(detectAction(['npm', 'run', 'deploy'])).toBe('deploy');
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
