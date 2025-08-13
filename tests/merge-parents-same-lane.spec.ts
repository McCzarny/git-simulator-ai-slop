import { test, expect } from '@playwright/test';

test.describe('Merge Parents Same Lane Fix', () => {
  test('should ensure merge parents are in different lanes', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the app to load
    await expect(page.locator('h1')).toContainText('Git Simulator');
    await page.waitForTimeout(1000);
    
    // Clear the graph to start fresh
    await page.click('button:has-text("Clear")');
    await page.waitForTimeout(500);
    
    // Step 1: Create initial setup - we should have commit-0 (initial commit)
    // Add commit 2 to master
    await page.click('button:has-text("Commit")');
    await page.waitForTimeout(300);
    
    // Add commit 3 to master
    await page.click('button:has-text("Commit")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Commit")');
    await page.waitForTimeout(300);
    
    // Step 2: Create feature branch from commit-1 (the second commit)
    // First, select commit-1 using a more specific selector
    const commits = page.locator('g[aria-label*="Commit"]');
    const commit1 = commits.nth(2); // Second commit (index 2)
    await commit1.click();
    await page.waitForTimeout(300);
    
    // Create branch from this commit
    await page.click('button:has-text("Branch")');
    await page.waitForTimeout(500);
    
    // Step 3: Add commit 4 to the feature branch (should be automatically selected)
    await page.click('button:has-text("Commit")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Commit")');
    await page.waitForTimeout(300);
    
    // Step 4: Select master branch and merge feature into it
    await page.getByLabel('Branch master').click();
    await page.waitForTimeout(300);
    
    // Trigger merge using the proper selector from working tests
    const mergeSelect = page.locator('button[role="combobox"]').filter({ hasText: 'Select source branch to merge...' });
    await mergeSelect.click();
    await page.waitForTimeout(300);
    
    // Select the feature branch (should be 132)
    await page.locator('[role="option"]').filter({ hasText: '132' }).click();
    await page.waitForTimeout(300);
    
    await page.click('button:has-text("Merge")');
    await page.waitForTimeout(1000);
    
    // Step 5: Add a new commit to master after merge
    await page.click('button:has-text("Commit")');
    await page.waitForTimeout(500);
    
    // Step 6: Verify that the merge parents are in different lanes
    // We need to check the actual commit data, not just positions
    
    // Get the graph state from the window object (exposed for debugging)
    const graphState = await page.evaluate(() => {
      return (window as any).getGraphState();
    });
    
    console.log('Graph state commits:', Object.keys(graphState.commits));
    
    // Find merge commits (commits with exactly 2 parents)
    const mergeCommits = Object.values(graphState.commits as any[]).filter((commit: any) => 
      commit.parentIds && commit.parentIds.length === 2
    );
    
    console.log('Found merge commits:', mergeCommits.map((c: any) => ({ id: c.id, parents: c.parentIds })));
    
    if (mergeCommits.length > 0) {
      const mergeCommit = mergeCommits[0] as any;
      const parent1Id = mergeCommit.parentIds[0];
      const parent2Id = mergeCommit.parentIds[1];
      
      const parent1 = graphState.commits[parent1Id];
      const parent2 = graphState.commits[parent2Id];
      
      console.log('Merge commit:', mergeCommit.id);
      console.log('Parent 1:', parent1Id, 'lane:', parent1?.branchLane);
      console.log('Parent 2:', parent2Id, 'lane:', parent2?.branchLane);
      
      // The critical test: merge parents should be in different lanes
      expect(parent1.branchLane).not.toBe(parent2.branchLane);
    } else {
      throw new Error('No merge commits found in the graph');
    }

    // Take screenshot for visual verification
    await page.screenshot({ 
      path: 'tests/merge-parents-same-lane.spec.ts-snapshots/parents-different-lanes.png',
      fullPage: true 
    });
  });

  test('should handle complex merge scenarios without lane conflicts', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the app to load
    await expect(page.locator('h1')).toContainText('Git Simulator');
    
    // Use the default graph which has multiple branches
    // Select master branch
    await page.click('text=master');
    
    // Merge branch 139 into master
    const mergeSelect = page.locator('button[role="combobox"]').filter({ hasText: 'Select source branch to merge...' });
    await mergeSelect.click();
    await page.waitForTimeout(300);
    
    await page.locator('[role="option"]').filter({ hasText: '139' }).click();
    await page.waitForTimeout(300);
    
    await page.click('button:has-text("Merge")');
    await page.waitForTimeout(1000);
    
    // Add another commit to master
    await page.click('button:has-text("Commit")');
    await page.waitForTimeout(300);
    
    // Merge another branch
    await mergeSelect.click();
    await page.waitForTimeout(300);
    
    await page.locator('[role="option"]').filter({ hasText: '136' }).click();
    await page.waitForTimeout(300);
    await page.click('button:has-text("Merge")');
    
    // Verify no visual overlaps exist
    const svgElement = page.locator('svg').first();
    const circles = svgElement.locator('circle');
    const circleCount = await circles.count();
    
    // Collect all commit positions
    const allPositions: Array<{ x: number; y: number }> = [];
    
    for (let i = 0; i < circleCount; i++) {
      const circle = circles.nth(i);
      const transform = await circle.evaluate((el) => {
        const parent = el.parentElement;
        return parent?.getAttribute('transform') || '';
      });
      
      const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
      if (match) {
        const x = parseFloat(match[1]);
        const y = parseFloat(match[2]);
        allPositions.push({ x, y });
      }
    }
    
    // Group by depth (y position) and verify no overlaps within same depth
    const positionsByDepth = new Map<number, number[]>();
    
    allPositions.forEach(pos => {
      const depth = Math.round(pos.y / 60) * 60; // Round to nearest depth level
      if (!positionsByDepth.has(depth)) {
        positionsByDepth.set(depth, []);
      }
      positionsByDepth.get(depth)!.push(pos.x);
    });
    
    // Verify no two commits at the same depth have the same x position
    for (const [depth, xPositions] of positionsByDepth.entries()) {
      const uniqueXPositions = new Set(xPositions);
      expect(uniqueXPositions.size).toBe(xPositions.length);
    }
    
    // Take screenshot for verification
    await page.screenshot({ 
      path: 'tests/merge-parents-same-lane.spec.ts-snapshots/complex-merge-no-conflicts.png',
      fullPage: true 
    });
  });
});
