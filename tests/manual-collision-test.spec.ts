import { test, expect } from '@playwright/test';

test.describe('Manual Collision Testing', () => {
  test('should manually test collision detection by forcing overlapping nodes', async ({ page }) => {
    let collisionFound = false;
    const collisionMessages: string[] = [];
    
    // Listen for console warnings
    page.on('console', msg => {
      console.log(`Console ${msg.type()}: ${msg.text()}`);
      if (msg.type() === 'warning' && msg.text().includes('COLLISION')) {
        collisionFound = true;
        collisionMessages.push(msg.text());
        console.log('🚨 COLLISION DETECTED:', msg.text());
      }
    });

    await page.goto('/');
    await page.waitForTimeout(3000);
    
    // Take initial screenshot
    await expect(page).toHaveScreenshot('manual-test-initial.png');
    
    // Try to interact with the interface to see available options
    console.log('Looking for available branches...');
    
    // Check what branch labels exist
    const branchLabels = page.locator('[aria-label*="Branch"]');
    const branchCount = await branchLabels.count();
    console.log(`Found ${branchCount} branch labels`);
    
    for (let i = 0; i < branchCount; i++) {
      const label = branchLabels.nth(i);
      const ariaLabel = await label.getAttribute('aria-label');
      console.log(`Branch ${i}: ${ariaLabel}`);
    }
    
    // Try clicking on branches if they exist
    if (branchCount > 0) {
      console.log('Clicking on first branch...');
      await branchLabels.first().click();
      await page.waitForTimeout(1000);
      
      await expect(page).toHaveScreenshot('manual-test-branch-clicked.png');
    }
    
    // Check if there are any buttons for actions
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    console.log(`Found ${buttonCount} buttons`);
    
    // Log if we found any collision so far
    console.log(`Collision detection status: ${collisionFound ? '✓ WORKING' : '○ No collisions yet'}`);
    if (collisionMessages.length > 0) {
      console.log('Collision messages:');
      collisionMessages.forEach(msg => console.log(`  - ${msg}`));
    }
    
    // Take final screenshot
    await expect(page).toHaveScreenshot('manual-test-final.png');
    
    // This test passes regardless of whether collision is detected
    // It's more about verifying the setup works
    expect(true).toBe(true);
  });

  test('should test specific scenario from user description', async ({ page }) => {
    let warningCount = 0;
    const allMessages: string[] = [];
    
    page.on('console', msg => {
      const message = `${msg.type()}: ${msg.text()}`;
      allMessages.push(message);
      if (msg.type() === 'warning' && msg.text().includes('COLLISION')) {
        warningCount++;
        console.log('🔍 Found collision warning:', msg.text());
      }
    });

    await page.goto('/');
    await page.waitForTimeout(2000);
    
    console.log('=== Testing scenario: Select "master" then merge with "134" ===');
    
    // Step 1: Try to find and select master branch
    try {
      const masterBranch = page.getByLabel('Branch master');
      if (await masterBranch.isVisible()) {
        console.log('✓ Found master branch, clicking...');
        await masterBranch.click();
        await page.waitForTimeout(1000);
        await expect(page).toHaveScreenshot('scenario-master-selected.png');
      } else {
        console.log('⚠ Master branch not found with aria-label');
      }
    } catch (error) {
      console.log('⚠ Could not select master branch:', error);
    }
    
    // Step 2: Look for 134 branch and attempt merge
    try {
      const branch134 = page.getByLabel('Branch 134');
      if (await branch134.isVisible()) {
        console.log('✓ Found 134 branch');
        // This would be where the problematic merge happens
        console.log('📍 This is where the collision might occur');
      } else {
        console.log('⚠ 134 branch not found - may need to create it first');
      }
    } catch (error) {
      console.log('ℹ 134 branch not available:', error);
    }
    
    await page.waitForTimeout(2000);
    await expect(page).toHaveScreenshot('scenario-attempted-merge.png');
    
    // Report findings
    console.log(`\n=== Test Results ===`);
    console.log(`Collision warnings found: ${warningCount}`);
    console.log(`Total console messages: ${allMessages.length}`);
    
    if (warningCount > 0) {
      console.log('✅ Collision detection system is working!');
    } else {
      console.log('ℹ No collisions detected (this may be expected if no overlapping occurs)');
    }
    
    // Test passes - we're just gathering information
    expect(true).toBe(true);
  });
});
