// Built-in actions. Each action has an XP value and one or more command
// prefixes that trigger it. Users can override or extend these via
// config.json (see src/config.js); a config entry with the same name
// replaces the fields it specifies and keeps the rest.
const DEFAULT_ACTIONS = {
  commit: {
    xp: 50,
    patterns: [['git', 'commit']]
  },
  push: {
    xp: 75,
    patterns: [['git', 'push']]
  },
  test: {
    xp: 100,
    patterns: [
      ['npm', 'test'],
      ['npm', 'run', 'test'],
      ['pnpm', 'test'],
      ['pnpm', 'run', 'test'],
      ['yarn', 'test'],
      ['bun', 'test'],
      ['npx', 'vitest'],
      ['npx', 'jest'],
      ['pytest'],
      ['cargo', 'test'],
      ['go', 'test']
    ]
  },
  deploy: {
    xp: 500,
    patterns: [
      ['npm', 'run', 'deploy'],
      ['pnpm', 'run', 'deploy'],
      ['yarn', 'deploy']
    ]
  },
  merge: {
    xp: 150,
    patterns: [
      ['git', 'merge'],
      ['gh', 'pr', 'merge']
    ]
  }
};

function matchesPrefix(args, pattern) {
  if (args.length < pattern.length) {
    return false;
  }
  return pattern.every((token, index) => args[index] === token);
}

// Flattens an actions map into matchers sorted longest-prefix-first, so the
// most specific pattern wins (e.g. ['npm','run','deploy'] is checked before a
// hypothetical ['npm','run'] pattern).
function buildMatchers(actions = DEFAULT_ACTIONS) {
  const matchers = [];
  for (const [action, def] of Object.entries(actions)) {
    for (const pattern of def.patterns) {
      matchers.push({ action, xp: def.xp, pattern });
    }
  }
  matchers.sort((a, b) => b.pattern.length - a.pattern.length);
  return matchers;
}

const DEFAULT_MATCHERS = buildMatchers();

// Returns { action, xp } for the first (most specific) matching pattern, or
// null when the command is not a tracked action.
function detectAction(args, matchers = DEFAULT_MATCHERS) {
  const match = matchers.find(({ pattern }) => matchesPrefix(args, pattern));
  return match ? { action: match.action, xp: match.xp } : null;
}

function extractCommitMessage(args) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '-m' || arg === '--message') {
      return args[i + 1] || '';
    }
    if (arg.startsWith('-m') && arg.length > 2) {
      return arg.slice(2); // -m"msg" arrives as -mmsg after the shell strips quotes
    }
    if (arg.startsWith('--message=')) {
      return arg.slice('--message='.length);
    }
  }
  // Editor-based commits (no -m/-F) have no message on the command line.
  return '';
}

export { DEFAULT_ACTIONS, buildMatchers, detectAction, extractCommitMessage };
