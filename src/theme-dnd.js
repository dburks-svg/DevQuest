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

function helpText() {
  return [
    chalk.cyan.bold('DevQuest Commands'),
    chalk.white('devquest status') + chalk.gray('  Show character, level, XP bar'),
    chalk.white('devquest summary') + chalk.gray(' End session and show summary'),
    chalk.white('devquest reset-session') + chalk.gray(' Clear session counters'),
    chalk.white('devquest help') + chalk.gray('  Show usage'),
    '',
    chalk.gray('Wrap any command to earn XP on success, e.g. devquest git commit -m "fix"')
  ].join('\n');
}

export {
  renderProgressBar,
  sessionStartBanner,
  questModeOnBanner,
  questModeOffMessage,
  xpGainMessage,
  levelUpMessage,
  failureMessage,
  achievementPopup,
  sessionSummary,
  statusCard,
  helpText
};
