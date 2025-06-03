
"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { CommitType, BranchType, PositionedCommit, Edge } from '@/types/git';
import { GitGraph } from '@/components/git-explorer/GitGraph';
import { Controls } from '@/components/git-explorer/Controls';
import { useToast } from "@/hooks/use-toast";

const INITIAL_BRANCH_NAME = 'master';
const STARTING_BRANCH_NUMBER = 132;
const X_SPACING = 120;
const Y_SPACING = 80;
const GRAPH_PADDING = 50;

function calculateLayout(
  commitsMap: Record<string, CommitType>,
  branchesMap: Record<string, BranchType>
): { positionedCommits: PositionedCommit[]; edges: Edge[]; graphWidth: number; graphHeight: number } {
  const positionedCommits: PositionedCommit[] = [];
  const edges: Edge[] = [];

  if (Object.keys(commitsMap).length === 0) {
    return { positionedCommits, edges, graphWidth: GRAPH_PADDING * 2, graphHeight: GRAPH_PADDING * 2 };
  }
  
  const sortedCommits = Object.values(commitsMap).sort((a, b) => {
    if (a.depth === b.depth) {
      if(a.timestamp === b.timestamp) return (a.branchLane || 0) - (b.branchLane || 0);
      return a.timestamp - b.timestamp;
    }
    return a.depth - b.depth;
  });

  let maxX = 0;
  let maxY = 0;

  const tempPositionedCommitsMap: Record<string, PositionedCommit> = {};

  for (const commit of sortedCommits) {
    const x = (commit.branchLane || 0) * X_SPACING + GRAPH_PADDING;
    const y = commit.depth * Y_SPACING + GRAPH_PADDING;
    const positionedCommit = { ...commit, x, y };
    positionedCommits.push(positionedCommit);
    tempPositionedCommitsMap[commit.id] = positionedCommit;

    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  
  for (const positionedCommit of positionedCommits) {
    positionedCommit.parentIds.forEach(parentId => {
      const parentFromMap = tempPositionedCommitsMap[parentId] || 
                           (commitsMap[parentId] ? 
                            { ...commitsMap[parentId], 
                              x: (commitsMap[parentId].branchLane || 0) * X_SPACING + GRAPH_PADDING, 
                              y: commitsMap[parentId].depth * Y_SPACING + GRAPH_PADDING 
                            } : null);
      if (parentFromMap) {
        edges.push({ from: positionedCommit, to: parentFromMap });
      }
    });
  }
  
  return {
    positionedCommits,
    edges,
    graphWidth: maxX + X_SPACING,
    graphHeight: maxY + Y_SPACING,
  };
}

export default function GitExplorerView() {
  const { toast } = useToast();
  const [commits, setCommits] = useState<Record<string, CommitType>>({});
  const [branches, setBranches] = useState<Record<string, BranchType>>({});
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const [selectedBranchName, setSelectedBranchName] = useState<string | null>(INITIAL_BRANCH_NAME);
  
  const [nextCommitIdx, setNextCommitIdx] = useState(0);
  const [nextBranchNumber, setNextBranchNumber] = useState(STARTING_BRANCH_NUMBER);
  const [nextLaneIdx, setNextLaneIdx] = useState(1); 

  const [isMoveModeActive, setIsMoveModeActive] = useState(false);

  useEffect(() => {
    const initialCommitId = `commit-${nextCommitIdx}`;
    const initialCommit: CommitType = {
      id: initialCommitId,
      parentIds: [],
      message: `Initial commit`,
      timestamp: Date.now(),
      branchLane: 0,
      depth: 0,
    };
    const initialBranch: BranchType = {
      name: INITIAL_BRANCH_NAME,
      headCommitId: initialCommitId,
      lane: 0,
    };

    setCommits({ [initialCommitId]: initialCommit });
    setBranches({ [INITIAL_BRANCH_NAME]: initialBranch });
    setSelectedCommitId(initialCommitId);
    setNextCommitIdx(1);
  }, []);

  const handleAddCommit = useCallback(() => {
    if (!selectedBranchName || !branches[selectedBranchName]) {
      toast({ title: "Error", description: "No branch selected to add commit.", variant: "destructive" });
      return;
    }

    const currentBranch = branches[selectedBranchName];
    const parentCommit = commits[currentBranch.headCommitId];
    if (!parentCommit) {
      toast({ title: "Error", description: "Head commit of selected branch not found.", variant: "destructive" });
      return;
    }

    const newCommitId = `commit-${nextCommitIdx}`;
    const newCommit: CommitType = {
      id: newCommitId,
      parentIds: [parentCommit.id],
      message: `Commit ${nextCommitIdx}`,
      timestamp: Date.now(),
      branchLane: currentBranch.lane,
      depth: parentCommit.depth + 1,
    };

    setCommits(prev => ({ ...prev, [newCommitId]: newCommit }));
    setBranches(prev => ({
      ...prev,
      [currentBranch.name]: { ...currentBranch, headCommitId: newCommitId },
    }));
    setSelectedCommitId(newCommitId);
    setNextCommitIdx(prev => prev + 1);
    toast({ title: "Commit Added", description: `${newCommit.message} added to branch ${currentBranch.name}.` });
  }, [selectedBranchName, branches, commits, nextCommitIdx, toast]);

  const handleCreateBranch = useCallback(() => {
    if (!selectedCommitId || !commits[selectedCommitId]) {
       toast({ title: "Error", description: "No commit selected to create branch from.", variant: "destructive" });
      return;
    }

    const parentCommit = commits[selectedCommitId];
    const newBranchName = `${nextBranchNumber}`;
    const newBranchLane = nextLaneIdx;

    const newBranch: BranchType = {
      name: newBranchName,
      headCommitId: selectedCommitId, // Branch head is the selected commit by default
      lane: newBranchLane,
    };
    
    // Optionally, create a new commit on this new branch immediately
    const newCommitId = `commit-${nextCommitIdx}`;
    const newBranchInitialCommit: CommitType = {
        id: newCommitId,
        parentIds: [selectedCommitId], // Parent is the commit the branch was created from
        message: `Commit ${nextCommitIdx} (on ${newBranchName})`,
        timestamp: Date.now(),
        branchLane: newBranchLane,
        depth: parentCommit.depth + 1,
    };

    setCommits(prev => ({ ...prev, [newCommitId]: newBranchInitialCommit }));
    setBranches(prev => ({
      ...prev,
      [newBranchName]: { ...newBranch, headCommitId: newCommitId }, // New branch head is the new commit
    }));
    setSelectedBranchName(newBranchName); 
    setSelectedCommitId(newCommitId); // Select the new commit
    setNextCommitIdx(prev => prev + 1);
    setNextBranchNumber(prev => prev + 1);
    setNextLaneIdx(prev => prev + 1); 
    toast({ title: "Branch Created", description: `Branch ${newBranchName} created from commit ${parentCommit.message.substring(0,8)}.` });
  }, [selectedCommitId, commits, nextCommitIdx, nextBranchNumber, nextLaneIdx, toast]);

  const handleSelectCommit = useCallback((commitId: string) => {
    setSelectedCommitId(commitId);
  }, []);

  const handleSelectBranch = useCallback((branchName: string) => {
    setSelectedBranchName(branchName);
    if (branches[branchName]) {
      setSelectedCommitId(branches[branchName].headCommitId);
    }
    setIsMoveModeActive(false);
  }, [branches]);

  const toggleMoveMode = useCallback(() => {
    if (!selectedCommitId && !isMoveModeActive) {
      toast({ title: "Error", description: "Select a commit to move first.", variant: "destructive"});
      setIsMoveModeActive(false);
      return;
    }
    setIsMoveModeActive(prev => !prev);
  }, [selectedCommitId, isMoveModeActive, toast]);

  const handleMoveCommit = useCallback((commitToMoveId: string, newParentId: string) => {
    const currentCommits = {...commits}; 

    if (!currentCommits[commitToMoveId] || !currentCommits[newParentId]) {
      toast({ title: "Error", description: "Invalid commit for move operation.", variant: "destructive"});
      setIsMoveModeActive(false);
      return;
    }
    if (commitToMoveId === newParentId) {
      toast({ title: "Error", description: "Cannot move a commit onto itself.", variant: "destructive"});
      setIsMoveModeActive(false);
      return;
    }

    const isAncestor = (potentialAncestorId: string, commitId: string, graph: Record<string, CommitType>): boolean => {
        let currentId: string | undefined = commitId;
        const visited = new Set<string>();
        while(currentId && graph[currentId]) {
            if(visited.has(currentId)) return true; // Cycle detected in parent lookup path
            visited.add(currentId);
            if (currentId === potentialAncestorId) return true; // Found the ancestor
            // Check all parents; for this check, any path is sufficient.
            // For simplicity, we usually assume first parent in parentIds, but a full check would iterate parents.
            currentId = graph[currentId].parentIds.length > 0 ? graph[currentId].parentIds[0] : undefined;
        }
        return false;
    };
    
    if (isAncestor(commitToMoveId, newParentId, currentCommits)) {
         toast({ title: "Error", description: "Cannot move commit: creates a cycle.", variant: "destructive"});
         setIsMoveModeActive(false);
         return;
    }

    const sourceCommit = currentCommits[commitToMoveId];
    const targetParentCommit = currentCommits[newParentId];
    
    const newCommitsState = { ...currentCommits };

    // Update the moved commit
    newCommitsState[commitToMoveId] = {
      ...sourceCommit,
      parentIds: [newParentId],
      depth: targetParentCommit.depth + 1,
      branchLane: targetParentCommit.branchLane, 
      timestamp: Date.now(), // Update timestamp to reflect the change
    };
    
    // BFS to update depths and lanes of all descendants of the moved commit
    const queue: string[] = [commitToMoveId];
    const visitedInBFS = new Set<string>(); // Tracks nodes that have been added to the queue
    visitedInBFS.add(commitToMoveId);

    let head = 0;
    while (head < queue.length) {
        const currentAncestorId = queue[head++];
        const ancestorCommitData = newCommitsState[currentAncestorId];

        // Find all commits that list currentAncestorId as a parent
        for (const commitId in newCommitsState) {
            const potentialChild = newCommitsState[commitId];
            if (potentialChild.parentIds.includes(currentAncestorId)) {
                if (!visitedInBFS.has(potentialChild.id)) {
                    newCommitsState[potentialChild.id] = {
                        ...potentialChild,
                        depth: ancestorCommitData.depth + 1,
                        branchLane: ancestorCommitData.branchLane,
                        timestamp: Date.now() + (head * 10) // Stagger timestamps slightly for tie-breaking
                    };
                    visitedInBFS.add(potentialChild.id);
                    queue.push(potentialChild.id);
                } else {
                    // If already visited, it might be a child of another node from the moved subtree.
                    // Re-check and update if necessary (e.g. if path provides different depth/lane, though unlikely for simple reparenting)
                    // For simplicity, the first update via BFS usually suffices for tree structures.
                    // However, ensuring consistency:
                     newCommitsState[potentialChild.id] = {
                        ...newCommitsState[potentialChild.id], // use the current state from newCommitsState
                        depth: Math.max(newCommitsState[potentialChild.id].depth, ancestorCommitData.depth + 1), // Take max depth if multiple paths
                        branchLane: ancestorCommitData.branchLane, // Lane usually follows parent
                        // Timestamp update could be more complex if truly merging paths
                    };
                }
            }
        }
    }

    setCommits(newCommitsState);
    // Update branch heads if the moved commit was a head or made another commit a head
    const newBranchesState = { ...branches };
    let branchModified = false;
    for (const branchName in newBranchesState) {
        const branch = newBranchesState[branchName];
        // If moved commit was a branch head, the branch head needs to be its new parent (or stay if it has no new children)
        // This logic might need refinement depending on desired git rebase/cherry-pick like behavior.
        // For simple re-parenting, if a head is moved, its original branch might point to its new parent or become orphaned.
        // A simpler model: if a commit moves, its branch head status doesn't automatically change.
        // However, if commitToMoveId was a head, its old branch might now point to newParentId if that's logical,
        // or the branch effectively "moves" with the commit.
        // Let's assume for now branch heads are not automatically re-assigned by move, but this might be a future enhancement.
    }
    if (branchModified) {
        setBranches(newBranchesState);
    }

    setIsMoveModeActive(false);
    toast({ title: "Commit Moved", description: `Commit ${sourceCommit.message.substring(0,8)} re-parented to ${targetParentCommit.message.substring(0,8)}.`});

  }, [commits, branches, toast]);


  const { positionedCommits, edges, graphWidth, graphHeight } = useMemo(() => {
    return calculateLayout(commits, branches);
  }, [commits, branches]);

  return (
    <div className="flex flex-col h-screen p-4 gap-4 bg-background text-foreground">
      <header className="text-center py-2">
        <h1 className="text-3xl font-headline font-bold text-primary">Git Explorer</h1>
      </header>
      <Controls
        selectedBranchName={selectedBranchName}
        selectedCommitId={selectedCommitId}
        commits={commits}
        onAddCommit={handleAddCommit}
        onCreateBranch={handleCreateBranch}
        onMoveCommit={handleMoveCommit}
        isMoveModeActive={isMoveModeActive}
        toggleMoveMode={toggleMoveMode}
      />
      <main className="flex-grow">
        <GitGraph
          commits={commits}
          branches={branches}
          positionedCommits={positionedCommits}
          edges={edges}
          selectedCommitId={selectedCommitId}
          selectedBranchName={selectedBranchName}
          onCommitSelect={handleSelectCommit}
          onBranchSelect={handleSelectBranch}
          onCommitDrop={handleMoveCommit}
          height={Math.max(graphHeight, 400)}
          width={Math.max(graphWidth, 600)}
        />
      </main>
      <footer className="text-center text-sm text-muted-foreground py-2">
        <p>Interactive Git simulation. Select commits and branches to perform actions. You can drag commits to re-parent them.</p>
      </footer>
    </div>
  );
}

    