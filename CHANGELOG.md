# Changelog

## 0.2.0 (2026-07-06)

First release since the full audit (see AUDIT.md for every finding, each backed by a regression test). If you are on 0.1.0, upgrade: it contains a data-loss bug.

### Fixed

- **High. Profile lock data loss under contention.** In 0.1.0, when `profile.lock` could not be acquired after retries, the lock was deleted and the run proceeded anyway, so two concurrent `devquest` runs could clobber each other's `profile.json` (lost XP and achievements, last writer wins). Now a live lock is never deleted (only demonstrably stale locks are evicted), lock exhaustion fails loudly, and award paths degrade gracefully with a stderr note while preserving the wrapped command's exit code.
- **Medium. Silent profile reset.** A corrupt `profile.json` was quietly backed up and replaced with a fresh default; users lost their progress with no notice. A clear stderr warning now names the backup path.
- **Medium. Class detection math.** Category ratios were computed over two different denominators but compared against one threshold, and a 0.35 to 0.40 dead zone could keep a stale class. Scoring is now normalized to a single denominator with one cutoff.
- **Medium. Standalone duration bonus** never evaluated achievements or streaks; it now goes through the same finalize path as regular awards.
- **Medium. Base XP accrued with Quest Mode off**, contradicting the README; XP now respects Quest Mode.
- Plus 10 low-severity fixes and dead-code removals (see AUDIT.md).

### Added

- Test suite (27 vitest tests, including persisted-profile integration tests isolated via `DEVQUEST_HOME`), ESLint config, and GitHub Actions CI on Node 18.x and 20.x. 0.1.0 shipped with none of these.

## 0.1.0 (2026-01-25)

Initial release: command wrapping with XP, levels, D&D classes, streaks, and achievements. Superseded; do not use (profile-lock data-loss bug fixed in 0.2.0).
