const ACHIEVEMENTS = [
  {
    id: 'First Blood',
    check: (profile) => profile.totalXp > 0
  },
  {
    id: 'Century',
    check: (profile) => profile.totalXp >= 100
  },
  {
    id: 'Test Believer',
    check: (profile) => profile.stats.tests >= 1
  },
  {
    id: 'Deployer',
    check: (profile) => profile.stats.deploys >= 1
  },
  {
    id: 'Night Owl',
    check: (_profile, context) => {
      const hour = context.now.getHours();
      return hour >= 0 && hour < 5;
    }
  },
  {
    id: 'Early Bird',
    check: (_profile, context) => {
      const hour = context.now.getHours();
      return hour >= 5 && hour < 9;
    }
  },
  {
    id: 'Weekend Warrior',
    check: (_profile, context) => {
      const day = context.now.getDay();
      return day === 0 || day === 6;
    }
  },
  {
    id: 'Streak 7',
    check: (profile) => profile.streakDays >= 7
  },
  {
    id: 'Marathon Runner',
    check: (_profile, context) => (context.durationBonus || 0) >= 100
  },
  {
    id: 'Steady Builder',
    check: (profile) => (profile.streaks?.questCurrent || 0) >= 7
  },
  {
    id: 'Bug Hunter',
    check: (_profile, context) => {
      if (context.action !== 'commit') {
        return false;
      }
      const message = context.commitMessage || '';
      return /(fix|bug|issue|hotfix)/i.test(message);
    }
  },
  {
    id: 'Insane in the Membrane',
    check: (profile) => profile.totalXp >= 10000
  }
];

function evaluateAchievements(profile, context) {
  const unlocked = new Set((profile.achievements || []).map((achievement) => achievement.id));
  const newUnlocks = [];
  ACHIEVEMENTS.forEach((achievement) => {
    if (unlocked.has(achievement.id)) {
      return;
    }
    if (achievement.check(profile, context)) {
      newUnlocks.push({ id: achievement.id, unlockedAt: context.now.toISOString() });
    }
  });
  return newUnlocks;
}

export { evaluateAchievements, ACHIEVEMENTS };
