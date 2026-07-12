# DevQuest

DevQuest is a gamified terminal wrapper for real development work. It adds light RPG flavor and rewards for successful commands, with an ADHD-friendly focus on momentum: minimal friction, no extra prompts, and no noisy output unless you opt in. It runs commands exactly as you would run them, and only adds XP and progress tracking when it is safe to do so.

## Installation

```bash
npm install -g devquest
```

Or, for local development:

```bash
npm link
```

## Commands

DevQuest works by wrapping the commands you already run. Anything that is not a
built-in subcommand is executed unchanged, and XP is awarded on success.

Built-in subcommands:

```bash
devquest status          # Show your class, level, and XP bar
devquest summary         # End the current session and show its summary
devquest reset-session   # Clear the current session counters
devquest help            # Show usage
```

Wrap any command to earn XP when it succeeds:

```bash
devquest git commit -m "fix login bug"
devquest npm test
```

## Quest Mode (opt-in)

Base XP, levels, classes, and most achievements are always tracked. Quest Mode is
an optional, opt-in session mode that adds endurance (duration) bonuses and streak
tracking on top.

Turn it on and off, and check status:

```bash
devquest quest on
devquest quest off
devquest quest status
```

## XP Rules (high level)

- XP is awarded only when wrapped commands succeed (exit code 0).
- No XP is awarded on failures.
- Action XP: commit +50, push +75, test +100, merge +150, deploy +500.
- In Quest Mode, long-running successful commands earn a duration bonus:
  - 2+ minutes: +25 XP
  - 5+ minutes: +50 XP
  - 15+ minutes: +100 XP

## Levels, Classes, and Achievements

- **Levels**: Total XP maps to a level on a rising curve (each level costs more
  than the last).
- **Classes**: Your class is inferred from how you work. The dominant signal across
  your commits and tracked actions (bug fixes, refactors, frontend, backend,
  database, tests, deploys) picks a class such as Debug Dragon, Frontend Mage, or
  Test Cleric; a balanced spread makes you a Full Stack Druid.
- **Achievements**: One-off unlocks for milestones (first XP, XP thresholds, time
  of day, streaks, long sessions, bug-fix commits, and more).

## Streaks

- **Quest streak (daily)**: Counts a day when Quest Mode is ON and you earn XP from at least one successful action. It increments once per calendar day and resets if you miss a day.
- **Test streak (per quest)**: Counts consecutive successful test actions within a single Quest Mode session. It resets on test failure or when Quest Mode is turned off.

## Usage Examples

```bash
devquest quest on
devquest npm test
devquest quest status
devquest quest off
```

## Safety Guarantees

- Commands run unmodified, with arguments passed through exactly as written (including quoting on Windows).
- Exit codes are preserved. If the command itself cannot be found, devquest exits 127 (the shell convention) with a clear message.
- The wrapped command's stdout is untouched: all XP messages, banners, and popups go to stderr, so pipes and redirection behave exactly as they would without devquest.
- Interactive commands work normally.

DevQuest requires Node.js 20 or newer.

## Local-first

DevQuest is free and local-first. Your progress is stored on your machine, and there is no required account or external service.
