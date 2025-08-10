import { test, expect } from '@playwright/test';

test.describe('Bug Fix: 134 merge into master collision', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000); // Wait for full load
  });

  test('should detect collision when merging 134 into master', async ({ page }) => {
    // Setup console listener to catch collision warnings
    const collisionWarnings: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'warning' && msg.text().includes('COLLISION')) {
        collisionWarnings.push(msg.text());
        console.log('🔴 COLLISION DETECTED:', msg.text());
      }
    });

    // Take screenshot before merge
    await expect(page).toHaveScreenshot('before-134-master-merge.png');

    // Step 1: Select master branch
    console.log('Step 1: Selecting master branch...');
    const masterBranchLabel = page.locator('[aria-label="Branch master"]');
    await expect(masterBranchLabel).toBeVisible();
    await masterBranchLabel.click();
    await page.waitForTimeout(500);

    // Step 2: Select 134 branch for merge
    console.log('Step 2: Selecting 134 for merge...');
    
    // Find the merge select dropdown
    const mergeSelect = page.locator('button[role="combobox"]').filter({ hasText: 'Select source branch to merge...' });
    await expect(mergeSelect).toBeVisible();
    await mergeSelect.click();
    await page.waitForTimeout(300);

    // Select 134 from dropdown
    const branch134Option = page.locator('[role="option"]').filter({ hasText: '134' });
    await expect(branch134Option).toBeVisible();
    await branch134Option.click();
    await page.waitForTimeout(500);

    // Step 3: Click merge button
    console.log('Step 3: Clicking merge button...');
    const mergeButton = page.getByRole('button', { name: /merge/i });
    await expect(mergeButton).toBeVisible();
    await mergeButton.click();
    
    // Wait for merge operation to complete and graph to re-render
    await page.waitForTimeout(2000);

    // Take screenshot after merge
    await expect(page).toHaveScreenshot('after-134-master-merge.png');

    // Check if collision was detected
    console.log(`Collisions found: ${collisionWarnings.length}`);
    if (collisionWarnings.length > 0) {
      console.log('❌ BUG STILL EXISTS: Collision detected during 134 -> master merge');
      collisionWarnings.forEach(warning => console.log(`   ${warning}`));
      
      // Fail the test if collisions are still happening
      expect(collisionWarnings.length).toBe(0);
    } else {
      console.log('✅ BUG FIXED: No collision detected - nodes positioned correctly');
      // Success - no collisions detected
      expect(collisionWarnings.length).toBe(0);
    }
  });

  test('should verify merge operation completes successfully', async ({ page }) => {
    console.log('Testing merge operation completion...');

    // Select master branch
    const masterBranchLabel = page.locator('[aria-label="Branch master"]');
    await masterBranchLabel.click();
    await page.waitForTimeout(500);

    // Get initial commit count
    const initialCommitCount = await page.locator('circle[class*="commit"]').count();
    console.log(`Initial commit count: ${initialCommitCount}`);

    // Perform merge
    const mergeSelect = page.locator('button[role="combobox"]').filter({ hasText: 'Select source branch to merge...' });
    await mergeSelect.click();
    await page.waitForTimeout(300);

    const branch134Option = page.locator('[role="option"]').filter({ hasText: '134' });
    await branch134Option.click();
    await page.waitForTimeout(500);

    const mergeButton = page.getByRole('button', { name: /merge/i });
    await mergeButton.click();
    await page.waitForTimeout(2000);

    // Check if merge created new commit(s)
    const finalCommitCount = await page.locator('circle[class*="commit"]').count();
    console.log(`Final commit count: ${finalCommitCount}`);

    // Merge should either create a merge commit or fast-forward
    expect(finalCommitCount).toBeGreaterThanOrEqual(initialCommitCount);
  });
});
