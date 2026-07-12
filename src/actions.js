const ACTION_PATTERNS = [
  { action: 'commit', pattern: ['git', 'commit'] },
  { action: 'push', pattern: ['git', 'push'] },
  { action: 'test', pattern: ['npm', 'test'] },
  { action: 'deploy', pattern: ['npm', 'run', 'deploy'] },
  { action: 'merge', pattern: ['git', 'merge'] }
];

function matchesPrefix(args, pattern) {
  if (args.length < pattern.length) {
    return false;
  }
  return pattern.every((token, index) => args[index] === token);
}

function detectAction(args) {
  const match = ACTION_PATTERNS.find(({ pattern }) => matchesPrefix(args, pattern));
  return match ? match.action : null;
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

export { ACTION_PATTERNS, detectAction, extractCommitMessage };
