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
  } catch {
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

// A category at or above this share claims its class; below it you are a
// generalist (Full Stack Druid). One cutoff means no "dead zone" where a clear
// leader is ignored and the stale previous class is kept.
const CLASS_THRESHOLD = 0.4;

// Pure scoring: given parsed commits and the profile's action stats, pick a class.
// Every signal is normalized against the SAME denominator (total tracked actions,
// falling back to commit count) so the ratios are directly comparable. Counts are
// clamped so a signal can never exceed its denominator.
function classifyCommits(commits, profile) {
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

  const stats = profile.stats || {};
  const totalActions =
    (stats.commits || 0) +
    (stats.tests || 0) +
    (stats.deploys || 0) +
    (stats.pushes || 0) +
    (stats.merges || 0);
  const denom = totalActions > 0 ? totalActions : commits.length;
  const share = (count) => ratio(Math.min(count, denom), denom);

  // Ordered by priority so ties resolve the same way the original chain did.
  const categories = [
    { name: 'Debug Dragon', value: share(bugCommits) },
    { name: 'Test Cleric', value: share(stats.tests || 0) },
    { name: 'Frontend Mage', value: share(uiCommits) },
    { name: 'Backend Warrior', value: share(backendCommits) },
    { name: 'DevOps Warlock', value: share(stats.deploys || 0) },
    { name: 'Database Paladin', value: share(dbCommits) },
    { name: 'Refactor Monk', value: share(refactorCommits) }
  ];

  const leader = categories.reduce(
    (best, category) => (category.value > best.value ? category : best),
    categories[0]
  );

  // Clear specialist wins; otherwise a generalist. The former 0.35-0.40 band
  // that returned a stale class no longer exists.
  if (leader.value >= CLASS_THRESHOLD) {
    return leader.name;
  }
  return 'Full Stack Druid';
}

async function detectClass(profile, repoPath) {
  const commits = parseGitLog(repoPath);
  return classifyCommits(commits, profile);
}

export { detectClass, classifyCommits };
