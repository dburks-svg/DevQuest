import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { evaluateAchievements } from './achievements.js';
import { detectClass } from './class.js';

const PROFILE_DIR = path.join(os.homedir(), '.devquest');
const PROFILE_PATH = path.join(PROFILE_DIR, 'profile.json');
const PROFILE_TMP_PATH = path.join(PROFILE_DIR, 'profile.json.tmp');
const PROFILE_LOCK_PATH = path.join(PROFILE_DIR, 'profile.lock');
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
  await fs.mkdir(PROFILE_DIR, { recursive: true });
}

async function acquireLock() {
  await ensureProfileDir();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const handle = await fs.open(PROFILE_LOCK_PATH, 'wx');
      await handle.close();
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
      try {
        const stats = await fs.stat(PROFILE_LOCK_PATH);
        const age = Date.now() - stats.mtimeMs;
        if (age > LOCK_STALE_MS) {
          await fs.unlink(PROFILE_LOCK_PATH);
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
  await fs.unlink(PROFILE_LOCK_PATH).catch(() => {});
}

async function releaseLock() {
  await fs.unlink(PROFILE_LOCK_PATH).catch(() => {});
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
  try {
    const data = await fs.readFile(PROFILE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    if (error instanceof SyntaxError) {
      await ensureProfileDir();
      const backupPath = path.join(
        PROFILE_DIR,
        `profile.json.bak.${Date.now()}`
      );
      await fs.rename(PROFILE_PATH, backupPath).catch(() => {});
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
    const payload = JSON.stringify(profile, null, 2);
    await fs.writeFile(PROFILE_TMP_PATH, payload, 'utf8');
    await fs.rename(PROFILE_TMP_PATH, PROFILE_PATH);
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

function updateStreak(profile, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
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
  const today = now.toISOString().slice(0, 10);
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

  const levelInfo = getLevelFromTotalXp(profile.totalXp);
  profile.level = levelInfo.level;
  profile.xp = levelInfo.xp;

  try {
    profile.class = await detectClass(profile, context.repoPath || process.cwd());
  } catch (error) {
    profile.class = profile.class || 'Adventurer';
  }

  const achievementProfile = {
    ...profile,
    totalXp: profile.totalXp - durationBonus
  };
  const newlyUnlocked = evaluateAchievements(achievementProfile, {
    ...context,
    now,
    action,
    durationBonus,
    questStreakCurrent: profile.streaks.questCurrent
  });
  profile.achievements = [...profile.achievements, ...newlyUnlocked];

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

  const levelInfo = getLevelFromTotalXp(profile.totalXp);
  profile.level = levelInfo.level;
  profile.xp = levelInfo.xp;

  try {
    profile.class = await detectClass(profile, context.repoPath || process.cwd());
  } catch (error) {
    profile.class = profile.class || 'Adventurer';
  }

  await saveProfile(profile);

  return {
    awarded: true,
    durationBonus,
    level: profile.level,
    previousLevel,
    sessionStarted
  };
}

export {
  getProfile,
  saveProfile,
  awardXP,
  awardDurationBonus,
  getXpForLevel,
  startSessionIfNeeded,
  endSession,
  getSessionSummary,
  isSessionExpired,
  resetTestStreak
};
