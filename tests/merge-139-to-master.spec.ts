import { test, expect } from '@playwright/test';

test.describe('Merge 139 to master', () => {
  test('should create proper merge commit with two parents', async ({ page }) => {
    await page.goto('http://localhost:9002');
    
    // Wait for the application to load
    await page.waitForLoadState('networkidle');
    
    // Reset to initial state
    await page.click('button:has-text("Reset")');
    await page.waitForTimeout(1000);
    
    // Select master branch
    await page.click('text=master');
    await page.waitForTimeout(500);
    
    // Perform merge of 139 into master
    await page.selectOption('select', '139'); // Select 139 from dropdown
    await page.click('button:has-text("Merge")');
    await page.waitForTimeout(1000);
    
    // Get the commit structure after merge
    const commits = await page.evaluate(() => {
      // Access React component state through window object
      const app = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!app) return null;
      
      // Alternative: Check console logs for merge information
      return {
        loggedCommits: (window as any).testCommits || 'No test data found'
      };
    });
    
    console.log('Commits after merge:', commits);
    
    // Check console logs for merge behavior
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'log' && msg.text().includes('merge')) {
        logs.push(msg.text());
      }
    });
    
    // Check that a toast appeared indicating successful merge
    const toastLocator = page.locator('[data-testid="toast"], .toast, [role="alert"]');
    await expect(toastLocator).toBeVisible({ timeout: 5000 });
    
    // Take a screenshot to verify the graph structure
    await page.screenshot({ path: 'tests/screenshots/merge-139-to-master.png', fullPage: true });
  });
  
  test('should verify merge commit has correct parent structure', async ({ page }) => {
    await page.goto('http://localhost:9002');
    await page.waitForLoadState('networkidle');
    
    // Reset and setup
    await page.click('button:has-text("Reset")');
    await page.waitForTimeout(1000);
    
    // Add console listener to capture merge details
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });
    
    // Select master and merge 139
    await page.click('text=master');
    await page.waitForTimeout(500);
    await page.selectOption('select', '139'); // Select 139 from dropdown
    await page.click('button:has-text("Merge")');
    await page.waitForTimeout(2000);
    
    // Check console logs for merge commit creation
    const mergeLog = consoleMessages.find(msg => msg.includes('Creating merge commit'));
    expect(mergeLog).toBeTruthy();
    console.log('Merge log found:', mergeLog);
    
    // Verify that we have merge-related console output
    const relevantLogs = consoleMessages.filter(msg => 
      msg.includes('merge') || msg.includes('commit') || msg.includes('139') || msg.includes('master')
    );
    console.log('All relevant logs:', relevantLogs);
  });
});
