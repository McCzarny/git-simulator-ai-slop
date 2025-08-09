# Git Simulator

A visual Git repository simulator built with Next.js that allows you to explore and manipulate Git history interactively.

## Features

- 🌳 **Visual Git Graph**: Interactive visualization of commits, branches, and merges
- 🔀 **Git Operations**: Create commits, branches, and perform merges
- 🎯 **Node Collision Detection**: Automatic detection and prevention of overlapping nodes
- 🧪 **Comprehensive Testing**: Unit tests and E2E tests with screenshot verification
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Getting Started

### Development
```bash
npm install
npm run dev
```
Open [http://localhost:9003](http://localhost:9003) in your browser.

### Testing
```bash
# Unit tests
npm run test

# End-to-end tests
npm run test:e2e

# Screenshot tests
npm run test:screenshot

# Visual test runner
npm run test:e2e:ui
```

See [TESTING.md](./TESTING.md) for detailed testing guide.

## Bug Fixes

### Node Collision Issue (Fixed ✅)
- **Problem**: Nodes could overlap after merge operations (e.g., merging "134" into "master")
- **Solution**: Enhanced positioning algorithm with collision detection and automatic resolution
- **Details**: See [BUG_FIX_REPORT.md](./BUG_FIX_REPORT.md)

## Architecture

- **Frontend**: Next.js 15 with TypeScript
- **UI**: Tailwind CSS + Radix UI components
- **Testing**: Vitest (unit) + Playwright (E2E)
- **Visualization**: SVG-based git graph with drag & drop

## Live Demo

GH pages link: https://mcczarny.github.io/git-simulator-ai-slop/
