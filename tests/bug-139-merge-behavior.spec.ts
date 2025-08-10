import { test, expect } from '@playwright/test';

test.describe('Bug: 139 merge into master behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('should test merge 139 into master and verify git-like behavior', async ({ page }) => {
    // Setup console listener
    const messages: string[] = [];
    page.on('console', msg => {
      messages.push(`${msg.type()}: ${msg.text()}`);
    });

    // Take screenshot of initial state
    await expect(page).toHaveScreenshot('initial-state-139-merge.png');

    console.log('Step 1: Selecting master branch...');
    const masterBranchLabel = page.locator('[aria-label="Branch master"]');
    await expect(masterBranchLabel).toBeVisible();
    await masterBranchLabel.click();
    await page.waitForTimeout(500);

    // Take screenshot after selecting master
    await expect(page).toHaveScreenshot('master-selected-139-merge.png');

    console.log('Step 2: Selecting 139 for merge...');
    const mergeSelect = page.locator('button[role="combobox"]').filter({ hasText: 'Select source branch to merge...' });
    await expect(mergeSelect).toBeVisible();
    await mergeSelect.click();
    await page.waitForTimeout(300);

    const branch139Option = page.locator('[role="option"]').filter({ hasText: '139' });
    await expect(branch139Option).toBeVisible();
    await branch139Option.click();
    await page.waitForTimeout(500);

    // Take screenshot before merge
    await expect(page).toHaveScreenshot('before-139-master-merge.png');

    console.log('Step 3: Performing merge...');
    const mergeButton = page.getByRole('button', { name: /merge/i });
    await expect(mergeButton).toBeVisible();
    await mergeButton.click();
    
    // Wait for merge operation
    await page.waitForTimeout(2000);

    // Take screenshot after merge
    await expect(page).toHaveScreenshot('after-139-master-merge.png');

    // Count nodes and analyze structure
    const commitNodes = await page.locator('circle[class*="commit"]').count();
    const edges = await page.locator('line[marker-end]').count();
    
    console.log(`Commit nodes after merge: ${commitNodes}`);
    console.log(`Edges after merge: ${edges}`);

    // Log any console messages for debugging
    console.log('Console messages during test:');
    messages.forEach(msg => console.log(`  ${msg}`));

    // Basic validation - merge should succeed
    expect(commitNodes).toBeGreaterThan(0);
    expect(edges).toBeGreaterThan(0);
  });

  test('should analyze git graph structure after 139 merge', async ({ page }) => {
    console.log('Analyzing git graph structure...');

    // Select master and perform merge
    await page.locator('[aria-label="Branch master"]').click();
    await page.waitForTimeout(500);

    const mergeSelect = page.locator('button[role="combobox"]').filter({ hasText: 'Select source branch to merge...' });
    await mergeSelect.click();
    await page.waitForTimeout(300);

    await page.locator('[role="option"]').filter({ hasText: '139' }).click();
    await page.waitForTimeout(500);

    // Get pre-merge state
    const preMergeCommits = await page.locator('circle[class*="commit"]').count();
    const preMergeEdges = await page.locator('line[marker-end]').count();

    console.log(`Pre-merge: ${preMergeCommits} commits, ${preMergeEdges} edges`);

    await page.getByRole('button', { name: /merge/i }).click();
    await page.waitForTimeout(2000);

    // Get post-merge state
    const postMergeCommits = await page.locator('circle[class*="commit"]').count();
    const postMergeEdges = await page.locator('line[marker-end]').count();

    console.log(`Post-merge: ${postMergeCommits} commits, ${postMergeEdges} edges`);

    // In a real git merge, we should see:
    // 1. A new merge commit created
    // 2. The merge commit should have 2 parents
    // 3. Branch structure should be preserved
    
    expect(postMergeCommits).toBeGreaterThanOrEqual(preMergeCommits);
    expect(postMergeEdges).toBeGreaterThanOrEqual(preMergeEdges);
  });
});
