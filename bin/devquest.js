#!/usr/bin/env node

import { spawn } from 'child_process';
import {
  awardXP,
  getProfile,
  saveProfile,
  getSessionSummary,
  endSession,
  isSessionExpired
} from '../src/xp.js';
import {
  sessionStartBanner,
  xpGainMessage,
  levelUpMessage,
  failureMessage,
  achievementPopup,
  sessionSummary as renderSessionSummary
} from '../src/theme-dnd.js';
import {
  showStatus,
  showSummary,
  showHelp,
  resetSession,
  handleQuestCommand
} from '../src/commands.js';

const BUILT_IN_COMMANDS = new Set(['status', 'summary', 'help', 'reset-session', 'quest']);

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
  const messageIndex = args.findIndex((arg) => arg === '-m' || arg === '--message');
  if (messageIndex === -1 || messageIndex + 1 >= args.length) {
    return '';
  }
  return args[messageIndex + 1];
}

async function maybeHandleExpiredSession() {
  const profile = await getProfile();
  const expired = isSessionExpired(profile, Date.now());
  if (!expired) {
    return;
  }
  const summary = getSessionSummary(profile);
  if (summary) {
    console.log(renderSessionSummary(summary));
    endSession(profile);
    profile.sessionStart = new Date().toISOString();
    profile.sessionXp = 0;
    profile.sessionActions = {
      commits: 0,
      tests: 0,
      deploys: 0,
      pushes: 0,
      merges: 0
    };
    profile.lastActivity = profile.sessionStart;
    profile.updatedAt = profile.sessionStart;
    await saveProfile(profile);
  }
}

async function runBuiltIn(command, args) {
  switch (command) {
    case 'status':
      await showStatus();
      break;
    case 'summary':
      await showSummary();
      break;
    case 'help':
      await showHelp();
      break;
    case 'reset-session':
      await resetSession();
      break;
    case 'quest':
      await handleQuestCommand(args.slice(1));
      break;
    default:
      await showHelp();
      process.exitCode = 1;
  }
}

async function runWrappedCommand(args) {
  const action = detectAction(args);
  const child = spawn(args[0], args.slice(1), {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  const { code, signal } = await new Promise((resolve) => {
    child.on('close', (closeCode, closeSignal) =>
      resolve({ code: closeCode ?? 0, signal: closeSignal })
    );
    child.on('error', () => resolve({ code: 1, signal: null }));
  });

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  if (code === 0 && action) {
    const result = await awardXP(action, {
      now: new Date(),
      repoPath: process.cwd(),
      commitMessage: action === 'commit' ? extractCommitMessage(args) : ''
    });

    if (result.sessionStarted) {
      console.log(sessionStartBanner());
    }

    if (result.awarded) {
      console.log(xpGainMessage(action, result.xp));
    }

    if (result.level > result.previousLevel) {
      console.log(levelUpMessage(result.level));
    }

    result.achievements.forEach((achievement) => {
      console.log(achievementPopup(achievement));
    });
  } else if (code !== 0) {
    console.log(failureMessage(action));
  }

  process.exit(code);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    await showHelp();
    return;
  }

  await maybeHandleExpiredSession();

  if (BUILT_IN_COMMANDS.has(args[0])) {
    await runBuiltIn(args[0], args);
    return;
  }

  await runWrappedCommand(args);
}

main();
