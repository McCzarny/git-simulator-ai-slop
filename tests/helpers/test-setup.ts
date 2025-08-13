import { Page, expect } from '@playwright/test';

/**
 * Robust test helper for Git Explorer tests
 * Ensures consistent initial state and provides reusable actions
 */
export class GitExplorerTestHelper {
  constructor(private page: Page) {}

  /**
   * Initialize the page and wait for the application to be ready
   */
  async initialize() {
    await this.page.goto('/');
    await expect(this.page.locator('h1')).toContainText('Git Simulator');
    await this.page.waitForTimeout(1000); // Wait for initial render
  }

  /**
   * Clear the graph to start with a clean state
   */
  async clearGraph() {
    await this.page.click('button:has-text("Clear")');
    await this.page.waitForTimeout(500);
  }

  /**
   * Get the current graph state via JavaScript evaluation
   */
  async getGraphState(): Promise<any> {
    return await this.page.evaluate(() => {
      const state = (window as any).getGraphState?.();
      if (state?.commits) {
        // Convert commits object to array for easier testing
        state.commits = Object.values(state.commits);
      }
      return state;
    });
  }

  /**
   * Add a commit to the currently selected branch
   */
  async addCommit() {
    // Try multiple selectors for the commit button
    try {
      await this.page.click('button[aria-label*="Add new commit"]');
    } catch {
      try {
        await this.page.click('button:has-text("Commit")');
      } catch {
        await this.page.getByRole('button', { name: /commit/i }).click();
      }
    }
    await this.page.waitForTimeout(300);
  }

  /**
   * Create a new branch from the currently selected commit
   */
  async createBranch() {
    // Try multiple selectors for the branch button
    try {
      await this.page.click('button[aria-label*="Create new branch"]');
    } catch {
      try {
        await this.page.click('button:has-text("Branch")');
      } catch {
        await this.page.getByRole('button', { name: /branch/i }).click();
      }
    }
    await this.page.waitForTimeout(500);
  }

  /**
   * Select a branch by name
   */
  async selectBranch(branchName: string) {
    await this.page.getByLabel(`Branch ${branchName}`).click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Select a commit by clicking on it
   */
  async selectCommit(commitIndex: number) {
    const commits = this.page.locator('g[aria-label*="Commit"]');
    await commits.nth(commitIndex).click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Perform a merge operation
   */
  async performMerge(sourceBranchName: string) {
    try {
      // Try the new UI pattern first
      const mergeSelect = this.page.locator('button[role="combobox"]').filter({ 
        hasText: 'Select source branch to merge...' 
      });
      await mergeSelect.click();
      await this.page.waitForTimeout(300);
      
      // Select the source branch
      await this.page.getByRole('option', { name: sourceBranchName }).click();
      await this.page.waitForTimeout(300);
      
      // Click merge button
      await this.page.click('button:has-text("Merge")');
      await this.page.waitForTimeout(500);
    } catch (error) {
      // Fallback to old UI pattern
      try {
        await this.page.selectOption('select', sourceBranchName);
        await this.page.click('button:has-text("Merge")');
        await this.page.waitForTimeout(500);
      } catch (fallbackError) {
        throw new Error(`Failed to perform merge: ${error}. Fallback also failed: ${fallbackError}`);
      }
    }
  }

  /**
   * Create a standard test scenario with predictable commits and branches
   */
  async createStandardScenario() {
    // Clear first
    await this.clearGraph();
    
    // Add some commits to master
    await this.addCommit(); // commit-1
    await this.addCommit(); // commit-2
    await this.addCommit(); // commit-3
    
    // Create a feature branch from commit-1
    await this.selectCommit(1); // Select commit-1
    await this.createBranch(); // Creates branch-132
    
    // Add commits to feature branch
    await this.addCommit(); // commit-4
    await this.addCommit(); // commit-5
    await this.addCommit(); // commit-6
    
    return {
      masterCommits: ['commit-0', 'commit-1', 'commit-2', 'commit-3'],
      featureBranch: 'branch-132',
      featureCommits: ['commit-4', 'commit-5', 'commit-6']
    };
  }

  /**
   * Verify that merge commit parents are in different lanes
   */
  async verifyMergeParentsInDifferentLanes(): Promise<boolean> {
    const graphState = await this.getGraphState();
    if (!graphState?.commits) return false;

    const commits = graphState.commits;
    const mergeCommits = commits.filter((c: any) => c.parentIds?.length > 1);
    
    for (const mergeCommit of mergeCommits) {
      const parentLanes = mergeCommit.parentIds.map((parentId: string) => {
        const parent = commits.find((c: any) => c.id === parentId);
        return parent?.branchLane ?? 0;
      });
      
      // Check if all parent lanes are unique
      const uniqueLanes = new Set(parentLanes);
      if (uniqueLanes.size !== parentLanes.length) {
        console.log(`Merge commit ${mergeCommit.id} has parents in same lane:`, parentLanes);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Verify no commits occupy the same position
   */
  async verifyNoOverlappingCommits(): Promise<boolean> {
    const graphState = await this.getGraphState();
    if (!graphState?.commits) return false;

    const commits = graphState.commits;
    const positions = new Set<string>();
    
    for (const commit of commits) {
      const position = `${commit.depth},${commit.branchLane}`;
      if (positions.has(position)) {
        console.log(`Position conflict at ${position} for commit ${commit.id}`);
        return false;
      }
      positions.add(position);
    }
    
    return true;
  }

  /**
   * Wait for any pending animations or state updates
   */
  async waitForStable() {
    await this.page.waitForTimeout(1000);
  }
}
