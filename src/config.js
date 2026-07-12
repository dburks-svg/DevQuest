import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { DEFAULT_ACTIONS } from './actions.js';

// Config lives next to the profile so DEVQUEST_HOME redirects both together.
function configPath() {
  const dir = process.env.DEVQUEST_HOME
    ? path.resolve(process.env.DEVQUEST_HOME)
    : path.join(os.homedir(), '.devquest');
  return path.join(dir, 'config.json');
}

function isValidPattern(pattern) {
  return (
    Array.isArray(pattern) &&
    pattern.length > 0 &&
    pattern.every((token) => typeof token === 'string' && token.length > 0)
  );
}

// Validates one config action entry against the default it may be extending.
// Partial entries are allowed: { xp } keeps the default patterns and
// { patterns } keeps the default XP. Returns null (with a warning) when the
// entry cannot produce a usable action.
function resolveActionEntry(name, entry, defaults) {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    console.error(`devquest: ignoring config action "${name}": entry must be an object`);
    return null;
  }
  const base = defaults[name];
  const xp = entry.xp ?? base?.xp;
  const patterns = entry.patterns ?? base?.patterns;
  if (typeof xp !== 'number' || !Number.isFinite(xp) || xp <= 0) {
    console.error(`devquest: ignoring config action "${name}": xp must be a positive number`);
    return null;
  }
  if (!Array.isArray(patterns) || patterns.length === 0 || !patterns.every(isValidPattern)) {
    console.error(
      `devquest: ignoring config action "${name}": patterns must be a non-empty array of string arrays`
    );
    return null;
  }
  return { xp, patterns };
}

// Loads config.json and resolves it against the defaults. Any failure falls
// back to defaults with a stderr note: configuration must never break the
// wrapped command.
async function loadConfig() {
  let parsed = {};
  try {
    parsed = JSON.parse(await fs.readFile(configPath(), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(
        `devquest: could not read config.json (${error.message}); using defaults`
      );
    }
    parsed = {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    console.error('devquest: config.json must contain a JSON object; using defaults');
    parsed = {};
  }

  const actions = { ...DEFAULT_ACTIONS };
  if (parsed.actions !== undefined) {
    if (typeof parsed.actions !== 'object' || parsed.actions === null || Array.isArray(parsed.actions)) {
      console.error('devquest: config "actions" must be an object; using default actions');
    } else {
      for (const [name, entry] of Object.entries(parsed.actions)) {
        const resolved = resolveActionEntry(name, entry, DEFAULT_ACTIONS);
        if (resolved) {
          actions[name] = resolved;
        }
      }
    }
  }

  return {
    actions,
    quiet: parsed.quiet === true
  };
}

// Quiet resolution: the DEVQUEST_QUIET env var wins over config.quiet, so a
// single run can force output on or off without editing the file.
function isQuiet(config) {
  const env = process.env.DEVQUEST_QUIET;
  if (env !== undefined) {
    return env !== '0' && env.toLowerCase() !== 'false';
  }
  return config.quiet === true;
}

export { loadConfig, isQuiet, configPath };
