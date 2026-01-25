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
  lastStreakDate: null
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

  const levelInfo = getLevelFromTotalXp(profile.totalXp);
  profile.level = levelInfo.level;
  profile.xp = levelInfo.xp;

  try {
    profile.class = await detectClass(profile, context.repoPath || process.cwd());
  } catch (error) {
    profile.class = profile.class || 'Adventurer';
  }

  const newlyUnlocked = evaluateAchievements(profile, {
    ...context,
    now,
    action
  });
  profile.achievements = [...profile.achievements, ...newlyUnlocked];

  await saveProfile(profile);

  return {
    awarded: true,
    xp: xpValue,
    level: profile.level,
    previousLevel,
    xpToNext: getXpForLevel(profile.level),
    currentXp: profile.xp,
    sessionStarted,
    achievements: newlyUnlocked
  };
}

export {
  getProfile,
  saveProfile,
  awardXP,
  getXpForLevel,
  startSessionIfNeeded,
  endSession,
  getSessionSummary,
  isSessionExpired
};
