#!/usr/bin/env node

import { createRequire } from 'module';
import spawn from 'cross-spawn';
import { buildMatchers, detectAction, extractCommitMessage } from '../src/actions.js';
import { loadConfig, isQuiet } from '../src/config.js';
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
  showStats,
  showAchievements,
  showSummary,
  showHelp,
  resetSession,
  handleQuestCommand
} from '../src/commands.js';

const BUILT_IN_COMMANDS = new Set([
  'status',
  'stats',
  'achievements',
  'summary',
  'help',
  'reset-session',
  'quest'
]);

// Set once at startup from config/DEVQUEST_QUIET. Quiet suppresses flavor
// output only; XP and achievements are still tracked.
let quiet = false;

// Gamification output goes to stderr so the wrapped command's stdout stays
// pristine for pipes and redirection.
function say(message) {
  if (!quiet) {
    console.error(message);
  }
}

async function maybeHandleExpiredSession() {
  const profile = await getProfile();
  const expired = isSessionExpired(profile, Date.now());
  if (!expired) {
    return;
  }
  const summary = getSessionSummary(profile);
  if (summary) {
    say(renderSessionSummary(summary));
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
    case 'stats':
      await showStats();
      break;
    case 'achievements':
      await showAchievements();
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

async function runWrappedCommand(args, matchers) {
  const match = detectAction(args, matchers);
  const action = match?.action ?? null;
  const startTime = Date.now();
  // cross-spawn resolves .cmd/.bat shims and quotes arguments correctly on
  // Windows, so no shell is involved and args pass through unmodified.
  const child = spawn(args[0], args.slice(1), { stdio: 'inherit' });

  const { code, signal } = await new Promise((resolve) => {
    child.on('close', (closeCode, closeSignal) =>
      resolve({ code: closeCode ?? 0, signal: closeSignal })
    );
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        console.error(`devquest: command not found: ${args[0]}`);
        resolve({ code: 127, signal: null });
      } else {
        console.error(`devquest: failed to run ${args[0]} (${error.message})`);
        resolve({ code: 1, signal: null });
      }
    });
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
        xpValue: match.xp,
        repoPath: process.cwd(),
        commitMessage: action === 'commit' ? extractCommitMessage(args) : ''
      });

      if (result.sessionStarted) {
        say(sessionStartBanner());
      }

      if (result.awarded) {
        say(xpGainMessage(action, result.xp));
      }

      if (result.level > result.previousLevel) {
        say(levelUpMessage(result.level));
      }

      result.achievements.forEach((achievement) => {
        say(achievementPopup(achievement));
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
        say(bonusMessages.join(' · '));
      }
    } else if (code === 0) {
      const durationMs = Date.now() - startTime;
      const result = await awardDurationBonus(durationMs, {
        now: new Date(),
        repoPath: process.cwd()
      });
      if (result.sessionStarted) {
        say(sessionStartBanner());
      }
      if (result.awarded) {
        say(`⏳ Endurance bonus: +${result.durationBonus} XP`);
        if (result.level > result.previousLevel) {
          say(levelUpMessage(result.level));
        }
        (result.achievements || []).forEach((achievement) => {
          say(achievementPopup(achievement));
        });
        if (result.questStreak?.updated) {
          say(`📅 Quest streak: ${result.questStreak.current} days`);
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
      say(failureMessage(action));
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

  if (args[0] === 'version' || args[0] === '--version' || args[0] === '-v') {
    const { version } = createRequire(import.meta.url)('../package.json');
    console.log(version);
    return;
  }

  const config = await loadConfig();
  quiet = isQuiet(config);

  await maybeHandleExpiredSession();

  if (BUILT_IN_COMMANDS.has(args[0])) {
    await runBuiltIn(args[0], args);
    return;
  }

  await runWrappedCommand(args, buildMatchers(config.actions));
}

main();
