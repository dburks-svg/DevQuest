import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { getProfile, saveProfile, SCHEMA_VERSION } from '../src/xp.js';

describe('profile schema versioning', () => {
  let home;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'devquest-schema-'));
    process.env.DEVQUEST_HOME = home;
  });

  afterEach(async () => {
    delete process.env.DEVQUEST_HOME;
    await fs.rm(home, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('stamps fresh profiles with the current schema version', async () => {
    const profile = await getProfile();
    expect(profile.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('migrates a pre-versioning profile (no schemaVersion) on load and save', async () => {
    const legacy = { totalXp: 500, stats: { commits: 3 } };
    await fs.writeFile(path.join(home, 'profile.json'), JSON.stringify(legacy), 'utf8');

    const profile = await getProfile();
    expect(profile.schemaVersion).toBe(SCHEMA_VERSION);
    expect(profile.totalXp).toBe(500);
    expect(profile.stats.commits).toBe(3);

    await saveProfile(profile);
    const onDisk = JSON.parse(await fs.readFile(path.join(home, 'profile.json'), 'utf8'));
    expect(onDisk.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('warns on a profile from a newer schema and preserves its version and unknown fields', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const future = {
      schemaVersion: SCHEMA_VERSION + 1,
      totalXp: 42,
      someFutureField: 'keep me'
    };
    await fs.writeFile(path.join(home, 'profile.json'), JSON.stringify(future), 'utf8');

    const profile = await getProfile();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('newer'));
    expect(profile.schemaVersion).toBe(SCHEMA_VERSION + 1);
    expect(profile.someFutureField).toBe('keep me');
    expect(profile.totalXp).toBe(42);
  });
});
