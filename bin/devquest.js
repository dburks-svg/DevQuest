#!/usr/bin/env node

import { spawn } from 'child_process';
import {
  awardXP,
  awardDurationBonus,
  getProfile,
  saveProfile,
  getSessionSummary,
  endSession,
  isSessionExpired,
  resetTestStreak
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
  const startTime = Date.now();
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
    // Re-raising a POSIX signal lets the parent reflect the child's termination
    // cause. Windows has no real signals, so just exit non-zero instead.
    if (process.platform !== 'win32') {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(1);
  }

  try {
    if (code === 0 && action) {
      const durationMs = Date.now() - startTime;
      const result = await awardXP(action, {
        now: new Date(),
        durationMs,
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
      const bonusMessages = [];
      if (result.durationBonus > 0) {
        bonusMessages.push(`⏳ Endurance bonus: +${result.durationBonus} XP`);
      }
      if (result.testStreak?.updated) {
        bonusMessages.push(`🔥 Test streak: ${result.testStreak.current}`);
      }
      if (result.questStreak?.updated) {
        bonusMessages.push(`📅 Quest streak: ${result.questStreak.current} days`);
      }
      if (bonusMessages.length > 0) {
        console.log(bonusMessages.join(' · '));
      }
    } else if (code === 0) {
      const durationMs = Date.now() - startTime;
      const result = await awardDurationBonus(durationMs, {
        now: new Date(),
        repoPath: process.cwd()
      });
      if (result.sessionStarted) {
        console.log(sessionStartBanner());
      }
      if (result.awarded) {
        console.log(`⏳ Endurance bonus: +${result.durationBonus} XP`);
        if (result.level > result.previousLevel) {
          console.log(levelUpMessage(result.level));
        }
        (result.achievements || []).forEach((achievement) => {
          console.log(achievementPopup(achievement));
        });
        if (result.questStreak?.updated) {
          console.log(`📅 Quest streak: ${result.questStreak.current} days`);
        }
      }
    } else if (code !== 0) {
      if (action === 'test') {
        const profile = await getProfile();
        if (resetTestStreak(profile)) {
          profile.updatedAt = new Date().toISOString();
          await saveProfile(profile);
        }
      }
      console.log(failureMessage(action));
    }
  } catch (error) {
    // XP bookkeeping must never change the outcome of the user's command.
    console.error(`devquest: could not record progress (${error.message})`);
  } finally {
    process.exit(code);
  }
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
