import chalk from 'chalk';

function renderProgressBar(current, max, width = 20) {
  const ratio = max === 0 ? 0 : Math.min(current / max, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const bar = `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
  return chalk.green(bar);
}

function sessionStartBanner() {
  return chalk.cyan.bold('⚔️  A new quest begins.');
}

function questModeOnBanner() {
  return chalk.cyan.bold('🗺️  Quest Mode engaged.');
}

function questModeOffMessage() {
  return chalk.gray('🛌 Quest Mode disengaged.');
}

function xpGainMessage(action, xp) {
  return chalk.yellow(`+${xp} XP`) + chalk.gray(` (${action} completed)`);
}

function levelUpMessage(level) {
  return chalk.magenta.bold(`✨ Level Up! You are now level ${level}.`);
}

function failureMessage(action) {
  const title = action ? `The ${action} falters...` : 'The quest falters...';
  return chalk.red(title) + chalk.gray(' No XP awarded.');
}

function achievementPopup(achievement) {
  return (
    chalk.green.bold('🏆 Achievement Unlocked: ') +
    chalk.white(achievement.id)
  );
}

function sessionSummary(summary) {
  const duration = summary ? `${summary.start} → ${summary.end}` : 'No active session.';
  return [
    chalk.cyan.bold('📜 Session Summary'),
    chalk.gray(duration),
    chalk.yellow(`Session XP: ${summary ? summary.sessionXp : 0}`),
    summary
      ? chalk.white(
          `Commits: ${summary.sessionActions.commits} · Tests: ${summary.sessionActions.tests} · Deploys: ${summary.sessionActions.deploys} · Pushes: ${summary.sessionActions.pushes} · Merges: ${summary.sessionActions.merges}`
        )
      : ''
  ]
    .filter(Boolean)
    .join('\n');
}

function statusCard(profile, xpToNext) {
  const bar = renderProgressBar(profile.xp, xpToNext);
  return [
    chalk.cyan.bold('🧙 DevQuest Status'),
    chalk.white(`Class: ${profile.class}`),
    chalk.white(`Level: ${profile.level}`),
    chalk.white(`XP: ${profile.xp}/${xpToNext}`),
    bar
  ].join('\n');
}

function achievementsList(profile, definitions) {
  const unlockedById = new Map(
    (profile.achievements || []).map((a) => [a.id, a.unlockedAt])
  );
  const lines = [
    chalk.cyan.bold(
      `🏆 Achievements (${unlockedById.size}/${definitions.length} unlocked)`
    )
  ];
  const pad = Math.max(...definitions.map((d) => d.id.length)) + 2;
  definitions.forEach((definition) => {
    const unlockedAt = unlockedById.get(definition.id);
    const mark = unlockedAt ? chalk.green('✓') : chalk.gray('✗');
    const name = unlockedAt
      ? chalk.white(definition.id.padEnd(pad))
      : chalk.gray(definition.id.padEnd(pad));
    const when = unlockedAt ? chalk.gray(` (${unlockedAt.slice(0, 10)})`) : '';
    lines.push(`${mark} ${name}${chalk.gray(definition.description)}${when}`);
  });
  return lines.join('\n');
}

function statsCard(profile) {
  const { stats, streaks } = profile;
  const builtIn = new Set(['commits', 'tests', 'deploys', 'pushes', 'merges']);
  const customLines = Object.entries(stats)
    .filter(([key, count]) => !builtIn.has(key) && count > 0)
    .map(([key, count]) => chalk.white(`  ${key}: ${count}`));
  return [
    chalk.cyan.bold('📊 DevQuest Stats'),
    chalk.white(`Class: ${profile.class} · Level: ${profile.level} · Total XP: ${profile.totalXp}`),
    chalk.white(
      `Commits: ${stats.commits} · Tests: ${stats.tests} · Pushes: ${stats.pushes} · Merges: ${stats.merges} · Deploys: ${stats.deploys}`
    ),
    ...(customLines.length > 0 ? [chalk.gray('Custom actions:'), ...customLines] : []),
    chalk.white(`Daily streak: ${profile.streakDays} day(s)`),
    chalk.white(
      `Quest streak: ${streaks.questCurrent} day(s) (longest ${streaks.questLongest})`
    ),
    chalk.white(`Test streak: ${streaks.testCurrent}`),
    chalk.white(`Achievements: ${(profile.achievements || []).length}`)
  ].join('\n');
}

function helpText() {
  return [
    chalk.cyan.bold('DevQuest Commands'),
    chalk.white('devquest status') + chalk.gray('  Show character, level, XP bar'),
    chalk.white('devquest stats') + chalk.gray('  Show lifetime stats and streaks'),
    chalk.white('devquest achievements') + chalk.gray(' List achievements and unlock state'),
    chalk.white('devquest summary') + chalk.gray(' End session and show summary'),
    chalk.white('devquest reset-session') + chalk.gray(' Clear session counters'),
    chalk.white('devquest help') + chalk.gray('  Show usage'),
    '',
    chalk.white('devquest quest on') + chalk.gray('  Enable Quest Mode, start session'),
    chalk.white('devquest quest off') + chalk.gray(' Disable Quest Mode, show summary'),
    chalk.white('devquest quest status') + chalk.gray(' Show quest mode status'),
    '',
    chalk.gray('Wrap any command to earn XP on success, e.g. devquest git commit -m "fix"'),
    chalk.gray('dq is a shorter alias: dq npm test'),
    chalk.gray('Custom actions and XP: ~/.devquest/config.json · Quiet mode: DEVQUEST_QUIET=1')
  ].join('\n');
}

export {
  sessionStartBanner,
  questModeOnBanner,
  questModeOffMessage,
  xpGainMessage,
  levelUpMessage,
  failureMessage,
  achievementPopup,
  achievementsList,
  sessionSummary,
  statusCard,
  statsCard,
  helpText
};
