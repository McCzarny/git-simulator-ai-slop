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
  
  // Sort commits by timestamp to attempt a chronological layout primarily by depth
  const sortedCommits = Object.values(commitsMap).sort((a, b) => {
    if (a.depth === b.depth) return a.timestamp - b.timestamp;
    return a.depth - b.depth;
  });


  let maxX = 0;
  let maxY = 0;

  for (const commit of sortedCommits) {
    const x = commit.branchLane * X_SPACING + GRAPH_PADDING;
    const y = commit.depth * Y_SPACING + GRAPH_PADDING;
    const positionedCommit = { ...commit, x, y };
    positionedCommits.push(positionedCommit);

    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);

    commit.parentIds.forEach(parentId => {
      const parentCommit = Object.values(commitsMap).find(c => c.id === parentId);
      if (parentCommit) {
         // Find already positioned parent
        const positionedParent = positionedCommits.find(pc => pc.id === parentId) || 
          {...parentCommit, x: parentCommit.branchLane * X_SPACING + GRAPH_PADDING, y: parentCommit.depth * Y_SPACING + GRAPH_PADDING };

        edges.push({ from: positionedCommit, to: positionedParent });
      }
    });
  }
  
  // Fallback for edges if parent wasn't in sortedCommits yet (e.g. due to re-parenting)
  // This might be complex if order is not guaranteed. The current sort should mostly handle it.
  // A more robust solution would build an explicit graph structure first.

  return {
    positionedCommits,
    edges,
    graphWidth: maxX + X_SPACING, // Add some padding
    graphHeight: maxY + Y_SPACING, // Add some padding
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
  const [nextLaneIdx, setNextLaneIdx] = useState(1); // master is lane 0

  const [isMoveModeActive, setIsMoveModeActive] = useState(false);

  useEffect(() => {
    // Initialize with one commit and master branch
    const initialCommitId = `commit-${nextCommitIdx}`;
    const initialCommit: CommitType = {
      id: initialCommitId,
      parentIds: [],
      message: `Initial commit`,
      timestamp: Date.now(),
      branchLane: 0, // master lane
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
  }, []); // Empty dependency array, runs once on mount

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
    const newBranchName = `branch-${nextBranchNumber}`;
    const newBranchLane = nextLaneIdx;

    const newBranch: BranchType = {
      name: newBranchName,
      headCommitId: selectedCommitId, // New branch points to the selected commit
      lane: newBranchLane,
    };

    setBranches(prev => ({ ...prev, [newBranchName]: newBranch }));
    setSelectedBranchName(newBranchName); // Switch to the new branch
    setNextBranchNumber(prev => prev + 1);
    setNextLaneIdx(prev => prev + 1);
    toast({ title: "Branch Created", description: `Branch ${newBranchName} created from commit ${parentCommit.message}.` });
  }, [selectedCommitId, commits, nextBranchNumber, nextLaneIdx, toast]);

  const handleSelectCommit = useCallback((commitId: string) => {
    if (isMoveModeActive && selectedCommitId && selectedCommitId !== commitId) {
      // This case is handled by the Select in Controls
    } else {
      setSelectedCommitId(commitId);
    }
  }, [isMoveModeActive, selectedCommitId]);

  const handleSelectBranch = useCallback((branchName: string) => {
    setSelectedBranchName(branchName);
    if (branches[branchName]) {
      setSelectedCommitId(branches[branchName].headCommitId);
    }
    setIsMoveModeActive(false); // Cancel move mode if branch is changed
  }, [branches]);

  const toggleMoveMode = useCallback(() => {
    if (!selectedCommitId) {
      toast({ title: "Error", description: "Select a commit to move first.", variant: "destructive"});
      setIsMoveModeActive(false);
      return;
    }
    setIsMoveModeActive(prev => !prev);
  }, [selectedCommitId, toast]);

  const handleMoveCommit = useCallback((targetParentId: string) => {
    if (!selectedCommitId || !commits[selectedCommitId] || !commits[targetParentId]) {
      toast({ title: "Error", description: "Invalid commit selection for move operation.", variant: "destructive"});
      setIsMoveModeActive(false);
      return;
    }

    if (selectedCommitId === targetParentId) {
      toast({ title: "Error", description: "Cannot move a commit onto itself.", variant: "destructive"});
      return;
    }
    
    // Basic cycle check: ensure targetParentId is not a descendant of selectedCommitId
    let current = targetParentId;
    const visited = new Set<string>();
    while(commits[current] && commits[current].parentIds.length > 0) {
      if (visited.has(current)) break; // Cycle detected in existing graph
      visited.add(current);
      if (commits[current].parentIds.includes(selectedCommitId)) {
         toast({ title: "Error", description: "Cannot move commit: creates a cycle.", variant: "destructive"});
         setIsMoveModeActive(false);
         return;
      }
      current = commits[current].parentIds[0]; // Assuming single parent for simplicity in check
    }


    const sourceCommit = commits[selectedCommitId];
    const targetParentCommit = commits[targetParentId];

    // Update parent and depth. Branch lane might also need reconsideration but keep it simple for now.
    const updatedCommit: CommitType = {
      ...sourceCommit,
      parentIds: [targetParentId],
      depth: targetParentCommit.depth + 1,
      // branchLane could be targetParentCommit.branchLane or stay original. Let's keep original.
    };
    
    // Recursively update depths of children of the moved commit
    const updatedCommits = { ...commits, [selectedCommitId]: updatedCommit };
    function updateChildrenDepth(commitId: string, newDepth: number) {
      Object.values(updatedCommits).forEach(child => {
        if (child.parentIds.includes(commitId)) {
          updatedCommits[child.id] = { ...child, depth: newDepth + 1 };
          updateChildrenDepth(child.id, newDepth + 1);
        }
      });
    }
    updateChildrenDepth(selectedCommitId, updatedCommit.depth);

    setCommits(updatedCommits);
    setIsMoveModeActive(false);
    toast({ title: "Commit Moved", description: `Commit ${sourceCommit.message} re-parented to ${targetParentCommit.message}.`});

  }, [selectedCommitId, commits, toast]);


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
          height={Math.max(graphHeight, 400)} // Ensure minimum height
          width={Math.max(graphWidth, 600)}   // Ensure minimum width
        />
      </main>
      <footer className="text-center text-sm text-muted-foreground py-2">
        <p>Interactive Git simulation. Select commits and branches to perform actions.</p>
      </footer>
    </div>
  );
}
