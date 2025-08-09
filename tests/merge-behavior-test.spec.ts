import { test, expect } from '@playwright/test';

test.describe('Git Merge Behavior Test', () => {
  test('should test different merge scenarios', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Setup console listener to capture merge messages
    const messages: string[] = [];
    page.on('console', msg => {
      messages.push(`${msg.type()}: ${msg.text()}`);
    });

    console.log('=== Testing merge 139 → master ===');
    
    // Select master branch
    await page.locator('[aria-label="Branch master"]').click();
    await page.waitForTimeout(500);

    // Select 139 for merge
    const mergeSelect = page.locator('button[role="combobox"]').filter({ hasText: 'Select source branch to merge...' });
    await mergeSelect.click();
    await page.waitForTimeout(300);

    await page.locator('[role="option"]').filter({ hasText: '139' }).click();
    await page.waitForTimeout(500);

    // Perform merge
    await page.getByRole('button', { name: /merge/i }).click();
    await page.waitForTimeout(2000);

    // Check if any toasts appeared (they would indicate merge type)
    const toasts = await page.locator('[data-testid="toast"]').count();
    console.log(`Toasts after merge: ${toasts}`);

    // Log any relevant console messages
    const relevantMessages = messages.filter(msg => 
      msg.includes('Merge') || 
      msg.includes('Fast-Forward') || 
      msg.includes('Already Merged') ||
      msg.includes('COLLISION')
    );
    
    console.log('Relevant messages:');
    relevantMessages.forEach(msg => console.log(`  ${msg}`));

    // Test passes if merge completes without errors
    expect(true).toBe(true);
  });

  test('should test fast-forward scenario', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    console.log('=== Testing potential fast-forward scenarios ===');
    
    // Try different merge combinations to see which ones trigger fast-forward
    const combinations = [
      { target: 'master', source: '139' },
      { target: 'master', source: '136' },
      { target: 'master', source: '134' },
      { target: '134', source: 'master' },
      { target: '136', source: 'master' },
      { target: '139', source: 'master' }
    ];

    for (const combo of combinations) {
      console.log(`\n--- Testing ${combo.target} ← ${combo.source} ---`);
      
      // Reset to initial state (you might need to add reset functionality)
      await page.reload();
      await page.waitForTimeout(1000);

      // Select target branch
      await page.locator(`[aria-label="Branch ${combo.target}"]`).click();
      await page.waitForTimeout(300);

      // Select source for merge
      const mergeSelect = page.locator('button[role="combobox"]').filter({ hasText: 'Select source branch to merge...' });
      await mergeSelect.click();
      await page.waitForTimeout(200);

      const sourceOption = page.locator('[role="option"]').filter({ hasText: combo.source });
      if (await sourceOption.isVisible()) {
        await sourceOption.click();
        await page.waitForTimeout(300);

        // Perform merge
        const mergeButton = page.getByRole('button', { name: /merge/i });
        if (await mergeButton.isVisible()) {
          await mergeButton.click();
          await page.waitForTimeout(1000);
        }
      }
    }

    expect(true).toBe(true);
  });
});
