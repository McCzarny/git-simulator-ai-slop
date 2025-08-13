import { test, expect } from '@playwright/test';

test('merge 139 to master - custom setup and strict verification', async ({ page }) => {
  await page.goto('http://localhost:9002');
  await page.waitForLoadState('networkidle');

  // Ustaw własny graf
  await page.evaluate(() => {
    const commits = {
      'commit-0': { id: 'commit-0', parentIds: [], timestamp: 1, branchLane: 0, depth: 0, isCustom: false },
      'commit-1': { id: 'commit-1', parentIds: ['commit-0'], timestamp: 2, branchLane: 0, depth: 1, isCustom: false },
      'commit-2': { id: 'commit-2', parentIds: ['commit-1'], timestamp: 3, branchLane: 0, depth: 2, isCustom: false },
      'commit-3': { id: 'commit-3', parentIds: ['commit-2'], timestamp: 4, branchLane: 0, depth: 3, isCustom: false },
      'commit-4': { id: 'commit-4', parentIds: ['commit-3'], timestamp: 5, branchLane: 0, depth: 4, isCustom: false },
      'commit-5': { id: 'commit-5', parentIds: ['commit-4'], timestamp: 6, branchLane: 0, depth: 5, isCustom: false },
      'commit-6': { id: 'commit-6', parentIds: ['commit-3'], timestamp: 7, branchLane: 1, depth: 4, isCustom: false },
      'commit-7': { id: 'commit-7', parentIds: ['commit-6'], timestamp: 8, branchLane: 1, depth: 5, isCustom: false },
      'commit-8': { id: 'commit-8', parentIds: ['commit-7'], timestamp: 9, branchLane: 1, depth: 6, isCustom: false },
    };
    const branches = {
      master: { name: 'master', headCommitId: 'commit-5', lane: 0 },
      '139': { name: '139', headCommitId: 'commit-8', lane: 1 },
    };
    (window as any).setTestGraph(commits, branches);
  });
  await page.screenshot({ path: 'tests/screenshots/e2e-before-merge.png', fullPage: true });

  // Wykonaj merge przez window
  await page.evaluate(() => {
    (window as any).testMerge('139');
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/screenshots/e2e-after-merge.png', fullPage: true });

  // Pobierz stan po merge
  const state = await page.evaluate(() => (window as any).getGraphState());

  // Znajdź merge commit
  const mergeCommit = Object.values(state.commits).find(
    (c: any) => c.parentIds.length === 2 && c.parentIds.includes('commit-5') && c.parentIds.includes('commit-8')
  );
  expect(mergeCommit).toBeDefined();
  // HEAD master wskazuje na merge commit
  expect(state.branches.master.headCommitId).toBe((mergeCommit as any).id);
  // HEAD 139 niezmieniony
  expect(state.branches['139'].headCommitId).toBe('commit-8');
  // Żaden istniejący commit nie zmienił parentIds
  const originalParents: Record<string, string[]> = {
    'commit-0': [],
    'commit-1': ['commit-0'],
    'commit-2': ['commit-1'],
    'commit-3': ['commit-2'],
    'commit-4': ['commit-3'],
    'commit-5': ['commit-4'],
    'commit-6': ['commit-3'],
    'commit-7': ['commit-6'],
    'commit-8': ['commit-7'],
  };
  for (const id of Object.keys(originalParents)) {
    expect(state.commits[id].parentIds).toEqual(originalParents[id]);
  }
});
