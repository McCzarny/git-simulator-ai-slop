
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
  branchesInput: Readonly<Record<string, BranchType>>
): { positionedCommits: PositionedCommit[]; edges: Edge[]; graphWidth: number; graphHeight: number } {
  const positionedCommits: PositionedCommit[] = [];
  const edges: Edge[] = [];

  const commitsMap = { ...commitsInput }; 

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

  for (const commitData of sortedCommits) { 
    const xPos = (commitData.branchLane || 0) * X_SPACING + GRAPH_PADDING;
    const yPos = commitData.depth * Y_SPACING + GRAPH_PADDING;
    
    const positionedCommit: PositionedCommit = { 
      ...commitData, 
      x: xPos, 
      y: yPos 
    };
    positionedCommits.push(positionedCommit);
    tempPositionedCommitsMap[commitData.id] = positionedCommit;

    maxX = Math.max(maxX, xPos);
    maxY = Math.max(maxY, yPos);
  }
  
  for (const currentPositionedCommit of positionedCommits) {
    currentPositionedCommit.parentIds.forEach(parentId => {
      const parentPositionedCommit = tempPositionedCommitsMap[parentId];
      if (parentPositionedCommit) {
        edges.push({ from: currentPositionedCommit, to: parentPositionedCommit });
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
  const [nextLaneIdx, setNextLaneIdx] = useState(0); 

  const [isMoveModeActive, setIsMoveModeActive] = useState(false);

  useEffect(() => {
    const initialCommits: Record<string, CommitType> = {};
    const initialBranches: Record<string, BranchType> = {};
    let commitCounter = 0;
    let currentLane = 0;
    let currentTime = Date.now();

    const createCommit = (
      parentIds: string[],
      messagePrefix: string,
      branchLane: number,
      depth: number,
      branchName?: string
    ): CommitType => {
      const id = `commit-${commitCounter++}`;
      currentTime++; 
      const message = branchName 
        ? `${messagePrefix} ${id.split('-')[1]} (on ${branchName})`
        : `${messagePrefix} ${id.split('-')[1]}`;
      return {
        id,
        parentIds,
        message,
        timestamp: currentTime,
        branchLane,
        depth,
      };
    };

    // --- MASTER BRANCH ---
    const masterBranchName = INITIAL_BRANCH_NAME;
    let parentCommitIdMaster: string | null = null;
    let currentDepthMaster = 0;
    const masterCommitsIds: string[] = [];

    for (let i = 0; i < 10; i++) {
      const newCommit = createCommit(
        parentCommitIdMaster ? [parentCommitIdMaster] : [],
        `Commit`,
        currentLane,
        currentDepthMaster
      );
      initialCommits[newCommit.id] = newCommit;
      masterCommitsIds.push(newCommit.id);
      parentCommitIdMaster = newCommit.id;
      currentDepthMaster++;
    }
    initialBranches[masterBranchName] = {
      name: masterBranchName,
      headCommitId: parentCommitIdMaster!,
      lane: currentLane,
    };
    currentLane++;

    // --- BRANCH 139 ---
    const branch139Name = '139';
    const parentForBranch139 = initialCommits[masterCommitsIds[7]]; // 8th commit on master (index 7)
    let parentCommitIdBranch139 = parentForBranch139.id;
    let currentDepthBranch139 = parentForBranch139.depth + 1;
    const branch139Lane = currentLane;

    for (let i = 0; i < 5; i++) {
      const newCommit = createCommit(
        [parentCommitIdBranch139],
        `Commit`,
        branch139Lane,
        currentDepthBranch139,
        branch139Name
      );
       if (i > 0 || initialCommits[newCommit.id]?.parentIds[0] !== parentForBranch139.id) {
         newCommit.parentIds = [parentCommitIdBranch139];
      }
      initialCommits[newCommit.id] = newCommit;
      parentCommitIdBranch139 = newCommit.id;
      currentDepthBranch139++;
    }
    initialBranches[branch139Name] = {
      name: branch139Name,
      headCommitId: parentCommitIdBranch139,
      lane: branch139Lane,
    };
    currentLane++;

    // --- BRANCH 136 ---
    const branch136Name = '136';
    const parentForBranch136 = initialCommits[masterCommitsIds[4]]; // 5th commit on master (index 4)
    let parentCommitIdBranch136 = parentForBranch136.id;
    let currentDepthBranch136 = parentForBranch136.depth + 1;
    const branch136Lane = currentLane;

    for (let i = 0; i < 4; i++) {
      const newCommit = createCommit(
        [parentCommitIdBranch136],
        `Commit`,
        branch136Lane,
        currentDepthBranch136,
        branch136Name
      );
      if (i > 0 || initialCommits[newCommit.id]?.parentIds[0] !== parentForBranch136.id) {
         newCommit.parentIds = [parentCommitIdBranch136];
      }
      initialCommits[newCommit.id] = newCommit;
      parentCommitIdBranch136 = newCommit.id;
      currentDepthBranch136++;
    }
    initialBranches[branch136Name] = {
      name: branch136Name,
      headCommitId: parentCommitIdBranch136,
      lane: branch136Lane,
    };
    currentLane++;

    // --- BRANCH 134 ---
    const branch134Name = '134';
    const parentForBranch134 = initialCommits[masterCommitsIds[2]]; // 3rd commit on master (index 2)
    let parentCommitIdBranch134 = parentForBranch134.id;
    let currentDepthBranch134 = parentForBranch134.depth + 1;
    const branch134Lane = currentLane;

    for (let i = 0; i < 3; i++) {
      const newCommit = createCommit(
        [parentCommitIdBranch134], // First commit on branch has master commit as parent
        `Commit`,
        branch134Lane,
        currentDepthBranch134,
        branch134Name
      );
        // For subsequent commits on this branch, the parent is the previous commit on this branch
      if (i > 0 || initialCommits[newCommit.id]?.parentIds[0] !== parentForBranch134.id) {
          newCommit.parentIds = [parentCommitIdBranch134];
      }
      initialCommits[newCommit.id] = newCommit;
      parentCommitIdBranch134 = newCommit.id;
      currentDepthBranch134++;
    }
    initialBranches[branch134Name] = {
      name: branch134Name,
      headCommitId: parentCommitIdBranch134,
      lane: branch134Lane,
    };
    currentLane++;    

    setCommits(initialCommits);
    setBranches(initialBranches);
    setSelectedCommitId(initialBranches[masterBranchName].headCommitId);
    setSelectedBranchName(masterBranchName);

    setNextCommitIdx(commitCounter);
    
    const numericBranchNames = Object.keys(initialBranches)
      .map(name => parseInt(name, 10))
      .filter(num => !isNaN(num));
    const maxBranchNum = numericBranchNames.length > 0 ? Math.max(...numericBranchNames) : (STARTING_BRANCH_NUMBER -1) ;
    setNextBranchNumber(Math.max(STARTING_BRANCH_NUMBER, maxBranchNum + 1));
    
    setNextLaneIdx(currentLane);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Ensure this runs only once on mount

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
      message: `Commit ${nextCommitIdx}${currentBranch.name !== INITIAL_BRANCH_NAME ? ` (on ${currentBranch.name})` : ''}`,
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
    const newBranchName = `${nextBranchNumber}`; // Use the tracked nextBranchNumber
    const newBranchLane = nextLaneIdx; // Use the tracked nextLaneIdx

    // Create the new branch definition first
    const newBranchDef: BranchType = {
      name: newBranchName,
      headCommitId: selectedCommitId, // Temporarily, will be updated by the new commit
      lane: newBranchLane,
    };
    
    // Create the first commit on the new branch
    const newCommitId = `commit-${nextCommitIdx}`;
    const newBranchInitialCommit: CommitType = {
        id: newCommitId,
        parentIds: [selectedCommitId], // Parent is the commit from which branch was created
        message: `Commit ${nextCommitIdx} (on ${newBranchName})`,
        timestamp: Date.now(),
        branchLane: newBranchLane, 
        depth: parentCommitForBranch.depth + 1, // Depth is one more than the parent commit
    };

    // Update state: add new commit, add new branch (with head pointing to new commit)
    setCommits(prevCommits => ({ ...prevCommits, [newCommitId]: newBranchInitialCommit }));
    setBranches(prevBranches => ({
      ...prevBranches,
      [newBranchName]: { ...newBranchDef, headCommitId: newCommitId }, // Update headCommitId here
    }));
    
    // Update selection and counters
    setSelectedBranchName(newBranchName); 
    setSelectedCommitId(newCommitId); 
    setNextCommitIdx(prev => prev + 1);
    setNextBranchNumber(prev => prev + 1); // Increment for next branch creation
    setNextLaneIdx(prev => prev + 1); // Increment for next lane assignment
    toast({ title: "Branch Created", description: `Branch ${newBranchName} created from ${parentCommitForBranch.message.substring(0,8)}. New commit ${newCommitId} added to ${newBranchName}.` });
  }, [selectedCommitId, commits, nextCommitIdx, nextBranchNumber, nextLaneIdx, toast]);


  const handleSelectCommit = useCallback((commitId: string) => {
    setSelectedCommitId(commitId);
    if (isMoveModeActive) {
        setIsMoveModeActive(false);
    }
  }, [isMoveModeActive]);

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
    
    let isCyclic = false;
    const q_descendants: string[] = [commitToMoveId];
    const visited_descendants = new Set<string>();
    visited_descendants.add(commitToMoveId);
    let head_desc = 0;
    while(head_desc < q_descendants.length) {
        const current_descendant = q_descendants[head_desc++];
        if (current_descendant === newParentId) {
            isCyclic = true;
            break;
        }
        for (const cid in currentCommits) {
            if (currentCommits[cid].parentIds.includes(current_descendant) && !visited_descendants.has(cid)) {
                visited_descendants.add(cid);
                q_descendants.push(cid);
            }
        }
    }

    if (isCyclic) {
         toast({ title: "Error", description: "Cannot move commit: creates a cycle.", variant: "destructive"});
         setIsMoveModeActive(false);
         return;
    }

    const sourceCommit = currentCommits[commitToMoveId];
    const targetParentCommit = currentCommits[newParentId];
    
    const newCommitsState: Record<string, CommitType> = { ...currentCommits };

    let movedCommitTime = Date.now();

    newCommitsState[commitToMoveId] = {
      ...sourceCommit,
      parentIds: [newParentId],
      depth: targetParentCommit.depth + 1,
      branchLane: targetParentCommit.branchLane, 
      timestamp: movedCommitTime, 
    };
    
    const queue: string[] = [commitToMoveId];
    const visitedInThisBFSRecalculation = new Set<string>();
    visitedInThisBFSRecalculation.add(commitToMoveId); 

    let head = 0;
    let descendantTimestampCounter = 1;

    while (head < queue.length) {
        const currentProcessedParentId = queue[head++];
        const currentProcessedParentData = newCommitsState[currentProcessedParentId];

        // Find all direct children of currentProcessedParentData
        for (const potentialChildId in newCommitsState) {
            const potentialChildCommit = newCommitsState[potentialChildId];
            if (potentialChildCommit.parentIds.includes(currentProcessedParentId) && 
                potentialChildId !== commitToMoveId && // Do not reprocess the commit that was just moved
                !visitedInThisBFSRecalculation.has(potentialChildId)) { // Ensure not already processed in this BFS
                
                 newCommitsState[potentialChildId] = {
                    ...potentialChildCommit,
                    depth: currentProcessedParentData.depth + 1,
                    branchLane: currentProcessedParentData.branchLane, // Children inherit lane
                    timestamp: movedCommitTime + descendantTimestampCounter++, // Stagger timestamps
                };
                visitedInThisBFSRecalculation.add(potentialChildId);
                queue.push(potentialChildId); // Add child to queue for its children to be processed
            }
        }
    }
    setCommits(newCommitsState);
    setIsMoveModeActive(false);
    setSelectedCommitId(commitToMoveId); 
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

