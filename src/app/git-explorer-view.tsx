
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
      // Secondary sort by timestamp if depths are equal, could also use branchLane
      if(a.timestamp === b.timestamp) return a.branchLane - b.branchLane;
      return a.timestamp - b.timestamp;
    }
    return a.depth - b.depth;
  });

  let maxX = 0;
  let maxY = 0;

  // Create a map for quick lookup of already positioned commits during edge creation
  const tempPositionedCommitsMap: Record<string, PositionedCommit> = {};

  for (const commit of sortedCommits) {
    const x = commit.branchLane * X_SPACING + GRAPH_PADDING;
    const y = commit.depth * Y_SPACING + GRAPH_PADDING;
    const positionedCommit = { ...commit, x, y };
    positionedCommits.push(positionedCommit);
    tempPositionedCommitsMap[commit.id] = positionedCommit;

    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  
  // Iterate again for edges now that all positions are calculated
  for (const positionedCommit of positionedCommits) {
    positionedCommit.parentIds.forEach(parentId => {
      // Parent might not be in sortedCommits if graph is malformed or during updates
      // but should be in commitsMap or tempPositionedCommitsMap
      const parentFromMap = tempPositionedCommitsMap[parentId] || 
                           (commitsMap[parentId] ? 
                            { ...commitsMap[parentId], 
                              x: commitsMap[parentId].branchLane * X_SPACING + GRAPH_PADDING, 
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
    graphWidth: maxX + X_SPACING, // Add padding/spacing for the last node
    graphHeight: maxY + Y_SPACING, // Add padding/spacing for the last node
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
  const [nextLaneIdx, setNextLaneIdx] = useState(1); // Master is lane 0

  const [isMoveModeActive, setIsMoveModeActive] = useState(false); // For legacy button-based move

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
  }, []); // nextCommitIdx removed from deps as it's managed internally for ID generation

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
    setSelectedCommitId(newCommitId); // Select the new commit
    setNextCommitIdx(prev => prev + 1);
    toast({ title: "Commit Added", description: `${newCommit.message} added to branch ${currentBranch.name}.` });
  }, [selectedBranchName, branches, commits, nextCommitIdx, toast]);

  const handleCreateBranch = useCallback(() => {
    if (!selectedCommitId || !commits[selectedCommitId]) {
       toast({ title: "Error", description: "No commit selected to create branch from.", variant: "destructive" });
      return;
    }

    const parentCommit = commits[selectedCommitId];
    const newBranchName = `${nextBranchNumber}`; // Branch name is just the number
    const newBranchLane = nextLaneIdx;

    const newBranch: BranchType = {
      name: newBranchName,
      headCommitId: selectedCommitId, // New branch points to the selected commit
      lane: newBranchLane,
    };

    setBranches(prev => ({ ...prev, [newBranchName]: newBranch }));
    setSelectedBranchName(newBranchName); // Select the new branch
    // setSelectedCommitId(selectedCommitId); // Keep selected commit, or new branch head
    setNextBranchNumber(prev => prev + 1);
    setNextLaneIdx(prev => prev + 1); // Ensure unique lanes for new branches
    toast({ title: "Branch Created", description: `Branch ${newBranchName} created from commit ${parentCommit.message.substring(0,8)}.` });
  }, [selectedCommitId, commits, nextBranchNumber, nextLaneIdx, toast]);

  const handleSelectCommit = useCallback((commitId: string) => {
    setSelectedCommitId(commitId);
    // Do not setIsMoveModeActive(false) here, as selection is also part of move mode
  }, []);

  const handleSelectBranch = useCallback((branchName: string) => {
    setSelectedBranchName(branchName);
    if (branches[branchName]) {
      setSelectedCommitId(branches[branchName].headCommitId);
    }
    setIsMoveModeActive(false); // Cancel legacy move mode if branch is selected
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
    const currentCommits = {...commits}; // Work on a copy for validation

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

    // Cycle detection: Check if newParentId is a descendant of commitToMoveId OR
    // if commitToMoveId is an ancestor of newParentId (which is caught by checking if newParent is commitToMove)
    // More robust: is newParentId reachable from commitToMoveId by following child paths (means newParent is descendant)
    // Or is commitToMoveId reachable from newParentId by following parent paths (means commitToMove is ancestor)
    const isAncestor = (potentialAncestorId: string, commitId: string, graph: Record<string, CommitType>): boolean => {
        let currentId: string | undefined = commitId;
        const visited = new Set<string>();
        while(currentId && graph[currentId]) {
            if(visited.has(currentId)) return false; // Cycle in existing graph
            visited.add(currentId);
            if (currentId === potentialAncestorId) return true;
            if (graph[currentId].parentIds.length > 0) {
                 // Check all parents, though for this model mostly single parent after move
                 // For simplicity, we'll assume the first parent is the main line for ancestry check here.
                 // A true multi-parent ancestry check is more complex.
                currentId = graph[currentId].parentIds[0]; 
            } else {
                currentId = undefined;
            }
        }
        return false;
    };
    
    if (isAncestor(commitToMoveId, newParentId, currentCommits)) {
         toast({ title: "Error", description: "Cannot move commit: creates a cycle (making an ancestor its own descendant).", variant: "destructive"});
         setIsMoveModeActive(false);
         return;
    }

    const sourceCommit = currentCommits[commitToMoveId];
    const targetParentCommit = currentCommits[newParentId];
    
    // Create a new state for commits
    const newCommitsState = { ...currentCommits };

    // Update the moved commit
    newCommitsState[commitToMoveId] = {
      ...sourceCommit,
      parentIds: [newParentId],
      depth: targetParentCommit.depth + 1,
      // branchLane: targetParentCommit.branchLane, // Optional: align lane with new parent
    };
    
    // BFS queue for updating depths of descendants
    const queue: string[] = [commitToMoveId];
    const visitedForDepthUpdate = new Set<string>(); // To avoid reprocessing in case of complex graph structures

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        
        if (visitedForDepthUpdate.has(currentId) && currentId !== commitToMoveId) continue; // Skip if already processed, unless it's the start
        visitedForDepthUpdate.add(currentId);

        const parentCommitForCurrent = newCommitsState[currentId]; // This commit's depth is now set (or being set)

        // Find children of currentId and update their depths
        Object.values(newCommitsState).forEach(childCommit => {
            if (childCommit.parentIds.includes(currentId)) {
                const newChildDepth = parentCommitForCurrent.depth + 1;
                if (newCommitsState[childCommit.id].depth !== newChildDepth) {
                    newCommitsState[childCommit.id] = {
                        ...childCommit,
                        depth: newChildDepth,
                        // Optionally update child's branchLane if it should follow parent
                        // branchLane: parentCommitForCurrent.branchLane,
                    };
                }
                 // Add child to queue for its descendants to be processed
                if (!visitedForDepthUpdate.has(childCommit.id)) { // Check before adding
                    queue.push(childCommit.id);
                }
            }
        });
    }

    setCommits(newCommitsState);
    setIsMoveModeActive(false); // Deactivate legacy move mode after any move
    toast({ title: "Commit Moved", description: `Commit ${sourceCommit.message.substring(0,8)} re-parented to ${targetParentCommit.message.substring(0,8)}.`});

  }, [commits, toast]);


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
