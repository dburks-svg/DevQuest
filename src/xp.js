import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { evaluateAchievements } from './achievements.js';
import { detectClass } from './class.js';

// Profile location is resolved lazily so DEVQUEST_HOME can redirect it (used by
// tests and anyone who wants an isolated profile) without touching the real
// ~/.devquest. Reading the env per call also means a changed env is honored.
function profilePaths() {
  const dir = process.env.DEVQUEST_HOME
    ? path.resolve(process.env.DEVQUEST_HOME)
    : path.join(os.homedir(), '.devquest');
  return {
    dir,
    file: path.join(dir, 'profile.json'),
    tmp: path.join(dir, 'profile.json.tmp'),
    lock: path.join(dir, 'profile.lock')
  };
}
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const LOCK_STALE_MS = 10 * 1000;

const DEFAULT_PROFILE = () => ({
  username: 'adventurer',
  class: 'Adventurer',
  level: 1,
  xp: 0,
  totalXp: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  stats: {
    commits: 0,
    tests: 0,
    deploys: 0,
    pushes: 0,
    merges: 0
  },
  achievements: [],
  questMode: false,
  sessionXp: 0,
  sessionStart: null,
  sessionActions: {
    commits: 0,
    tests: 0,
    deploys: 0,
    pushes: 0,
    merges: 0
  },
  lastActivity: null,
  streakDays: 0,
  lastStreakDate: null,
  streaks: {
    questCurrent: 0,
    questLongest: 0,
    testCurrent: 0
  },
  lastQuestDay: null
});

const XP_VALUES = {
  commit: 50,
  push: 75,
  test: 100,
  deploy: 500,
  merge: 150
};

const STAT_KEYS = {
  commit: 'commits',
  push: 'pushes',
  test: 'tests',
  deploy: 'deploys',
  merge: 'merges'
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureProfileDir() {
  await fs.mkdir(profilePaths().dir, { recursive: true });
}

async function acquireLock() {
  await ensureProfileDir();
  const { lock } = profilePaths();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const handle = await fs.open(lock, 'wx');
      await handle.close();
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
      try {
        const stats = await fs.stat(lock);
        const age = Date.now() - stats.mtimeMs;
        if (age > LOCK_STALE_MS) {
          // Only remove a lock that is demonstrably stale.
          await fs.unlink(lock);
          continue;
        }
      } catch (statError) {
        if (statError.code !== 'ENOENT') {
          throw statError;
        }
      }
      await sleep(200);
    }
  }
  // Retries exhausted against a live lock. Do NOT delete it and proceed: that
  // would clobber the holder's write. Fail loudly so the caller can degrade.
  throw new Error(
    'devquest: could not acquire profile lock; another devquest process may be running'
  );
}

async function releaseLock() {
  await fs.unlink(profilePaths().lock).catch(() => {});
}

function getXpForLevel(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

function getLevelFromTotalXp(totalXp) {
  let level = 1;
  let remaining = totalXp;
  while (remaining >= getXpForLevel(level)) {
    remaining -= getXpForLevel(level);
    level += 1;
  }
  return { level, xp: remaining };
}

function normalizeProfile(profile) {
  const normalized = { ...DEFAULT_PROFILE(), ...profile };
  normalized.stats = { ...DEFAULT_PROFILE().stats, ...(profile.stats || {}) };
  normalized.sessionActions = {
    ...DEFAULT_PROFILE().sessionActions,
    ...(profile.sessionActions || {})
  };
  normalized.achievements = profile.achievements || [];
  normalized.questMode = profile.questMode ?? false;
  normalized.streaks = {
    ...DEFAULT_PROFILE().streaks,
    ...(profile.streaks || {})
  };
  normalized.lastQuestDay = profile.lastQuestDay ?? null;
  return normalized;
}

async function readProfileFile() {
  const { file, dir } = profilePaths();
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    if (error instanceof SyntaxError) {
      await ensureProfileDir();
      const backupPath = path.join(dir, `profile.json.bak.${Date.now()}`);
      await fs.rename(file, backupPath).catch(() => {});
      // Tell the user their progress was reset and where to recover it, instead
      // of silently starting over.
      console.error(
        `devquest: profile.json was corrupt and has been reset. A backup was saved to ${backupPath}`
      );
      return null;
    }
    throw error;
  }
}

async function getProfile() {
  await ensureProfileDir();
  const profile = await readProfileFile();
  return normalizeProfile(profile || DEFAULT_PROFILE());
}

async function saveProfile(profile) {
  await acquireLock();
  try {
    await ensureProfileDir();
    const { file, tmp } = profilePaths();
    const payload = JSON.stringify(profile, null, 2);
    await fs.writeFile(tmp, payload, 'utf8');
    await fs.rename(tmp, file);
  } finally {
    await releaseLock();
  }
}

function isSessionExpired(profile, now = Date.now()) {
  if (!profile.sessionStart || !profile.lastActivity) {
    return false;
  }
  return now - new Date(profile.lastActivity).getTime() > SESSION_TIMEOUT_MS;
}

function startSessionIfNeeded(profile, now = new Date()) {
  if (!profile.sessionStart) {
    profile.sessionStart = now.toISOString();
    profile.sessionXp = 0;
    profile.sessionActions = { ...DEFAULT_PROFILE().sessionActions };
    return true;
  }
  return false;
}

function endSession(profile) {
  profile.sessionStart = null;
  profile.sessionXp = 0;
  profile.sessionActions = { ...DEFAULT_PROFILE().sessionActions };
}

// Day key in LOCAL time (YYYY-MM-DD). Streaks roll over at the user's local
// midnight, consistent with the time-of-day achievement checks (getHours/getDay),
// rather than at UTC midnight.
function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function updateStreak(profile, now = new Date()) {
  const today = localDateKey(now);
  if (!profile.lastStreakDate) {
    profile.lastStreakDate = today;
    profile.streakDays = 1;
    return;
  }
  if (profile.lastStreakDate === today) {
    return;
  }
  const lastDate = new Date(profile.lastStreakDate);
  const diffDays = Math.floor(
    (new Date(today).getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (diffDays === 1) {
    profile.streakDays += 1;
  } else {
    profile.streakDays = 1;
  }
  profile.lastStreakDate = today;
}

function updateQuestStreak(profile, now = new Date()) {
  if (!profile.questMode) {
    return { updated: false, current: profile.streaks.questCurrent };
  }
  const today = localDateKey(now);
  if (!profile.lastQuestDay) {
    profile.lastQuestDay = today;
    profile.streaks.questCurrent = 1;
  } else if (profile.lastQuestDay !== today) {
    const lastDate = new Date(profile.lastQuestDay);
    const diffDays = Math.floor(
      (new Date(today).getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (diffDays === 1) {
      profile.streaks.questCurrent += 1;
    } else {
      profile.streaks.questCurrent = 1;
    }
    profile.lastQuestDay = today;
  } else {
    return { updated: false, current: profile.streaks.questCurrent };
  }
  if (profile.streaks.questCurrent > profile.streaks.questLongest) {
    profile.streaks.questLongest = profile.streaks.questCurrent;
  }
  return { updated: true, current: profile.streaks.questCurrent };
}

function updateTestStreak(profile, action) {
  if (!profile.questMode) {
    if (profile.streaks.testCurrent !== 0) {
      profile.streaks.testCurrent = 0;
    }
    return { updated: false, current: profile.streaks.testCurrent };
  }
  if (action !== 'test') {
    // A successful non-test action breaks the run of consecutive tests.
    if (profile.streaks.testCurrent !== 0) {
      profile.streaks.testCurrent = 0;
    }
    return { updated: false, current: profile.streaks.testCurrent };
  }
  profile.streaks.testCurrent += 1;
  return { updated: true, current: profile.streaks.testCurrent };
}

function resetTestStreak(profile) {
  if (profile.streaks.testCurrent !== 0) {
    profile.streaks.testCurrent = 0;
    return true;
  }
  return false;
}

function getDurationBonus(durationMs) {
  const minutes = durationMs / 60000;
  if (minutes >= 15) {
    return 100;
  }
  if (minutes >= 5) {
    return 50;
  }
  if (minutes >= 2) {
    return 25;
  }
  return 0;
}

function getSessionSummary(profile) {
  if (!profile.sessionStart) {
    return null;
  }
  return {
    start: profile.sessionStart,
    end: profile.lastActivity || new Date().toISOString(),
    sessionXp: profile.sessionXp,
    sessionActions: profile.sessionActions
  };
}

// Recompute level, refresh class from repo history, and evaluate achievements
// against the final totalXp. Shared by awardXP and awardDurationBonus so the two
// award paths stay in lockstep. Mutates profile; returns the new unlocks.
async function finalizeAward(profile, { now, action, durationBonus, context }) {
  const levelInfo = getLevelFromTotalXp(profile.totalXp);
  profile.level = levelInfo.level;
  profile.xp = levelInfo.xp;

  try {
    profile.class = await detectClass(profile, context.repoPath || process.cwd());
  } catch {
    profile.class = profile.class || 'Adventurer';
  }

  const newlyUnlocked = evaluateAchievements(profile, {
    ...context,
    now,
    action,
    durationBonus,
    questStreakCurrent: profile.streaks.questCurrent
  });
  profile.achievements = [...profile.achievements, ...newlyUnlocked];
  return newlyUnlocked;
}

async function awardXP(action, context = {}) {
  const xpValue = XP_VALUES[action];
  if (!xpValue) {
    return { awarded: false, reason: 'no-xp' };
  }

  const now = context.now || new Date();
  const profile = await getProfile();
  const sessionStarted = startSessionIfNeeded(profile, now);
  const previousLevel = profile.level;
  const durationMs = context.durationMs || 0;
  const durationBonus =
    profile.questMode && durationMs > 0 ? getDurationBonus(durationMs) : 0;

  profile.totalXp += xpValue;
  profile.sessionXp += xpValue;
  profile.updatedAt = now.toISOString();
  profile.lastActivity = profile.updatedAt;

  const statKey = STAT_KEYS[action];
  if (statKey) {
    profile.stats[statKey] += 1;
    profile.sessionActions[statKey] += 1;
  }

  updateStreak(profile, now);
  const questStreak = updateQuestStreak(profile, now);
  const testStreak = updateTestStreak(profile, action);

  if (durationBonus > 0) {
    profile.totalXp += durationBonus;
    profile.sessionXp += durationBonus;
  }

  // Achievements see the real totalXp (including any endurance bonus just
  // awarded) so XP-threshold unlocks match the saved/displayed total.
  const newlyUnlocked = await finalizeAward(profile, { now, action, durationBonus, context });

  await saveProfile(profile);

  return {
    awarded: true,
    xp: xpValue,
    durationBonus,
    level: profile.level,
    previousLevel,
    xpToNext: getXpForLevel(profile.level),
    currentXp: profile.xp,
    sessionStarted,
    achievements: newlyUnlocked,
    questStreak,
    testStreak
  };
}

async function awardDurationBonus(durationMs, context = {}) {
  const now = context.now || new Date();
  const profile = await getProfile();
  if (!profile.questMode) {
    return { awarded: false, reason: 'quest-off' };
  }
  const durationBonus = getDurationBonus(durationMs);
  if (durationBonus === 0) {
    return { awarded: false, reason: 'no-bonus' };
  }
  const sessionStarted = startSessionIfNeeded(profile, now);
  const previousLevel = profile.level;

  profile.totalXp += durationBonus;
  profile.sessionXp += durationBonus;
  profile.updatedAt = now.toISOString();
  profile.lastActivity = profile.updatedAt;

  updateStreak(profile, now);
  const questStreak = updateQuestStreak(profile, now);
  // A standalone (non-test) command breaks the consecutive-test streak.
  const testStreak = updateTestStreak(profile, null);

  // Mirror awardXP: a standalone endurance bonus must be able to unlock
  // achievements (notably Marathon Runner and XP thresholds it pushes past).
  const newlyUnlocked = await finalizeAward(profile, { now, action: null, durationBonus, context });

  await saveProfile(profile);

  return {
    awarded: true,
    durationBonus,
    level: profile.level,
    previousLevel,
    sessionStarted,
    achievements: newlyUnlocked,
    questStreak,
    testStreak
  };
}

export {
  getProfile,
  saveProfile,
  awardXP,
  awardDurationBonus,
  getXpForLevel,
  getLevelFromTotalXp,
  getDurationBonus,
  updateStreak,
  updateQuestStreak,
  updateTestStreak,
  startSessionIfNeeded,
  endSession,
  getSessionSummary,
  isSessionExpired,
  resetTestStreak
};
