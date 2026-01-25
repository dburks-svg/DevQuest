# DevQuest

A gamified terminal wrapper that rewards real development work with XP, levels, and achievements.

## Overview

DevQuest transforms your development workflow into an RPG experience. Track your progress, earn experience points, level up your developer class, and unlock achievements as you work on real projects.

## Features (Coming Soon)

- **XP System**: Earn experience points for commits, builds, tests, and other development activities
- **Classes & Levels**: Progress through developer classes with unique abilities and perks
- **Achievements**: Unlock achievements for milestones and accomplishments
- **D&D Theme**: Immersive D&D-inspired flavor text and styling

## Installation

```bash
npm install -g devquest
```

## Usage

```bash
devquest <command> [options]
```

## Development

This project is in early development. The core structure is in place, but commands and features are not yet implemented.

### Project Structure

```
DevQuest/
├── bin/
│   └── devquest.js      # CLI entry point
├── src/
│   ├── xp.js            # XP management
│   ├── class.js         # Class and leveling system
│   ├── achievements.js  # Achievement tracking
│   ├── theme-dnd.js     # D&D theming
│   └── commands.js      # Command handlers
└── package.json
```
