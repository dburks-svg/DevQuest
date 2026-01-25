import { execFileSync } from 'child_process';

const BUG_KEYWORDS = /(fix|bug|issue|hotfix|patch)/i;
const REFACTOR_KEYWORDS = /(refactor|cleanup|restructure|simplify)/i;

const UI_PATH_PATTERNS = [
  '/ui/',
  '/frontend/',
  '/client/',
  '/web/',
  '/app/'
];

const BACKEND_PATH_PATTERNS = [
  '/server/',
  '/backend/',
  '/api/',
  '/services/',
  '/service/'
];

const DB_PATH_PATTERNS = ['/db/', '/database/', '/schema/', '/migrations/'];

const UI_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.css', '.scss', '.html'];
const DB_EXTENSIONS = ['.sql', '.prisma'];

function pathMatchesPatterns(filePath, patterns) {
  return patterns.some((pattern) => filePath.includes(pattern));
}

function hasExtension(filePath, extensions) {
  return extensions.some((ext) => filePath.endsWith(ext));
}

function parseGitLog(repoPath) {
  try {
    const output = execFileSync('git', ['log', '--name-only', '--pretty=format:%s'], {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString();

    const lines = output.split('\n');
    const commits = [];
    let current = null;

    lines.forEach((line) => {
      if (line.trim() === '') {
        if (current) {
          commits.push(current);
          current = null;
        }
        return;
      }
      if (!current) {
        current = { subject: line.trim(), files: [] };
        return;
      }
      current.files.push(line.trim());
    });
    if (current) {
      commits.push(current);
    }

    return commits;
  } catch (error) {
    return null;
  }
}

function classifyCommit(commit) {
  const subject = commit.subject || '';
  const files = commit.files || [];

  const isBug = BUG_KEYWORDS.test(subject);
  const isRefactor = REFACTOR_KEYWORDS.test(subject);

  const hasUiFile = files.some((file) =>
    pathMatchesPatterns(file, UI_PATH_PATTERNS) || hasExtension(file, UI_EXTENSIONS)
  );

  const hasBackendFile = files.some((file) =>
    pathMatchesPatterns(file, BACKEND_PATH_PATTERNS)
  );

  const hasDbFile = files.some((file) =>
    pathMatchesPatterns(file, DB_PATH_PATTERNS) || hasExtension(file, DB_EXTENSIONS)
  );

  return {
    isBug,
    isRefactor,
    hasUiFile,
    hasBackendFile,
    hasDbFile
  };
}

function ratio(part, total) {
  return total === 0 ? 0 : part / total;
}

async function detectClass(profile, repoPath) {
  const commits = parseGitLog(repoPath);
  if (!commits || commits.length === 0) {
    return 'Adventurer';
  }

  let bugCommits = 0;
  let refactorCommits = 0;
  let uiCommits = 0;
  let backendCommits = 0;
  let dbCommits = 0;

  commits.forEach((commit) => {
    const classified = classifyCommit(commit);
    if (classified.isBug) bugCommits += 1;
    if (classified.isRefactor) refactorCommits += 1;
    if (classified.hasUiFile) uiCommits += 1;
    if (classified.hasBackendFile) backendCommits += 1;
    if (classified.hasDbFile) dbCommits += 1;
  });

  const totalCommits = commits.length;
  const totalActions =
    profile.stats.commits +
    profile.stats.tests +
    profile.stats.deploys +
    profile.stats.pushes +
    profile.stats.merges;

  const bugRatio = ratio(bugCommits, totalCommits);
  const refactorRatio = ratio(refactorCommits, totalCommits);
  const uiRatio = ratio(uiCommits, totalCommits);
  const backendRatio = ratio(backendCommits, totalCommits);
  const dbRatio = ratio(dbCommits, totalCommits);
  const testRatio = ratio(profile.stats.tests, totalActions);
  const deployRatio = ratio(profile.stats.deploys, totalActions);

  const categoryRatios = [
    bugRatio,
    refactorRatio,
    uiRatio,
    backendRatio,
    dbRatio,
    testRatio,
    deployRatio
  ];

  if (bugRatio >= 0.4) return 'Debug Dragon';
  if (testRatio >= 0.4) return 'Test Cleric';
  if (uiRatio >= 0.4) return 'Frontend Mage';
  if (backendRatio >= 0.4) return 'Backend Warrior';
  if (deployRatio >= 0.4) return 'DevOps Warlock';
  if (dbRatio >= 0.4) return 'Database Paladin';
  if (refactorRatio >= 0.4) return 'Refactor Monk';

  const maxRatio = Math.max(...categoryRatios);
  if (maxRatio <= 0.35) return 'Full Stack Druid';

  return profile.class || 'Adventurer';
}

function shouldEvolve(profile) {
  return profile.level >= 20;
}

function getEvolutionOptions(profile) {
  if (!shouldEvolve(profile)) {
    return [];
  }
  const baseClass = profile.class || 'Adventurer';
  return [
    `${baseClass} Ascendant`,
    `${baseClass} Mythic`,
    `${baseClass} Paragon`
  ];
}

export { detectClass, shouldEvolve, getEvolutionOptions };
