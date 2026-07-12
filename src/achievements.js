const ACHIEVEMENTS = [
  {
    id: 'First Blood',
    description: 'Earn your first XP',
    check: (profile) => profile.totalXp > 0
  },
  {
    id: 'Century',
    description: 'Reach 100 total XP',
    check: (profile) => profile.totalXp >= 100
  },
  {
    id: 'Adventurer of Renown',
    description: 'Reach 1,000 total XP',
    check: (profile) => profile.totalXp >= 1000
  },
  {
    id: 'Hero of the Realm',
    description: 'Reach 5,000 total XP',
    check: (profile) => profile.totalXp >= 5000
  },
  {
    id: 'Insane in the Membrane',
    description: 'Reach 10,000 total XP',
    check: (profile) => profile.totalXp >= 10000
  },
  {
    id: 'Seasoned',
    description: 'Reach level 5',
    check: (profile) => profile.level >= 5
  },
  {
    id: 'Veteran',
    description: 'Reach level 10',
    check: (profile) => profile.level >= 10
  },
  {
    id: 'Legend',
    description: 'Reach level 20',
    check: (profile) => profile.level >= 20
  },
  {
    id: 'Test Believer',
    description: 'Run your first successful test',
    check: (profile) => profile.stats.tests >= 1
  },
  {
    id: 'Trial by Fire',
    description: 'Run 100 successful tests',
    check: (profile) => profile.stats.tests >= 100
  },
  {
    id: 'Deployer',
    description: 'Complete your first deploy',
    check: (profile) => profile.stats.deploys >= 1
  },
  {
    id: 'Siege Master',
    description: 'Complete 10 deploys',
    check: (profile) => profile.stats.deploys >= 10
  },
  {
    id: 'Chronicler',
    description: 'Make 50 commits',
    check: (profile) => profile.stats.commits >= 50
  },
  {
    id: 'Lorekeeper',
    description: 'Make 100 commits',
    check: (profile) => profile.stats.commits >= 100
  },
  {
    id: 'Night Owl',
    description: 'Earn XP between midnight and 5am',
    check: (_profile, context) => {
      const hour = context.now.getHours();
      return hour >= 0 && hour < 5;
    }
  },
  {
    id: 'Early Bird',
    description: 'Earn XP between 5am and 9am',
    check: (_profile, context) => {
      const hour = context.now.getHours();
      return hour >= 5 && hour < 9;
    }
  },
  {
    id: 'Weekend Warrior',
    description: 'Earn XP on a weekend',
    check: (_profile, context) => {
      const day = context.now.getDay();
      return day === 0 || day === 6;
    }
  },
  {
    id: 'Streak 7',
    description: 'Earn XP 7 days in a row',
    check: (profile) => profile.streakDays >= 7
  },
  {
    id: 'Unbroken',
    description: 'Earn XP 30 days in a row',
    check: (profile) => profile.streakDays >= 30
  },
  {
    id: 'Marathon Runner',
    description: 'Finish a command that ran 15 minutes or longer in Quest Mode',
    check: (_profile, context) => (context.durationBonus || 0) >= 100
  },
  {
    id: 'Steady Builder',
    description: 'Keep a 7-day Quest Mode streak',
    check: (profile) => (profile.streaks?.questCurrent || 0) >= 7
  },
  {
    id: 'Bug Hunter',
    description: 'Commit a bug fix (fix, bug, issue, or hotfix in the message)',
    check: (_profile, context) => {
      if (context.action !== 'commit') {
        return false;
      }
      const message = context.commitMessage || '';
      return /(fix|bug|issue|hotfix)/i.test(message);
    }
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

export { ACHIEVEMENTS, evaluateAchievements };
