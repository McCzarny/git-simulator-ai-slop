import { test, expect } from '@playwright/test';

// Helper function to get the graph state via JavaScript
const getGraphState = async (page: any) => {
  return await page.evaluate(() => {
    return (window as any).getGraphState?.();
  });
};

test.describe('Parent-Child Lane Conflict Fix', () => {
  test('should move child commit when parent and child are in same lane with commits between them', async ({ page }) => {
    await page.goto('http://localhost:9002');
    
    // Wait for the app to load
    await page.waitForSelector('text=Git Simulator');
    await page.waitForTimeout(1000);
    
    // Clear the graph to start fresh
    await page.click('button:has-text("Clear")');
    await page.waitForTimeout(500);
    
    // Step 1: Create a scenario where we have:
    // - commit-0 (initial, lane 0, depth 0)
    // - commit-1 (branch from commit-0, lane 0, depth 1) 
    // - commit-2 (branch from commit-0, lane 1, depth 1)
    // - commit-3 (branch from commit-1, lane 0, depth 2)
    // This creates: commit-3 and commit-1 in same lane with commit-2 potentially between them visually
    
    // Add a commit to master
    await page.click('button:has-text("Commit")');
    await page.waitForTimeout(300);
    
    // Step 2: Create first branch from the initial commit
    const commits = page.locator('g[aria-label*="Commit"]');
    const initialCommit = commits.first(); // First commit (commit-0)
    await initialCommit.click();
    await page.waitForTimeout(300);
    
    await page.click('button:has-text("Branch")');
    await page.waitForTimeout(500);
    
    // Step 3: Go back to master and create another branch from initial commit
    await initialCommit.click();
    await page.waitForTimeout(300);
    
    await page.getByLabel('Branch master').click();
    await page.waitForTimeout(300);
    
    await page.click('button:has-text("Branch")');
    await page.waitForTimeout(500);
    
    // Step 4: Select the first created branch and add another commit
    await page.getByLabel(/Branch branch-/).first().click();
    await page.waitForTimeout(300);
    
    await page.click('button:has-text("Commit")');
    await page.waitForTimeout(300);
    
    // Step 5: Check the graph state to verify lane assignments
    const graphState = await getGraphState(page);
    console.log('Graph state commits:', graphState?.commits?.map((c: any) => c.id) || 'Not available');
    
    if (graphState?.commits) {
      const commits = graphState.commits;
      
      // Find commits that might have parent-child lane conflicts
      const conflicts = [];
      for (const commit of commits) {
        for (const parentId of commit.parentIds || []) {
          const parent = commits.find((c: any) => c.id === parentId);
          if (parent && parent.branchLane === commit.branchLane && parent.depth < commit.depth) {
            // Check if there are commits between them
            const minDepth = parent.depth;
            const maxDepth = commit.depth;
            const lane = parent.branchLane;
            
            const commitsBetween = commits.filter((c: any) => 
              c.depth > minDepth && c.depth < maxDepth && c.branchLane === lane
            );
            
            if (commitsBetween.length > 0) {
              conflicts.push({
                child: commit.id,
                parent: parentId,
                lane: lane,
                commitsBetween: commitsBetween.map((c: any) => c.id)
              });
            }
          }
        }
      }
      
      console.log('Parent-child lane conflicts found:', conflicts);
      
      // The fix should have resolved these conflicts
      expect(conflicts.length).toBe(0);
      
      // Additional verification: check that all commits are properly positioned
      for (const commit of commits) {
        console.log(`Commit ${commit.id}: lane ${commit.branchLane}, depth ${commit.depth}`);
        
        // Verify no two commits occupy the same position
        const samePosition = commits.filter((c: any) => 
          c.id !== commit.id && c.branchLane === commit.branchLane && c.depth === commit.depth
        );
        expect(samePosition.length).toBe(0);
      }
    } else {
      throw new Error('Could not get graph state for verification');
    }
  });

  test('should handle complex branching scenarios without parent-child conflicts', async ({ page }) => {
    await page.goto('http://localhost:9002');
    
    // Wait for the app to load
    await page.waitForSelector('text=Git Simulator');
    await page.waitForTimeout(1000);
    
    // Clear the graph to start fresh
    await page.click('button:has-text("Clear")');
    await page.waitForTimeout(500);
    
    // Create a more complex scenario with multiple branches
    // Master -> Branch1 -> Branch1-Sub
    //        -> Branch2
    
    // Create Branch1 from initial commit
    const commits = page.locator('g[aria-label*="Commit"]');
    const initialCommit = commits.first();
    await initialCommit.click();
    await page.waitForTimeout(300);
    
    await page.click('button:has-text("Branch")');
    await page.waitForTimeout(500);
    
    // Create Branch2 from initial commit
    await initialCommit.click();
    await page.waitForTimeout(300);
    
    await page.getByLabel('Branch master').click();
    await page.waitForTimeout(300);
    
    await page.click('button:has-text("Branch")');
    await page.waitForTimeout(500);
    
    // Go to Branch1 and create a sub-branch
    await page.getByLabel(/Branch branch-/).first().click();
    await page.waitForTimeout(300);
    
    await page.click('button:has-text("Commit")');
    await page.waitForTimeout(300);
    
    // Add more commits to create depth
    await page.click('button:has-text("Commit")');
    await page.waitForTimeout(300);
    
    // Verify the final state
    const graphState = await getGraphState(page);
    
    if (graphState?.commits) {
      const commits = graphState.commits;
      console.log('Complex scenario commits:', commits.map((c: any) => `${c.id}(lane:${c.branchLane},depth:${c.depth})`));
      
      // Verify no parent-child lane conflicts exist
      let conflictCount = 0;
      for (const commit of commits) {
        for (const parentId of commit.parentIds || []) {
          const parent = commits.find((c: any) => c.id === parentId);
          if (parent && parent.branchLane === commit.branchLane && parent.depth < commit.depth) {
            const minDepth = parent.depth;
            const maxDepth = commit.depth;
            const lane = parent.branchLane;
            
            const commitsBetween = commits.filter((c: any) => 
              c.depth > minDepth && c.depth < maxDepth && c.branchLane === lane
            );
            
            if (commitsBetween.length > 0) {
              console.log(`Conflict: ${commit.id} and parent ${parentId} in lane ${lane} with ${commitsBetween.length} commits between`);
              conflictCount++;
            }
          }
        }
      }
      
      expect(conflictCount).toBe(0);
    }
  });
});
