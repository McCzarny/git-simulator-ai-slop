import { describe, it, expect } from 'vitest';

// Mock the CommitType and BranchType for testing
type CommitType = {
  id: string;
  parentIds: string[];
  timestamp: number;
  branchLane: number;
  depth: number;
  isCustom?: boolean;
};

type BranchType = {
  name: string;
  headCommitId: string;
  color: string;
};

// Mock constants
const GRAPH_PADDING = 50;
const X_SPACING = 120;
const Y_SPACING = 80;

// Simplified version of the calculateLayout function for testing
function testCalculateLayout(
  commitsInput: Record<string, CommitType>,
  _branchesInput: Record<string, BranchType>
) {
  let updatedCommits: Record<string, CommitType> | undefined = undefined;

  const commits = Object.values(commitsInput).sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return (a.branchLane || 0) - (b.branchLane || 0);
  });

  const commitLanes = new Map<string, number>();
  const occupiedSlots = new Map<string, string>();

  for (const commit of commits) {
    let targetLane = commitLanes.get(commit.id) ?? commit.branchLane ?? 0;

    // Parent-child conflict detection logic
    for (const parentId of commit.parentIds) {
      const parentLane = commitLanes.get(parentId);
      console.log(`Checking commit ${commit.id} (target lane ${targetLane}) against parent ${parentId} (lane ${parentLane})`);
      
      if (parentLane !== undefined && parentLane === targetLane) {
        const parent = commitsInput[parentId];
        if (parent && parent.depth < commit.depth) {
          // Check if there are any commits between parent and child in the same lane
          const minDepth = parent.depth;
          const maxDepth = commit.depth;
          let hasIntermediateCommits = false;
          
          console.log(`Checking for commits between depth ${minDepth} and ${maxDepth} in lane ${targetLane}`);
          
          for (let checkDepth = minDepth + 1; checkDepth < maxDepth; checkDepth++) {
            const slotKey = `${checkDepth},${targetLane}`;
            console.log(`Checking slot ${slotKey}: ${occupiedSlots.has(slotKey) ? 'occupied by ' + occupiedSlots.get(slotKey) : 'free'}`);
            if (occupiedSlots.has(slotKey)) {
              hasIntermediateCommits = true;
              break;
            }
          }
          
          if (hasIntermediateCommits) {
            console.log(`Found intermediate commits, moving ${commit.id} to new lane`);
            // Find an available lane for the current commit
            let newLane = targetLane + 1;
            while (occupiedSlots.has(`${commit.depth},${newLane}`)) {
              newLane++;
            }
            
            targetLane = newLane;
            console.log(`Moved ${commit.id} to lane ${newLane}`);
            
            // Track the updated commit
            if (targetLane !== (commit.branchLane ?? 0)) {
              if (!updatedCommits) {
                updatedCommits = { ...commitsInput };
              }
              updatedCommits[commit.id] = {
                ...commit,
                branchLane: targetLane
              };
            }
            break;
          }
        }
      }
    }

    // Basic lane conflict resolution
    while (occupiedSlots.has(`${commit.depth},${targetLane}`)) {
      targetLane++;
    }

    commitLanes.set(commit.id, targetLane);
    occupiedSlots.set(`${commit.depth},${targetLane}`, commit.id);
  }

  return { commitLanes, updatedCommits };
}

describe('Parent-Child Lane Conflict Resolution', () => {
  it('should move child commit when parent and child are in same lane with commits between them', () => {
    // Create test scenario:
    // commit-0 (depth 0, lane 0) - initial
    // commit-1 (depth 1, lane 0) - child of commit-0
    // commit-2 (depth 1, lane 0) - child of commit-0, same lane as commit-1
    // commit-3 (depth 2, lane 0) - child of commit-1
    // This should cause conflict: commit-3 and commit-1 are in same lane with commit-2 between them
    
    const commits: Record<string, CommitType> = {
      'commit-0': {
        id: 'commit-0',
        parentIds: [],
        timestamp: 1000,
        branchLane: 0,
        depth: 0
      },
      'commit-1': {
        id: 'commit-1',
        parentIds: ['commit-0'],
        timestamp: 2000,
        branchLane: 0,
        depth: 1
      },
      'commit-2': {
        id: 'commit-2',
        parentIds: ['commit-0'],
        timestamp: 2001,
        branchLane: 0,
        depth: 1
      },
      'commit-3': {
        id: 'commit-3',
        parentIds: ['commit-1'],
        timestamp: 3000,
        branchLane: 0,
        depth: 2
      }
    };

    const branches: Record<string, BranchType> = {};

    const result = testCalculateLayout(commits, branches);

    // Verify that commit-3 was moved to a different lane
    const commit3Lane = result.commitLanes.get('commit-3');
    const commit1Lane = result.commitLanes.get('commit-1');
    
    expect(commit3Lane).not.toBe(commit1Lane);
    expect(commit3Lane).toBeGreaterThan(0); // Should be moved to lane 1 or higher
    
    // Verify that updatedCommits contains the reassigned commit
    expect(result.updatedCommits).toBeDefined();
    expect(result.updatedCommits!['commit-3']).toBeDefined();
    expect(result.updatedCommits!['commit-3'].branchLane).toBe(commit3Lane);
  });

  it('should not move child commit when no commits are between parent and child', () => {
    // Create test scenario without intermediate commits:
    // commit-0 (depth 0, lane 0)
    // commit-1 (depth 1, lane 0) - child of commit-0
    // commit-2 (depth 2, lane 0) - child of commit-1
    // No conflict should occur
    
    const commits: Record<string, CommitType> = {
      'commit-0': {
        id: 'commit-0',
        parentIds: [],
        timestamp: 1000,
        branchLane: 0,
        depth: 0
      },
      'commit-1': {
        id: 'commit-1',
        parentIds: ['commit-0'],
        timestamp: 2000,
        branchLane: 0,
        depth: 1
      },
      'commit-2': {
        id: 'commit-2',
        parentIds: ['commit-1'],
        timestamp: 3000,
        branchLane: 0,
        depth: 2
      }
    };

    const branches: Record<string, BranchType> = {};

    const result = testCalculateLayout(commits, branches);

    // All commits should remain in their original lanes
    expect(result.commitLanes.get('commit-0')).toBe(0);
    expect(result.commitLanes.get('commit-1')).toBe(0);
    expect(result.commitLanes.get('commit-2')).toBe(0);
    
    // No commits should be updated
    expect(result.updatedCommits).toBeUndefined();
  });

  it('should handle multiple conflicts in complex scenarios', () => {
    // Create a more complex scenario:
    // commit-0 (depth 0, lane 0)
    // commit-1 (depth 1, lane 0) - branch from commit-0
    // commit-2 (depth 1, lane 1) - branch from commit-0  
    // commit-3 (depth 2, lane 0) - branch from commit-1 (conflict with commit-2 in between)
    // commit-4 (depth 2, lane 1) - branch from commit-2
    // commit-5 (depth 3, lane 1) - branch from commit-4 (conflict with commit-3 potentially)
    
    const commits: Record<string, CommitType> = {
      'commit-0': {
        id: 'commit-0',
        parentIds: [],
        timestamp: 1000,
        branchLane: 0,
        depth: 0
      },
      'commit-1': {
        id: 'commit-1',
        parentIds: ['commit-0'],
        timestamp: 2000,
        branchLane: 0,
        depth: 1
      },
      'commit-2': {
        id: 'commit-2',
        parentIds: ['commit-0'],
        timestamp: 2001,
        branchLane: 1,
        depth: 1
      },
      'commit-3': {
        id: 'commit-3',
        parentIds: ['commit-1'],
        timestamp: 3000,
        branchLane: 0,
        depth: 2
      },
      'commit-4': {
        id: 'commit-4',
        parentIds: ['commit-2'],
        timestamp: 3001,
        branchLane: 1,
        depth: 2
      },
      'commit-5': {
        id: 'commit-5',
        parentIds: ['commit-4'],
        timestamp: 4000,
        branchLane: 1,
        depth: 3
      }
    };

    const branches: Record<string, BranchType> = {};

    const result = testCalculateLayout(commits, branches);

    // Verify that all commits have different positions
    const positions = new Set();
    for (const [commitId, lane] of result.commitLanes.entries()) {
      const commit = commits[commitId];
      const position = `${commit.depth},${lane}`;
      expect(positions.has(position)).toBe(false);
      positions.add(position);
    }
  });
});
