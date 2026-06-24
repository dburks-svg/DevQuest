# DevQuest Audit

A correctness, dead-code, and completeness audit of the DevQuest CLI (~1,120 LOC
across `bin/devquest.js` and `src/*.js`). Findings were discovered by a multi-agent
sweep, then each candidate was adversarially verified against the real code (several
plausible-sounding claims were refuted and are listed at the end). All confirmed
findings have been fixed or hardened in this same change set; a regression test
backs every behavioral fix.

## Summary

| Severity | Count |
| -------- | ----- |
| High     | 2     |
| Medium   | 6     |
| Low      | 10    |

Verification status: ESLint clean, 27 unit tests passing, CLI smoke test passing
(built-ins, XP wiring, and exit-code preservation on both success and failure).

## Bugs

### High: profile lock was not actually held after retries (data loss under contention)
- Location: `src/xp.js`, `acquireLock`.
- What/why: After 10 failed attempts to create `profile.lock`, the function deleted
  the still-live lock and returned as if it had acquired it. Two concurrent
  `devquest` runs could then both write `profile.json` and clobber each other's XP
  and achievements (last writer wins). The verifier reproduced a lost `+50` award.
- Fix: On exhaustion, throw instead of proceeding, and never unlink a lock that is
  not demonstrably stale. The award paths in `bin/devquest.js` now catch this and
  degrade gracefully (a note on stderr) while still preserving the wrapped command's
  exit code.

### Medium: corrupt profile was silently reset with no notice
- Location: `src/xp.js`, `readProfileFile`.
- What/why: A `profile.json` that failed to parse was renamed to `profile.json.bak.<ts>`
  and replaced with a fresh default, with no message. The user lost all XP, level,
  and achievements silently and was never told a backup existed.
- Fix: Emit a clear stderr warning naming the backup path when a corrupt profile is
  detected.

### Medium: class detection compared ratios on two different denominators
- Location: `src/class.js`, class scoring.
- What/why: Bug/refactor/ui/backend/db ratios were computed over the git-log commit
  count, while test/deploy ratios were computed over the profile's lifetime action
  total, yet all were compared against the same `0.40` threshold and pooled into one
  `Math.max`. The scales were not comparable, biasing classification.
- Fix: Extracted a pure `classifyCommits(commits, profile)` and normalized every
  signal against a single denominator (total tracked actions, falling back to commit
  count), clamping each count so a share cannot exceed 1.

### Medium: class detection had a 0.35 to 0.40 "dead zone" that kept a stale class
- Location: `src/class.js`, class scoring.
- What/why: When no category reached `0.40` but the leader exceeded `0.35`, the code
  returned the previous class instead of any current leader, so a clear leader could
  be ignored.
- Fix: Collapsed to one cutoff. A category at or above `0.40` claims its class;
  otherwise you are a Full Stack Druid. There is no band that returns a stale class.

### Medium: standalone duration bonus never evaluated achievements or streaks
- Location: `src/xp.js`, `awardDurationBonus`.
- What/why: When a non-action command succeeded in Quest Mode, the endurance bonus
  raised total XP and recomputed level but never called `evaluateAchievements` or
  updated streaks. Net effect: Marathon Runner (`durationBonus >= 100`) could never
  unlock on this path, and an XP-threshold achievement the bonus pushed past was
  missed.
- Fix: This path now updates streaks and evaluates achievements exactly like
  `awardXP`, and returns the unlocked achievements and streak info to the CLI for
  display. Regression test: `awardDurationBonus` unlocks Marathon Runner.

### Low: achievements were scored against total XP minus the just-awarded bonus
- Location: `src/xp.js`, `awardXP`.
- What/why: Achievements were evaluated against `totalXp - durationBonus`, so an
  XP-threshold unlock could lag the saved and displayed total by one action.
- Fix: Evaluate against the real `totalXp`. Regression test: starting at 9,850 XP, a
  test plus a duration bonus (10,050 total) unlocks "Insane in the Membrane".

### Low: the "test streak" counted cumulative tests, not consecutive ones
- Location: `src/xp.js`, `updateTestStreak`.
- What/why: An intervening successful non-test action (a commit, push, etc.) did not
  reset the streak, so it behaved as a lifetime per-session counter rather than a
  run of consecutive tests, contradicting the README.
- Fix: A successful non-test action now resets the test streak to zero. Regression
  test covers test, commit, test producing 1, 0, 1.

### Low: streak day rollover used UTC while time achievements used local time
- Location: `src/xp.js`, `updateStreak` and `updateQuestStreak`.
- What/why: Streaks keyed the day off `toISOString().slice(0, 10)` (UTC) while the
  Night Owl / Early Bird / Weekend achievements use local `getHours`/`getDay`. Day
  boundaries were inconsistent across the same feature set.
- Fix: Added a `localDateKey` helper so streaks roll over at the user's local
  midnight, consistent with the achievements.

### Low: Windows signal re-raise was unreliable
- Location: `bin/devquest.js`, `runWrappedCommand`.
- What/why: On a signal-terminated child it called `process.kill(process.pid, signal)`,
  which does not behave like a POSIX signal on Windows.
- Fix: Re-raise the signal only on non-Windows platforms; on Windows exit non-zero.

## Dead and unconnected code

### Medium: dead class-evolution feature
- Location: `src/class.js`, `shouldEvolve` and `getEvolutionOptions`.
- What/why: Both were exported but imported nowhere. There was no command or apply
  path, so the level-20 evolution idea was unreachable.
- Fix: Removed both. Re-introducing a real `evolve` command is noted as possible
  future work rather than leaving dead exports in place.

### Low: unused public exports
- Location: `src/achievements.js` (`ACHIEVEMENTS`) and `src/theme-dnd.js`
  (`renderProgressBar`).
- What/why: Exported but only used internally.
- Fix: Both are now module-private.

## Completeness

### Medium: base XP accrued with Quest Mode OFF, contradicting the README
- Location: README vs `src/xp.js` / `bin/devquest.js`.
- What/why: The README framed Quest Mode as the thing that "enables XP rewards", but
  base XP, levels, classes, and most achievements always accrued; only duration
  bonuses and streaks were Quest-gated.
- Fix: Updated the README to state the implemented model: base XP and progression are
  always tracked, and Quest Mode adds endurance bonuses and streaks. (The alternative
  of gating base XP behind Quest Mode was considered and rejected as a larger
  behavior change that also contradicts the README's own "XP on success" rule.)

### Low: commit-message extraction missed common forms, suppressing Bug Hunter
- Location: `bin/devquest.js`, `extractCommitMessage`.
- What/why: Only space-separated `-m`/`--message` were handled, so `-m"msg"`
  (arrives as `-mmsg`) and `--message=msg` yielded an empty message and Bug Hunter
  silently could not fire.
- Fix: Handle `-m <msg>`, `-m<msg>`, `--message <msg>`, and `--message=<msg>`.
  Editor-based commits (no message on the command line) remain a documented
  limitation.

### Low: README omitted commands and the progression surface
- Location: README.
- What/why: `status`, `summary`, and `reset-session` were undocumented, as were the
  class, achievement, and level systems.
- Fix: Added a Commands section and a Levels, Classes, and Achievements section.

### High: no tests, no lint, no CI
- Location: project tooling.
- What/why: `package.json` defined only a `start` script with no devDependencies, so
  regressions and unused-code issues shipped unchecked.
- Fix (hardening, see below): a Vitest suite, an ESLint flat config, `test`/`lint`
  scripts, and a GitHub Actions CI workflow.

## Cross-platform (accepted, documented)

### Low: `shell: true` concatenates child args unescaped on Windows
- Location: `bin/devquest.js`, `runWrappedCommand` (Node emits `DEP0190`).
- Disposition: Accepted. `shell: true` on Windows is what lets `npm`/`git` resolve
  their `.cmd` shims, and the arguments originate from the user's own shell
  invocation (not a privilege boundary), so this is a quoting nicety, not an
  injection vector. Documented here rather than risking npm/git resolution by
  removing the shell.

## Housekeeping

### Low: stray build artifact and thin .gitignore
- Fix: Removed the untracked `devquest-0.1.0.tgz`; `.gitignore` now ignores `*.tgz`,
  `coverage/`, logs, and common OS/editor files.

### Low: package metadata gaps
- Fix: Added a `files` allowlist (`bin`, `src`, `README.md`) and bumped
  `engines.node` to `>=18` to match the toolchain (ESLint 9 / Vitest 2 and the
  `chalk` 5 runtime).

## Hardening added

- Tests: `test/xp.test.js`, `test/achievements.test.js`, `test/class.test.js`
  (27 tests) covering the XP curve, level mapping, duration bonus, all three streak
  functions, achievement unlock conditions, class scoring, and the four behavioral
  regressions above.
- Testability: `src/xp.js` resolves the profile directory lazily and honors a
  `DEVQUEST_HOME` environment variable, so tests (and users) can isolate the profile
  from the real `~/.devquest`.
- Lint: `eslint.config.js` (flat config) with `no-unused-vars` as an error.
- Scripts and deps: `test`, `test:watch`, and `lint` scripts plus the matching
  devDependencies.
- CI: `.github/workflows/ci.yml` runs `npm ci`, `npm run lint`, and `npm test` on
  Node 18 and 20 for pushes and PRs to `main`.

## Investigated and dismissed (false positives)

These were raised during discovery but refuted by reading the code and confirmed by
tests:

- "Night Owl / Early Bird can never unlock." False. They use local `getHours()` and
  fire in their windows; a unit test confirms both unlock.
- "`isSessionExpired` is never called." False. It is invoked via
  `maybeHandleExpiredSession` at CLI entry.
- "Bug Hunter never receives the commit message." False. The message is passed from
  `bin/devquest.js` into `awardXP` and forwarded to the achievement context; a unit
  test confirms Bug Hunter unlocks for a bug-like commit message.
- "The XP curve has floating-point drift." False. `getXpForLevel` is
  `Math.floor(100 * level^1.5)`, which is deterministic; a unit test pins the values.
