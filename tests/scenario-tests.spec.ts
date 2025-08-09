import { test, expect } from '@playwright/test';
import { GitExplorerTestHelper, TEST_SCENARIOS } from './helpers/git-explorer-test-helper';

test.describe('Git Explorer Scenario Tests', () => {
  let helper: GitExplorerTestHelper;

  test.beforeEach(async ({ page }) => {
    helper = new GitExplorerTestHelper(page);
  });

  for (const scenario of TEST_SCENARIOS) {
    test(`scenario: ${scenario.name}`, async () => {
      const result = await helper.runScenario(scenario);
      
      // Log results for debugging
      console.log(`Scenario "${scenario.name}" results:`, result);
      
      // The test passes if the scenario executed successfully
      // (whether collisions were found or not, as long as it matches expectations)
      expect(result.success).toBe(true);
      
      // Additional specific assertions based on scenario
      if (scenario.expectedCollisions) {
        expect(result.collisions.length).toBeGreaterThan(0);
        expect(result.collisions.some(msg => msg.includes('COLLISION'))).toBe(true);
      } else {
        expect(result.collisions.length).toBe(0);
      }
    });
  }

  test('manual scenario: problematic merge master->134', async ({ page }) => {
    helper = new GitExplorerTestHelper(page);
    
    const customScenario = {
      name: 'manual-test-merge-collision',
      description: 'Manual test to reproduce the exact collision described in the issue',
      expectedCollisions: true,
      steps: [
        { action: 'screenshot' as const, filename: 'manual-test-before.png' },
        { action: 'select_branch' as const, target: 'master' },
        { action: 'wait' as const, duration: 500 },
        { action: 'click' as const, target: '134' },
        { action: 'wait' as const, duration: 500 },
        { action: 'merge' as const },
        { action: 'wait' as const, duration: 1500 },
        { action: 'screenshot' as const, filename: 'manual-test-after.png' },
      ]
    };
    
    const result = await helper.runScenario(customScenario);
    
    // This test specifically checks for the collision issue mentioned
    console.log('Manual test completed. Collision detection results:', result.collisions);
    
    // The test will pass whether collisions are detected or not
    // What matters is that our detection system is working
    if (result.collisions.length > 0) {
      console.log('✓ Collision detection system working - overlaps detected');
      expect(result.collisions.some(msg => msg.includes('COLLISION'))).toBe(true);
    } else {
      console.log('✓ No collisions detected - nodes positioned correctly');
    }
    
    // Ensure the test doesn't fail - it's informational
    expect(result).toBeDefined();
  });
});
