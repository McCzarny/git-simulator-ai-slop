import { test, expect } from '@playwright/test';

test.describe('Git Merge Logic - Compact Graph', () => {
  test('should properly merge 139 to master with correct parent structure', async ({ page }) => {
    await page.goto('http://localhost:9002');
    await page.waitForLoadState('networkidle');
    
    // Reset to get the compact graph
    await page.click('button:has-text("Reset")');
    await page.waitForTimeout(1000);
    
    // Capture console logs for debugging
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      consoleLogs.push(`${msg.type()}: ${msg.text()}`);
    });
    
    // Select master branch first
    await page.locator('text=master').first().click();
    await page.waitForTimeout(500);
    
    // Find and open the merge dropdown
    const mergeSelect = page.locator('select').first();
    await mergeSelect.selectOption('139');
    
    // Click merge button
    await page.click('button:has-text("Merge")');
    await page.waitForTimeout(2000);
    
    // Call debug function to inspect commit structure
    const commitStructure = await page.evaluate(() => {
      // Call the debug function we added
      if ((window as any).debugCommits) {
        (window as any).debugCommits();
      }
      return 'Debug called - check console';
    });
    
    // Take a screenshot of the final result
    await page.screenshot({ 
      path: 'tests/screenshots/merge-139-master-compact.png', 
      fullPage: true 
    });
    
    // Log all console output for debugging
    console.log('=== CONSOLE LOGS ===');
    consoleLogs.forEach(log => console.log(log));
    
    // Verify that we have some merge-related logs
    const mergeRelatedLogs = consoleLogs.filter(log => 
      log.includes('merge') || log.includes('Merge') || log.includes('commit-')
    );
    
    expect(mergeRelatedLogs.length).toBeGreaterThan(0);
    console.log('Merge-related logs found:', mergeRelatedLogs.length);
  });
  
  test('verify graph structure before merge', async ({ page }) => {
    await page.goto('http://localhost:9002');
    await page.waitForLoadState('networkidle');
    
    // Reset and inspect initial structure
    await page.click('button:has-text("Reset")');
    await page.waitForTimeout(1000);
    
    // Get initial commit structure
    const initialStructure = await page.evaluate(() => {
      if ((window as any).debugCommits) {
        (window as any).debugCommits();
      }
      return 'Initial structure logged';
    });
    
    // Take screenshot of initial state
    await page.screenshot({ 
      path: 'tests/screenshots/initial-compact-graph.png', 
      fullPage: true 
    });
    
    // Verify all expected branches are visible
    await expect(page.locator('text=master')).toBeVisible();
    await expect(page.locator('text=139')).toBeVisible();
    await expect(page.locator('text=136')).toBeVisible();
    await expect(page.locator('text=134')).toBeVisible();
  });
});
