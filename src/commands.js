import {
  getProfile,
  saveProfile,
  getXpForLevel,
  startSessionIfNeeded,
  endSession,
  getSessionSummary,
  resetTestStreak
} from './xp.js';
import { detectClass } from './class.js';
import {
  sessionSummary as renderSessionSummary,
  statusCard,
  helpText,
  questModeOnBanner,
  questModeOffMessage
} from './theme-dnd.js';

async function showStatus() {
  const profile = await getProfile();
  try {
    profile.class = await detectClass(profile, process.cwd());
  } catch (error) {
    profile.class = profile.class || 'Adventurer';
  }
  profile.updatedAt = new Date().toISOString();
  await saveProfile(profile);
  const xpToNext = getXpForLevel(profile.level);
  console.log(statusCard(profile, xpToNext));
}

async function showSummary() {
  const profile = await getProfile();
  const summary = getSessionSummary(profile);
  console.log(renderSessionSummary(summary));
  if (summary) {
    endSession(profile);
    profile.updatedAt = new Date().toISOString();
    await saveProfile(profile);
  }
}

async function showHelp() {
  console.log(helpText());
}

async function resetSession() {
  const profile = await getProfile();
  endSession(profile);
  profile.updatedAt = new Date().toISOString();
  await saveProfile(profile);
  console.log('Session reset.');
}

function formatDuration(ms) {
  if (ms <= 0) {
    return '0m';
  }
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

async function questStatus() {
  const profile = await getProfile();
  const lines = [`Quest Mode: ${profile.questMode ? 'ON' : 'OFF'}`];
  lines.push(`Class: ${profile.class}`);
  lines.push(`Level: ${profile.level}`);
  lines.push(`Total XP: ${profile.totalXp}`);
  if (profile.sessionStart) {
    const ageMs = Date.now() - new Date(profile.sessionStart).getTime();
    lines.push(`Session: ${formatDuration(ageMs)} · XP ${profile.sessionXp}`);
  }
  console.log(lines.join('\n'));
}

async function questOn() {
  const profile = await getProfile();
  if (profile.questMode) {
    console.log('Quest Mode already engaged');
    return;
  }
  profile.questMode = true;
  startSessionIfNeeded(profile, new Date());
  profile.updatedAt = new Date().toISOString();
  await saveProfile(profile);
  console.log(questModeOnBanner());
}

async function questOff() {
  const profile = await getProfile();
  if (!profile.questMode) {
    console.log('Quest Mode already disengaged');
    return;
  }
  profile.questMode = false;
  resetTestStreak(profile);
  const summary = getSessionSummary(profile);
  if (summary) {
    console.log(renderSessionSummary(summary));
    endSession(profile);
  }
  profile.updatedAt = new Date().toISOString();
  await saveProfile(profile);
  console.log(questModeOffMessage());
}

async function handleQuestCommand(args) {
  const subcommand = args[0];
  if (!subcommand || subcommand === 'status') {
    await questStatus();
    return;
  }
  if (subcommand === 'on') {
    await questOn();
    return;
  }
  if (subcommand === 'off') {
    await questOff();
    return;
  }
  console.log(helpText());
  process.exitCode = 1;
}

export { showStatus, showSummary, showHelp, resetSession, handleQuestCommand };
