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

## Quest Mode (opt-in)

Quest Mode is an optional, opt-in session mode that enables XP rewards, endurance bonuses, and streak tracking.

Turn it on and off:

```bash
devquest quest on
devquest quest off
```

Check status:

```bash
devquest quest status
```

## XP Rules (high level)

- XP is awarded only when wrapped commands succeed (exit code 0).
- No XP is awarded on failures.
- In Quest Mode, long-running successful commands earn a duration bonus:
  - 2+ minutes: +25 XP
  - 5+ minutes: +50 XP
  - 15+ minutes: +100 XP

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

- Commands run unmodified.
- Exit codes are preserved.
- Interactive commands work normally.

## Local-first

DevQuest is free and local-first. Your progress is stored on your machine, and there is no required account or external service.
