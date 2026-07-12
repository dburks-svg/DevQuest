import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, execFileSync } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const BIN = fileURLToPath(new URL('../bin/devquest.js', import.meta.url));
const PRINT_ARGS = fileURLToPath(new URL('./fixtures/print-args.js', import.meta.url));

// Runs the real CLI in a child process with an isolated DEVQUEST_HOME and
// returns { code, stdout, stderr }.
function runCli(args, { cwd, home, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd,
      env: { ...process.env, DEVQUEST_HOME: home, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('devquest CLI (end to end)', () => {
  let home;
  let workdir;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'devquest-cli-home-'));
    workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'devquest-cli-work-'));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(workdir, { recursive: true, force: true });
  });

  it('passes arguments through unmodified, including spaces and quotes (Windows quoting regression)', async () => {
    const spaced = 'hello world';
    const quoted = 'with "inner quotes"';
    const { code, stdout } = await runCli(['node', PRINT_ARGS, spaced, quoted], {
      cwd: workdir,
      home
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout.trim())).toEqual([spaced, quoted]);
  }, 30000);

  it('preserves the wrapped command exit code', async () => {
    const { code } = await runCli(['node', '-e', 'process.exit(3)'], { cwd: workdir, home });
    expect(code).toBe(3);
  }, 30000);

  it('keeps the wrapped command stdout pristine (no gamification on stdout)', async () => {
    const { code, stdout } = await runCli(['node', '-e', 'console.log(42)'], {
      cwd: workdir,
      home
    });
    expect(code).toBe(0);
    expect(stdout.trim()).toBe('42');
    expect(stdout).not.toContain('XP');
  }, 30000);

  it('exits 127 with a clear message when the command does not exist', async () => {
    const { code, stderr, stdout } = await runCli(['definitely-not-a-real-command-xyz'], {
      cwd: workdir,
      home
    });
    expect(code).toBe(127);
    expect(stderr).toContain('command not found');
    expect(stdout).toBe('');
  }, 30000);

  it('awards commit XP to stderr and preserves a spaced commit message end to end', async () => {
    const gitEnv = {
      GIT_AUTHOR_NAME: 'DevQuest Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'DevQuest Test',
      GIT_COMMITTER_EMAIL: 'test@example.com'
    };
    execFileSync('git', ['init', '-q'], { cwd: workdir });
    await fs.writeFile(path.join(workdir, 'file.txt'), 'content\n', 'utf8');
    execFileSync('git', ['add', '.'], { cwd: workdir });

    const message = 'fix: handle "spaced args" on windows';
    const { code, stderr } = await runCli(['git', 'commit', '-m', message], {
      cwd: workdir,
      home,
      env: gitEnv
    });
    expect(code).toBe(0);
    expect(stderr).toContain('+50 XP');

    const subject = execFileSync('git', ['log', '-1', '--pretty=%s'], { cwd: workdir })
      .toString()
      .trim();
    expect(subject).toBe(message);

    const profile = JSON.parse(
      await fs.readFile(path.join(home, 'profile.json'), 'utf8')
    );
    expect(profile.totalXp).toBeGreaterThanOrEqual(50);
    expect(profile.stats.commits).toBe(1);
    // Bug Hunter unlocks because the commit message contains "fix".
    expect(profile.achievements.map((a) => a.id)).toContain('Bug Hunter');
  }, 30000);

  it('resolves .cmd shims on Windows (npm --version works without a shell)', async () => {
    const { code, stdout } = await runCli(['npm', '--version'], { cwd: workdir, home });
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  }, 30000);

  it('awards XP for a custom action defined in config.json', async () => {
    await fs.writeFile(
      path.join(home, 'config.json'),
      JSON.stringify({ actions: { ping: { xp: 42, patterns: [['node', '-e']] } } }),
      'utf8'
    );
    const { code, stderr } = await runCli(['node', '-e', '0'], { cwd: workdir, home });
    expect(code).toBe(0);
    expect(stderr).toContain('+42 XP');
    const profile = JSON.parse(await fs.readFile(path.join(home, 'profile.json'), 'utf8'));
    expect(profile.totalXp).toBe(42);
    expect(profile.stats.ping).toBe(1);
  }, 30000);

  it('suppresses gamification output in quiet mode but still tracks XP', async () => {
    await fs.writeFile(
      path.join(home, 'config.json'),
      JSON.stringify({ actions: { ping: { xp: 42, patterns: [['node', '-e']] } } }),
      'utf8'
    );
    const { code, stdout, stderr } = await runCli(['node', '-e', 'console.log(1)'], {
      cwd: workdir,
      home,
      env: { DEVQUEST_QUIET: '1' }
    });
    expect(code).toBe(0);
    expect(stdout.trim()).toBe('1');
    expect(stderr).toBe('');
    const profile = JSON.parse(await fs.readFile(path.join(home, 'profile.json'), 'utf8'));
    expect(profile.totalXp).toBe(42);
  }, 30000);

  it('lists achievements with unlock state', async () => {
    const { code, stdout } = await runCli(['achievements'], { cwd: workdir, home });
    expect(code).toBe(0);
    expect(stdout).toContain('Achievements (0/');
    expect(stdout).toContain('First Blood');
    expect(stdout).toContain('Earn your first XP');
  }, 30000);

  it('prints the package version for version, --version, and -v', async () => {
    const { version } = JSON.parse(
      await fs.readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')
    );
    for (const flag of ['version', '--version', '-v']) {
      const { code, stdout } = await runCli([flag], { cwd: workdir, home });
      expect(code).toBe(0);
      expect(stdout.trim()).toBe(version);
    }
  }, 30000);

  it('shows lifetime stats including the longest quest streak', async () => {
    const { code, stdout } = await runCli(['stats'], { cwd: workdir, home });
    expect(code).toBe(0);
    expect(stdout).toContain('DevQuest Stats');
    expect(stdout).toContain('longest 0');
    expect(stdout).toContain('Daily streak');
  }, 30000);
});
