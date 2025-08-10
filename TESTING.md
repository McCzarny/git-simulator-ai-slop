# Testing Guide for Git Simulator

This document explains how to test the collision detection system and verify that nodes don't overlap after git operations.

## Problem Description

Nodes in the git graph can overlap after certain operations (e.g., merging "master" with "134"). This project includes:

1. **Collision Detection**: Automatic detection of overlapping nodes with console warnings
2. **Unit Tests**: Test the collision detection logic
3. **E2E Tests**: Test real scenarios in the browser
4. **Screenshot Tests**: Visual verification of node positioning

## Setup

Install test dependencies:
```bash
npm install
```

## Running Tests

### Unit Tests (Vitest)
```bash
# Run all unit tests
npm run test

# Run with UI
npm run test:ui

# Run in watch mode
npm run test -- --watch
```

### End-to-End Tests (Playwright)
```bash
# Run all E2E tests
npm run test:e2e

# Run with UI for debugging
npm run test:e2e:ui

# Run in headed mode (visible browser)
npm run test:e2e:headed

# Run only screenshot tests
npm run test:screenshot
```

## Test Types

### 1. Collision Detection Unit Tests
File: `src/test/GitGraph.collision.test.tsx`

Tests the collision detection logic:
- Detects identical positions
- Detects near-collisions (within threshold)
- Ignores sufficiently spaced nodes
- Handles multiple collisions

### 2. Scenario Tests
File: `tests/scenario-tests.spec.ts`

Tests predefined scenarios that may cause collisions:
- Initial state (should be clean)
- Merge master with 134 (known problematic case)
- Multiple merge operations

### 3. Screenshot Tests
File: `tests/screenshot-git-explorer.spec.ts`

Creates visual snapshots for comparison:
- Before/after merge operations
- Initial state baseline
- Problematic scenarios

## Manual Testing

1. Start the application:
```bash
npm run dev
```

2. Open browser to http://localhost:9003

3. Open browser console to see collision warnings

4. Test the problematic scenario:
   - Select "master" branch
   - Merge with "134"
   - Check console for collision warnings

## Collision Detection System

The system automatically detects when nodes overlap and logs warnings:

```
COLLISION: Commits 'abc123' and 'def456' overlap at (100, 200) ≈ (101, 201)
```

### Configuration

Collision threshold can be adjusted in `GitGraph.tsx`:
```typescript
const COLLISION_THRESHOLD = 2; // pixels
```

## Screenshot Utilities

Screenshots are automatically saved to:
- `test-results/screenshots/` (from scenario tests)
- `test-results/` (from Playwright tests)

Use screenshots to visually verify:
- Nodes don't overlap
- Layout is correct after operations
- UI remains consistent

## Debugging Collision Issues

1. **Check Console**: Collision warnings appear in browser console
2. **Run Screenshot Tests**: Visual comparison of before/after states
3. **Use Headed Mode**: Watch tests run in visible browser
4. **Adjust Threshold**: Modify `COLLISION_THRESHOLD` if needed

## Adding New Test Scenarios

To add a new test scenario, edit `tests/helpers/git-explorer-test-helper.ts`:

```typescript
export const TEST_SCENARIOS: TestScenario[] = [
  // ... existing scenarios
  {
    name: 'your-scenario-name',
    description: 'Description of what this tests',
    expectedCollisions: true, // or false
    steps: [
      { action: 'select_branch', target: 'branch-name' },
      { action: 'merge' },
      { action: 'screenshot', filename: 'result.png' },
    ]
  }
];
```

## CI/CD Integration

Tests can be run in CI environments:

```bash
# Install dependencies including browsers
npx playwright install

# Run all tests
npm run test
npm run test:e2e
```

For headless CI, ensure the app is running on the expected port (9003).
