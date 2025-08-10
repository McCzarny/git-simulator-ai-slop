import { describe, it, expect } from 'vitest';
import type { CommitType, BranchType } from '@/types/git';

// Minimalna symulacja merge logic
function simulateMerge(
  commits: Record<string, CommitType>,
  branches: Record<string, BranchType>,
  targetBranchName: string,
  sourceBranchName: string,
  nextCommitIdx: number,
  getNewTimestamp: () => number
) {
  const targetBranch = branches[targetBranchName];
  const sourceBranch = branches[sourceBranchName];
  const targetHeadCommit = commits[targetBranch.headCommitId];
  const sourceHeadCommit = commits[sourceBranch.headCommitId];

  // Tworzymy merge commit
  const newCommitId = `commit-${nextCommitIdx}`;
  const newMergeCommit: CommitType = {
    id: newCommitId,
    parentIds: [targetHeadCommit.id, sourceHeadCommit.id],
    timestamp: getNewTimestamp(),
    branchLane: targetBranch.lane,
    depth: Math.max(targetHeadCommit.depth, sourceHeadCommit.depth) + 1,
    isCustom: false,
  };
  commits[newCommitId] = newMergeCommit;
  branches[targetBranchName] = { ...targetBranch, headCommitId: newCommitId };
  return { commits, branches, newCommitId };
}

describe('merge logic', () => {
  it('should create a merge commit with two parents and not modify existing commits', () => {
    // Minimalny graf
    const commits: Record<string, CommitType> = {
      'commit-0': { id: 'commit-0', parentIds: [], timestamp: 1, branchLane: 0, depth: 0, isCustom: false },
      'commit-1': { id: 'commit-1', parentIds: ['commit-0'], timestamp: 2, branchLane: 0, depth: 1, isCustom: false },
      'commit-2': { id: 'commit-2', parentIds: ['commit-1'], timestamp: 3, branchLane: 0, depth: 2, isCustom: false },
      'commit-3': { id: 'commit-3', parentIds: ['commit-2'], timestamp: 4, branchLane: 0, depth: 3, isCustom: false },
      'commit-4': { id: 'commit-4', parentIds: ['commit-3'], timestamp: 5, branchLane: 0, depth: 4, isCustom: false },
      'commit-5': { id: 'commit-5', parentIds: ['commit-4'], timestamp: 6, branchLane: 0, depth: 5, isCustom: false },
      'commit-6': { id: 'commit-6', parentIds: ['commit-3'], timestamp: 7, branchLane: 1, depth: 4, isCustom: false },
      'commit-7': { id: 'commit-7', parentIds: ['commit-6'], timestamp: 8, branchLane: 1, depth: 5, isCustom: false },
      'commit-8': { id: 'commit-8', parentIds: ['commit-7'], timestamp: 9, branchLane: 1, depth: 6, isCustom: false },
    };
    const branches: Record<string, BranchType> = {
      master: { name: 'master', headCommitId: 'commit-5', lane: 0 },
      '139': { name: '139', headCommitId: 'commit-8', lane: 1 },
    };
    const nextCommitIdx = 9;
    let ts = 10;
    const getNewTimestamp = () => ts++;

    // Symuluj merge
    const { commits: newCommits, branches: newBranches, newCommitId } = simulateMerge(
      { ...commits }, { ...branches }, 'master', '139', nextCommitIdx, getNewTimestamp
    );

    // Sprawdź merge commit
    const mergeCommit = newCommits[newCommitId];
    expect(mergeCommit).toBeDefined();
    expect(mergeCommit.parentIds).toEqual(['commit-5', 'commit-8']);
    expect(newBranches.master.headCommitId).toBe(newCommitId);
    expect(newBranches['139'].headCommitId).toBe('commit-8');
    // Żaden istniejący commit nie zmienił parentIds
    Object.entries(commits).forEach(([id, c]) => {
      expect(newCommits[id].parentIds).toEqual(c.parentIds);
    });
  });
});
