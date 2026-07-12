# Changelog

## 0.3.0 (2026-07-12)

Correctness and stability release (Tier 1 of the v1.0 roadmap).

### Fixed

- **High. Windows argument mangling.** The wrapper spawned with `shell: true` on Windows, which concatenates arguments without quoting. Any argument containing spaces was split apart: `devquest git commit -m "fix login bug"` committed with the message `fix` and then errored on `login` and `bug`, breaking the "commands run unmodified" guarantee. Commands are now spawned through cross-spawn, which resolves `.cmd`/`.bat` shims and quotes arguments correctly with no shell involved.
- **Gamification output moved to stderr.** XP messages, banners, achievement popups, and failure notices printed to stdout, polluting pipes (`devquest some-cmd | consumer` received "+50 XP" in the stream). All flavor output now goes to stderr; the wrapped command's stdout is untouched. Output of the built-in subcommands (`status`, `summary`, `help`, `quest status`) remains on stdout, since there it is the primary output.
- **Command not found is now reported.** A nonexistent wrapped command previously exited 1 with no explanation (POSIX) or a raw shell error (Windows). It now prints `devquest: command not found: <cmd>` to stderr and exits 127, the shell convention.

### Added

- **Profile schema versioning.** `profile.json` now carries `schemaVersion` (currently 1). Profiles written before versioning are migrated transparently on load. Profiles written by a newer devquest load best-effort with a warning, and their version marker and unknown fields are preserved.
- **CLI test coverage.** Action detection and commit message extraction moved to `src/actions.js` and gained unit tests, and a new end-to-end suite runs the real binary: argument passthrough (the Windows quoting regression), exit code preservation, stdout purity, exit 127 on unknown commands, a full `git commit` XP flow, and `.cmd` shim resolution.
- **CI matrix expanded** from ubuntu-only (Node 18/20) to ubuntu, windows, and macos on Node 20/22/24. The Windows quoting bug survived to 0.2.0 precisely because CI never ran on Windows.

### Changed

- **Node 20+ required** (`engines` bumped from >=18). Node 18 is end of life.
- Dev tooling: vitest upgraded from 2.x to 4.x, clearing all `npm audit` advisories.

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
