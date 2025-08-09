import { test, expect } from '@playwright/test';

test.describe('Git Explorer Screenshot Tests', () => {
  test('screenshot: initial state', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000); // Wait for full render
    
    await expect(page).toHaveScreenshot('initial-state.png');
  });

  test('screenshot: after merge master with 134', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
    
    try {
      // Select master branch using the SVG label
      await page.getByLabel('Branch master').click();
      await page.waitForTimeout(500);
      
      // Open merge dropdown and select 134
      await page.getByRole('combobox', { name: /select source branch to merge/i }).click();
      await page.waitForTimeout(300);
      await page.getByRole('option', { name: /134/i }).click();
      await page.waitForTimeout(300);
      
      // Click merge button
      const mergeButton = page.getByRole('button', { name: /merge/i });
      if (await mergeButton.isVisible()) {
        await mergeButton.click();
        await page.waitForTimeout(1000);
      }
    } catch (error) {
      console.log('Could not perform merge operation in screenshot test:', error);
    }
    
    await expect(page).toHaveScreenshot('after-merge-master-134.png');
  });

  test('screenshot: compare before and after problematic merge', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
    
    // Take screenshot before merge
    await expect(page).toHaveScreenshot('before-problematic-merge.png');
    
    // Setup console listener
    const collisions: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'warning' && msg.text().includes('COLLISION')) {
        collisions.push(msg.text());
      }
    });
    
    try {
      // Perform the problematic merge: select "master" then merge with "134"
      await page.getByLabel('Branch master').click();
      await page.waitForTimeout(500);
      
      // Open merge dropdown and select 134
      await page.getByRole('combobox', { name: /select source branch to merge/i }).click();
      await page.waitForTimeout(300);
      await page.getByRole('option', { name: /134/i }).click();
      await page.waitForTimeout(300);
      
      const mergeButton = page.getByRole('button', { name: /merge/i });
      if (await mergeButton.isVisible()) {
        await mergeButton.click();
        await page.waitForTimeout(1000);
      }
    } catch (error) {
      console.log('Could not perform problematic merge:', error);
    }
    
    // Take screenshot after merge
    await expect(page).toHaveScreenshot('after-problematic-merge.png');
    
    // Log any collisions found
    if (collisions.length > 0) {
      console.log('Collisions detected during screenshot test:');
      collisions.forEach(collision => console.log(collision));
    }
  });
});
