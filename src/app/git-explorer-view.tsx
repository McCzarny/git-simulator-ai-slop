
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
      const commitNumberStr = id.split('-')[1];
      const message = branchName && branchName !== INITIAL_BRANCH_NAME
        ? `${messagePrefix} ${commitNumberStr} (on ${branchName})`
        : `${messagePrefix} ${commitNumberStr}`;
      return {
        id,
        parentIds,
        message,
        timestamp: currentTime,
        branchLane,
        depth,
      };
    };

    const appendCommitsToBranch = (
      startingParentCommit: CommitType,
      branchNameForMessage: string,
      numberOfCommits: number,
      branchLaneForLayout: number,
      targetCommitsMap: Record<string, CommitType>
    ): string => {
      let currentParentIdInSequence = startingParentCommit.id;
      let currentDepthInSequence = startingParentCommit.depth + 1;
      let headOfThisSequence = '';

      for (let i = 0; i < numberOfCommits; i++) {
        const newCommit = createCommit(
          [currentParentIdInSequence],
          `Commit`,
          branchLaneForLayout,
          currentDepthInSequence,
          branchNameForMessage
        );
        targetCommitsMap[newCommit.id] = newCommit;
        currentParentIdInSequence = newCommit.id;
        headOfThisSequence = newCommit.id;
        currentDepthInSequence++;
      }
      return headOfThisSequence;
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
        currentDepthMaster,
        masterBranchName 
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

    // --- BRANCH 134 ---
    const branch134Name = '134';
    const parentForBranch134 = initialCommits[masterCommitsIds[2]]; 
    const branch134Lane = currentLane;
    const branch134HeadId = appendCommitsToBranch(parentForBranch134, branch134Name, 3, branch134Lane, initialCommits);
    initialBranches[branch134Name] = {
      name: branch134Name,
      headCommitId: branch134HeadId,
      lane: branch134Lane,
    };
    currentLane++;

    // --- BRANCH 136 ---
    const branch136Name = '136';
    const parentForBranch136 = initialCommits[masterCommitsIds[4]]; 
    const branch136Lane = currentLane;
    const branch136HeadId = appendCommitsToBranch(parentForBranch136, branch136Name, 4, branch136Lane, initialCommits);
    initialBranches[branch136Name] = {
      name: branch136Name,
      headCommitId: branch136HeadId,
      lane: branch136Lane,
    };
    currentLane++;
    
    // --- BRANCH 139 ---
    const branch139Name = '139';
    const parentForBranch139 = initialCommits[masterCommitsIds[7]]; 
    const branch139Lane = currentLane;
    const branch139HeadId = appendCommitsToBranch(parentForBranch139, branch139Name, 5, branch139Lane, initialCommits);
    initialBranches[branch139Name] = {
      name: branch139Name,
      headCommitId: branch139HeadId,
      lane: branch139Lane,
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
    const commitNumberStr = newCommitId.split('-')[1];
    const message = currentBranch.name !== INITIAL_BRANCH_NAME
        ? `Commit ${commitNumberStr} (on ${currentBranch.name})`
        : `Commit ${commitNumberStr}`;

    const newCommit: CommitType = {
      id: newCommitId,
      parentIds: [parentCommit.id],
      message: message,
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
    const newBranchName = `${nextBranchNumber}`;
    const newBranchLane = nextLaneIdx; 

    const newCommitId = `commit-${nextCommitIdx}`;
    const commitNumberStr = newCommitId.split('-')[1];
    const message = `Commit ${commitNumberStr} (on ${newBranchName})`;
    
    const newBranchInitialCommit: CommitType = {
        id: newCommitId,
        parentIds: [selectedCommitId],
        message: message,
        timestamp: Date.now(), 
        branchLane: newBranchLane, 
        depth: parentCommitForBranch.depth + 1,
    };
    
    const newBranchDef: BranchType = {
      name: newBranchName,
      headCommitId: newCommitId, 
      lane: newBranchLane,
    };

    setCommits(prevCommits => ({ ...prevCommits, [newCommitId]: newBranchInitialCommit }));
    setBranches(prevBranches => ({
      ...prevBranches,
      [newBranchName]: newBranchDef,
    }));
    
    setSelectedBranchName(newBranchName); 
    setSelectedCommitId(newCommitId); 
    setNextCommitIdx(prev => prev + 1);
    setNextBranchNumber(prev => prev + 1);
    setNextLaneIdx(prev => prev + 1);
    toast({ title: "Branch Created", description: `Branch ${newBranchName} created from ${parentCommitForBranch.message.substring(0,8)}. New commit ${newBranchInitialCommit.message.substring(0,15)} added to ${newBranchName}.` });
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

        for (const potentialChildId in newCommitsState) {
            const potentialChildCommit = newCommitsState[potentialChildId];
            if (potentialChildCommit.parentIds.includes(currentProcessedParentId) && 
                potentialChildId !== commitToMoveId && 
                !visitedInThisBFSRecalculation.has(potentialChildId)) { 
                
                 newCommitsState[potentialChildId] = {
                    ...potentialChildCommit,
                    depth: currentProcessedParentData.depth + 1,
                    branchLane: currentProcessedParentData.branchLane,
                    timestamp: movedCommitTime + descendantTimestampCounter++,
                };
                visitedInThisBFSRecalculation.add(potentialChildId);
                queue.push(potentialChildId); 
            }
        }
    }
    setCommits(newCommitsState);
    setIsMoveModeActive(false);
    setSelectedCommitId(commitToMoveId); 
    toast({ title: "Commit Moved", description: `Commit ${sourceCommit.message.substring(0,8)} re-parented to ${targetParentCommit.message.substring(0,8)}.`});

  }, [commits, toast]);

  const handleMergeBranch = useCallback((sourceBranchNameToMerge: string) => {
    if (!selectedBranchName || !branches[selectedBranchName]) {
      toast({ title: "Error", description: "No target branch selected for merge.", variant: "destructive" });
      return;
    }
    if (!branches[sourceBranchNameToMerge]) {
      toast({ title: "Error", description: "Source branch for merge not found.", variant: "destructive" });
      return;
    }
    if (selectedBranchName === sourceBranchNameToMerge) {
      toast({ title: "Error", description: "Cannot merge a branch into itself.", variant: "destructive" });
      return;
    }

    const targetBranch = branches[selectedBranchName];
    const sourceBranch = branches[sourceBranchNameToMerge];

    const targetHeadCommit = commits[targetBranch.headCommitId];
    const sourceHeadCommit = commits[sourceBranch.headCommitId];

    if (!targetHeadCommit || !sourceHeadCommit) {
      toast({ title: "Error", description: "Head commit not found for one or both branches.", variant: "destructive" });
      return;
    }
    
    // Basic check: don't merge if source head is already an ancestor of target head
    let current = targetHeadCommit;
    const visitedAncestors = new Set<string>();
    const queue = [current.id];
    visitedAncestors.add(current.id);
    let head = 0;
    while(head < queue.length){
        const currentId = queue[head++];
        const commitNode = commits[currentId];
        if(commitNode.id === sourceHeadCommit.id){
            toast({ title: "Already Merged", description: `Branch ${sourceBranchNameToMerge} is already an ancestor of ${selectedBranchName}.`, variant: "destructive"});
            return;
        }
        commitNode.parentIds.forEach(pid => {
            if(!visitedAncestors.has(pid)){
                visitedAncestors.add(pid);
                queue.push(pid);
            }
        })
    }


    const newCommitId = `commit-${nextCommitIdx}`;
    const commitNumberStr = newCommitId.split('-')[1];
    const message = `Merge branch '${sourceBranchNameToMerge}' into '${selectedBranchName}' (commit ${commitNumberStr})`;

    const newMergeCommit: CommitType = {
      id: newCommitId,
      parentIds: [targetHeadCommit.id, sourceHeadCommit.id], // Order: target first, source second
      message: message,
      timestamp: Date.now(),
      branchLane: targetBranch.lane, // Merge commit stays on the target branch's lane
      depth: targetHeadCommit.depth + 1, // Place it after the target's head
    };

    setCommits(prev => ({ ...prev, [newCommitId]: newMergeCommit }));
    setBranches(prev => ({
      ...prev,
      [targetBranch.name]: { ...targetBranch, headCommitId: newCommitId },
    }));
    
    setSelectedCommitId(newCommitId); // Select the new merge commit
    // setSelectedBranchName remains the target branch
    setNextCommitIdx(prev => prev + 1);
    toast({ title: "Merge Successful", description: `Branch '${sourceBranchNameToMerge}' merged into '${selectedBranchName}'. New commit: ${newMergeCommit.message.substring(0,25)}...` });

  }, [selectedBranchName, branches, commits, nextCommitIdx, toast]);


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
        branches={branches} // Pass branches down
        onAddCommit={handleAddCommit}
        onCreateBranch={handleCreateBranch}
        onMoveCommit={handleMoveCommit}
        onMergeBranch={handleMergeBranch} // Pass merge handler
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

