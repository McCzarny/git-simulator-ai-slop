
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
      if(a.timestamp === b.timestamp) return a.branchLane - b.branchLane;
      return a.timestamp - b.timestamp;
    }
    return a.depth - b.depth;
  });

  let maxX = 0;
  let maxY = 0;

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
  
  for (const positionedCommit of positionedCommits) {
    positionedCommit.parentIds.forEach(parentId => {
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
      headCommitId: selectedCommitId,
      lane: newBranchLane,
    };

    setBranches(prev => ({ ...prev, [newBranchName]: newBranch }));
    setSelectedBranchName(newBranchName); 
    setNextBranchNumber(prev => prev + 1);
    setNextLaneIdx(prev => prev + 1); 
    toast({ title: "Branch Created", description: `Branch ${newBranchName} created from commit ${parentCommit.message.substring(0,8)}.` });
  }, [selectedCommitId, commits, nextBranchNumber, nextLaneIdx, toast]);

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
            if(visited.has(currentId)) return false; 
            visited.add(currentId);
            if (currentId === potentialAncestorId) return true;
            if (graph[currentId].parentIds.length > 0) {
                currentId = graph[currentId].parentIds[0]; 
            } else {
                currentId = undefined;
            }
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

    newCommitsState[commitToMoveId] = {
      ...sourceCommit,
      parentIds: [newParentId],
      depth: targetParentCommit.depth + 1,
      branchLane: targetParentCommit.branchLane, // Update branchLane
    };
    
    const queue: string[] = [commitToMoveId];
    const visitedForUpdate = new Set<string>();

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        
        if (visitedForUpdate.has(currentId)) continue;
        visitedForUpdate.add(currentId);

        const currentCommitData = newCommitsState[currentId];

        Object.values(newCommitsState).forEach(childCommit => {
            if (childCommit.parentIds.includes(currentId)) {
                const newChildDepth = currentCommitData.depth + 1;
                const newChildLane = currentCommitData.branchLane; // Children inherit parent's lane

                if (newCommitsState[childCommit.id].depth !== newChildDepth || newCommitsState[childCommit.id].branchLane !== newChildLane) {
                    newCommitsState[childCommit.id] = {
                        ...childCommit,
                        depth: newChildDepth,
                        branchLane: newChildLane,
                    };
                }
                if (!visitedForUpdate.has(childCommit.id)) {
                    queue.push(childCommit.id);
                }
            }
        });
    }

    setCommits(newCommitsState);
    setIsMoveModeActive(false);
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
