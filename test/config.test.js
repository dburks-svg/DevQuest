import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { loadConfig, isQuiet } from '../src/config.js';
import { DEFAULT_ACTIONS } from '../src/actions.js';

describe('loadConfig', () => {
  let home;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'devquest-config-'));
    process.env.DEVQUEST_HOME = home;
  });

  afterEach(async () => {
    delete process.env.DEVQUEST_HOME;
    delete process.env.DEVQUEST_QUIET;
    await fs.rm(home, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function writeConfig(value) {
    await fs.writeFile(
      path.join(home, 'config.json'),
      typeof value === 'string' ? value : JSON.stringify(value),
      'utf8'
    );
  }

  it('returns defaults when no config file exists', async () => {
    const config = await loadConfig();
    expect(config.actions).toEqual(DEFAULT_ACTIONS);
    expect(config.quiet).toBe(false);
  });

  it('adds custom actions on top of the defaults', async () => {
    await writeConfig({
      actions: { docs: { xp: 30, patterns: [['npm', 'run', 'docs']] } }
    });
    const config = await loadConfig();
    expect(config.actions.docs).toEqual({ xp: 30, patterns: [['npm', 'run', 'docs']] });
    expect(config.actions.commit).toEqual(DEFAULT_ACTIONS.commit);
  });

  it('supports partial overrides of built-in actions', async () => {
    await writeConfig({ actions: { commit: { xp: 10 } } });
    const config = await loadConfig();
    expect(config.actions.commit.xp).toBe(10);
    expect(config.actions.commit.patterns).toEqual(DEFAULT_ACTIONS.commit.patterns);
  });

  it('rejects invalid entries with a warning and keeps the rest', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    await writeConfig({
      actions: {
        bad: { xp: -5, patterns: [['x']] },
        worse: { xp: 10, patterns: [[]] },
        good: { xp: 10, patterns: [['make', 'build']] }
      }
    });
    const config = await loadConfig();
    expect(config.actions.bad).toBeUndefined();
    expect(config.actions.worse).toBeUndefined();
    expect(config.actions.good).toEqual({ xp: 10, patterns: [['make', 'build']] });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('falls back to defaults on unparseable JSON with a warning', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    await writeConfig('{not json');
    const config = await loadConfig();
    expect(config.actions).toEqual(DEFAULT_ACTIONS);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('config.json'));
  });

  it('reads the quiet flag', async () => {
    await writeConfig({ quiet: true });
    const config = await loadConfig();
    expect(config.quiet).toBe(true);
  });
});

describe('isQuiet', () => {
  afterEach(() => {
    delete process.env.DEVQUEST_QUIET;
  });

  it('follows config when the env var is unset', () => {
    expect(isQuiet({ quiet: true })).toBe(true);
    expect(isQuiet({ quiet: false })).toBe(false);
  });

  it('lets DEVQUEST_QUIET override config in both directions', () => {
    process.env.DEVQUEST_QUIET = '1';
    expect(isQuiet({ quiet: false })).toBe(true);
    process.env.DEVQUEST_QUIET = '0';
    expect(isQuiet({ quiet: true })).toBe(false);
    process.env.DEVQUEST_QUIET = 'false';
    expect(isQuiet({ quiet: true })).toBe(false);
  });
});
