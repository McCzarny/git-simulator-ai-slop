
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
  commitsInput: Readonly<Record<string, CommitType>>,
  branchesInput: Readonly<Record<string, BranchType>> // Keep for potential future use, currently not directly used for positioning
): { positionedCommits: PositionedCommit[]; edges: Edge[]; graphWidth: number; graphHeight: number } {
  const positionedCommits: PositionedCommit[] = [];
  const edges: Edge[] = [];

  const commitsMap = { ...commitsInput }; // Work with a copy

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

  // First pass: calculate positions and populate tempPositionedCommitsMap
  for (const commitData of sortedCommits) { // commitData is of type CommitType
    const xPos = (commitData.branchLane || 0) * X_SPACING + GRAPH_PADDING;
    const yPos = commitData.depth * Y_SPACING + GRAPH_PADDING;
    
    const positionedCommit: PositionedCommit = { 
      ...commitData, // Spreads all properties of CommitType
      x: xPos, 
      y: yPos 
    };
    positionedCommits.push(positionedCommit);
    tempPositionedCommitsMap[commitData.id] = positionedCommit;

    maxX = Math.max(maxX, xPos);
    maxY = Math.max(maxY, yPos);
  }
  
  // Second pass: create edges using tempPositionedCommitsMap for lookups
  for (const currentPositionedCommit of positionedCommits) {
    currentPositionedCommit.parentIds.forEach(parentId => {
      const parentPositionedCommit = tempPositionedCommitsMap[parentId];
      // Parent should always be in tempPositionedCommitsMap due to sorting by depth (parents usually have lower depth)
      // or if not, it implies a graph structure not perfectly handled by simple depth sort (e.g. complex merges not yet supported)
      if (parentPositionedCommit) {
        edges.push({ from: currentPositionedCommit, to: parentPositionedCommit });
      } else if (commitsMap[parentId]) {
        // Fallback: if parent commit data exists but wasn't positioned (highly unlikely with current sort)
        // This indicates a potential issue in sorting or graph structure complexity not fully handled.
        // For robustness, we could try to position it here, but it's better to ensure sorting is correct.
        // console.warn(`Parent commit ${parentId} not found in tempPositionedCommitsMap for child ${currentPositionedCommit.id}`);
      }
    });
  }
  
  return {
    positionedCommits,
    edges,
    graphWidth: maxX + X_SPACING, // Add padding for the last node
    graphHeight: maxY + Y_SPACING, // Add padding for the last node
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
  const [nextLaneIdx, setNextLaneIdx] = useState(1); // Lane 0 is for master/main

  const [isMoveModeActive, setIsMoveModeActive] = useState(false);

  useEffect(() => {
    const initialCommitId = `commit-${nextCommitIdx}`;
    const initialCommit: CommitType = { // No x, y here
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
    const newCommit: CommitType = { // No x, y here
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

    const parentCommitForBranch = commits[selectedCommitId];
    const newBranchName = `${nextBranchNumber}`; // Using number as name for simplicity
    const newBranchLane = nextLaneIdx;

    const newBranchDef: BranchType = {
      name: newBranchName,
      headCommitId: selectedCommitId, 
      lane: newBranchLane,
    };
    
    const newCommitId = `commit-${nextCommitIdx}`;
    const newBranchInitialCommit: CommitType = { // No x, y here
        id: newCommitId,
        parentIds: [selectedCommitId],
        message: `Commit ${nextCommitIdx} (on ${newBranchName})`,
        timestamp: Date.now(),
        branchLane: newBranchLane, 
        depth: parentCommitForBranch.depth + 1,
    };

    setCommits(prevCommits => ({ ...prevCommits, [newCommitId]: newBranchInitialCommit }));
    setBranches(prevBranches => ({
      ...prevBranches,
      [newBranchName]: { ...newBranchDef, headCommitId: newCommitId }, 
    }));
    
    setSelectedBranchName(newBranchName); 
    setSelectedCommitId(newCommitId); 
    setNextCommitIdx(prev => prev + 1);
    setNextBranchNumber(prev => prev + 1);
    setNextLaneIdx(prev => prev + 1); 
    toast({ title: "Branch Created", description: `Branch ${newBranchName} created from ${parentCommitForBranch.message.substring(0,8)}. New commit ${newCommitId} added to ${newBranchName}.` });
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
    const currentCommits = commits; 

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
    
    // Cycle detection: Check if newParentId is a descendant of commitToMoveId
    let isCyclic = false;
    const q_descendants: string[] = [commitToMoveId];
    const visited_descendants = new Set<string>();
    visited_descendants.add(commitToMoveId);
    let head_desc = 0;
    while(head_desc < q_descendants.length) {
        const current_ancestor = q_descendants[head_desc++];
        if (current_ancestor === newParentId) {
            isCyclic = true;
            break;
        }
        for (const cid in currentCommits) {
            if (currentCommits[cid].parentIds.includes(current_ancestor)) {
                if (!visited_descendants.has(cid)) {
                    visited_descendants.add(cid);
                    q_descendants.push(cid);
                }
            }
        }
    }

    if (isCyclic) {
         toast({ title: "Error", description: "Cannot move commit: creates a cycle. The target parent cannot be a descendant of the commit being moved.", variant: "destructive"});
         setIsMoveModeActive(false);
         return;
    }

    const sourceCommit = currentCommits[commitToMoveId];
    const targetParentCommit = currentCommits[newParentId];
    
    const newCommitsState: Record<string, CommitType> = { ...currentCommits };

    newCommitsState[commitToMoveId] = {
      ...sourceCommit, // Spreads CommitType properties (id, message, etc.)
      parentIds: [newParentId],
      depth: targetParentCommit.depth + 1,
      branchLane: targetParentCommit.branchLane, 
      timestamp: Date.now(), 
    };
    
    const queue: string[] = [commitToMoveId];
    const visitedInBFS = new Set<string>([commitToMoveId]); // Should be just commitToMoveId initially
    let head = 0;

    while (head < queue.length) {
        const currentAncestorId = queue[head++];
        const ancestorCommitData = newCommitsState[currentAncestorId];

        for (const commitId in newCommitsState) {
            // Check if commitId is a child of currentAncestorId
            // Ensure we are looking at the version from newCommitsState for parentIds check
            if (newCommitsState[commitId].parentIds.includes(currentAncestorId) && commitId !== currentAncestorId) {
                 // Check if it's already processed or part of the original moved commit's old subtree path
                if (!visitedInBFS.has(commitId)) {
                    newCommitsState[commitId] = {
                        ...newCommitsState[commitId], // Spread existing data of the child
                        depth: ancestorCommitData.depth + 1,
                        branchLane: ancestorCommitData.branchLane,
                        timestamp: Date.now() + (head * 10) 
                    };
                    visitedInBFS.add(commitId);
                    queue.push(commitId);
                }
            }
        }
    }
    setCommits(newCommitsState);
    setIsMoveModeActive(false);
    toast({ title: "Commit Moved", description: `Commit ${sourceCommit.message.substring(0,8)} re-parented to ${targetParentCommit.message.substring(0,8)}.`});

  }, [commits, branches, toast]);


  const { positionedCommits, edges, graphWidth, graphHeight } = useMemo(() => {
    // Ensure commits and branches are treated as immutable for useMemo dependency
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
        commits={commits} // Pass original commits map
        onAddCommit={handleAddCommit}
        onCreateBranch={handleCreateBranch}
        onMoveCommit={handleMoveCommit}
        isMoveModeActive={isMoveModeActive}
        toggleMoveMode={toggleMoveMode}
      />
      <main className="flex-grow">
        <GitGraph
          commits={commits} // Pass original commits map for any potential lookups if needed
          branches={branches}
          positionedCommits={positionedCommits} // These are the ones with x,y for rendering
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
