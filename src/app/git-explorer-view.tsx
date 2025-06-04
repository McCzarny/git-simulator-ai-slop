
"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { CommitType, BranchType, PositionedCommit, Edge } from '@/types/git';
import { GitGraph } from '@/components/git-explorer/GitGraph';
import { Controls } from '@/components/git-explorer/Controls';
import { useToast } from "@/hooks/use-toast";

const INITIAL_BRANCH_NAME = 'master';
const X_SPACING = 120;
const Y_SPACING = 80;
const GRAPH_PADDING = 50;

// Helper to determine the conceptual fork parent for a branch for sorting lanes
function getForkParentInfo(branch: BranchType, allCommits: Readonly<Record<string, CommitType>>, allBranches: Readonly<Record<string, BranchType>>): { forkParentDepth: number; headTimestamp: number } {
  const headCommit = allCommits[branch.headCommitId];
  if (!headCommit) return { forkParentDepth: -1, headTimestamp: 0 };

  if (headCommit.parentIds.length > 0) {
    const parentCommit = allCommits[headCommit.parentIds[0]]; // Simpler: check first parent
    return {
      forkParentDepth: parentCommit ? parentCommit.depth : headCommit.depth -1,
      headTimestamp: headCommit.timestamp
    };
  }
  return { forkParentDepth: headCommit.depth > 0 ? headCommit.depth -1 : -1, headTimestamp: headCommit.timestamp };
}


// Recalculates lanes for all branches and updates commit lanes accordingly
function recalculateAndAssignLanes(
  currentCommits: Readonly<Record<string, CommitType>>,
  currentBranches: Readonly<Record<string, BranchType>>
): { updatedCommits: Record<string, CommitType>; updatedBranches: Record<string, BranchType> } {
  const newCommitsState = { ...currentCommits }; // Make a mutable copy for this function's scope
  const newBranchesState = { ...currentBranches }; // Make a mutable copy

  const nonMasterBranchesInfo = Object.values(newBranchesState)
    .filter(b => b.name !== INITIAL_BRANCH_NAME)
    .map(b => ({
      branchName: b.name,
      ...getForkParentInfo(b, newCommitsState, newBranchesState)
    }));

  // Sort: Higher forkParentDepth (later fork) first. Then later headTimestamp first.
  nonMasterBranchesInfo.sort((a, b) => {
    if (a.forkParentDepth !== b.forkParentDepth) {
      return b.forkParentDepth - a.forkParentDepth;
    }
    return b.headTimestamp - a.headTimestamp;
  });

  // Assign lanes based on sorted order
  if (newBranchesState[INITIAL_BRANCH_NAME]) {
    newBranchesState[INITIAL_BRANCH_NAME].lane = 0;
  }
  let laneCounter = 1;
  for (const info of nonMasterBranchesInfo) {
    if (newBranchesState[info.branchName]) {
      newBranchesState[info.branchName].lane = laneCounter++;
    }
  }

  // Update branchLane for all commits
  // This part needs to be robust to correctly assign lanes based on the new branch order
  const commitLaneAssigned = new Set<string>();

  // Master commits first
  if (newBranchesState[INITIAL_BRANCH_NAME]) {
    const masterHead = newBranchesState[INITIAL_BRANCH_NAME].headCommitId;
    const q: string[] = [masterHead];
    const visited = new Set([masterHead]);
    let head = 0;
    while(head < q.length) {
        const commitId = q[head++];
        if (newCommitsState[commitId]) {
            newCommitsState[commitId] = { ...newCommitsState[commitId], branchLane: 0 };
            commitLaneAssigned.add(commitId);
            newCommitsState[commitId].parentIds.forEach(pId => {
                if (newCommitsState[pId] && !visited.has(pId)) {
                    visited.add(pId);
                    q.push(pId);
                }
            });
        }
    }
  }

  // Other branches, in their new lane order
  const sortedBranchNames = Object.keys(newBranchesState).sort((a,b) => (newBranchesState[a]?.lane ?? Infinity) - (newBranchesState[b]?.lane ?? Infinity));

  for (const branchName of sortedBranchNames) {
    if (branchName === INITIAL_BRANCH_NAME) continue;
    const branch = newBranchesState[branchName];
    if (!branch) continue;
    const branchLane = branch.lane;
    
    const q: string[] = [branch.headCommitId];
    const visitedOnThisBranchPath = new Set([branch.headCommitId]);
    let head = 0;
    while(head < q.length) {
        const commitId = q[head++];
        const currentCommit = newCommitsState[commitId];
        if (!currentCommit) continue;

        // If already processed by a branch with a "closer" (smaller or equal) lane, stop for this path
        if (commitLaneAssigned.has(commitId) && currentCommit.branchLane <= branchLane) {
            if (currentCommit.branchLane < branchLane) continue;
        }
        
        newCommitsState[commitId] = { ...currentCommit, branchLane: branchLane };
        commitLaneAssigned.add(commitId);

        currentCommit.parentIds.forEach(pId => {
            if (newCommitsState[pId] && !visitedOnThisBranchPath.has(pId)) {
                if (!commitLaneAssigned.has(pId) || newCommitsState[pId].branchLane > branchLane) {
                    visitedOnThisBranchPath.add(pId);
                    q.push(pId);
                }
            }
        });
    }
  }
  return { updatedCommits: newCommitsState, updatedBranches: newBranchesState };
}


function calculateLayout(
  commitsInput: Readonly<Record<string, CommitType>>,
  branchesInput: Readonly<Record<string, BranchType>> // branchesInput might not be strictly needed if commits have correct lanes
): { positionedCommits: PositionedCommit[]; edges: Edge[]; graphWidth: number; graphHeight: number } {
  const positionedCommits: PositionedCommit[] = [];
  const edges: Edge[] = [];
  
  const commitsMap = { ...commitsInput };

  if (Object.keys(commitsMap).length === 0) {
    return { positionedCommits, edges, graphWidth: GRAPH_PADDING * 2, graphHeight: GRAPH_PADDING * 2 };
  }
  
  // Sort primarily by depth, then by timestamp for tie-breaking within the same depth, then by branchLane
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
    const xPos = (commitData.branchLane || 0) * X_SPACING + GRAPH_PADDING; // Use branchLane from commit
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
  
  // Create edges
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
  const [nextBranchNumber, setNextBranchNumber] = useState(132);

  const [isMoveModeActive, setIsMoveModeActive] = useState(false);

  useEffect(() => {
    let initialCommits: Record<string, CommitType> = {};
    let initialBranches: Record<string, BranchType> = {};
    let commitCounter = 0;
    let currentTime = Date.now();

    const createCommit = (
      parentIds: string[],
      messagePrefix: string,
      branchLane: number, // Initial guess, will be recalc'd
      depth: number,
      branchName?: string
    ): CommitType => {
      const id = `commit-${commitCounter++}`;
      currentTime++; // Ensure unique timestamps
      const commitNumberStr = id.split('-')[1];
      const message = branchName && branchName !== INITIAL_BRANCH_NAME
        ? `${messagePrefix} ${commitNumberStr} (on ${branchName})`
        : `${messagePrefix} ${commitNumberStr}`;
      return { id, parentIds, message, timestamp: currentTime, branchLane, depth };
    };

    const appendCommitsToBranch = (
      startingParentCommit: CommitType,
      branchNameForMessage: string,
      numberOfCommits: number,
      initialLaneGuess: number, 
      targetCommitsMap: Record<string, CommitType>
    ): string => {
      let currentParentIdInSequence = startingParentCommit.id;
      let currentDepthInSequence = startingParentCommit.depth + 1;
      let headOfThisSequence = '';
      for (let i = 0; i < numberOfCommits; i++) {
        const newCommit = createCommit(
          [currentParentIdInSequence], 
          `Commit`, 
          initialLaneGuess, // Will be updated by recalculateAndAssignLanes
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
    
    // MASTER BRANCH
    const masterBranchName = INITIAL_BRANCH_NAME;
    const masterLaneInitial = 0; // Master is always lane 0
    let parentCommitIdMaster: string | null = null;
    let currentDepthMaster = 0;
    const masterCommitsIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const newCommit = createCommit(
        parentCommitIdMaster ? [parentCommitIdMaster] : [],
        `Commit`, masterLaneInitial, currentDepthMaster, masterBranchName
      );
      initialCommits[newCommit.id] = newCommit;
      masterCommitsIds.push(newCommit.id);
      parentCommitIdMaster = newCommit.id;
      currentDepthMaster++;
    }
    initialBranches[masterBranchName] = { name: masterBranchName, headCommitId: parentCommitIdMaster!, lane: masterLaneInitial };
    
    // BRANCH 139 (Latest fork from master, should get lane 1 after recalc)
    const branch139Name = '139';
    const parentForBranch139 = initialCommits[masterCommitsIds[7]]; 
    const branch139HeadId = appendCommitsToBranch(parentForBranch139, branch139Name, 5, 1, initialCommits);
    initialBranches[branch139Name] = { name: branch139Name, headCommitId: branch139HeadId, lane: 1 }; // Initial lane guess

    // BRANCH 136 (Middle fork, should get lane 2 after recalc)
    const branch136Name = '136';
    const parentForBranch136 = initialCommits[masterCommitsIds[4]]; 
    const branch136HeadId = appendCommitsToBranch(parentForBranch136, branch136Name, 4, 2, initialCommits);
    initialBranches[branch136Name] = { name: branch136Name, headCommitId: branch136HeadId, lane: 2 };
    
    // BRANCH 134 (Earliest fork, should get lane 3 after recalc)
    const branch134Name = '134';
    const parentForBranch134 = initialCommits[masterCommitsIds[2]]; 
    const branch134HeadId = appendCommitsToBranch(parentForBranch134, branch134Name, 3, 3, initialCommits);
    initialBranches[branch134Name] = { name: branch134Name, headCommitId: branch134HeadId, lane: 3 };  

    const { updatedCommits, updatedBranches } = recalculateAndAssignLanes(initialCommits, initialBranches);
    setCommits(updatedCommits);
    setBranches(updatedBranches);

    setSelectedCommitId(updatedBranches[masterBranchName].headCommitId);
    setSelectedBranchName(masterBranchName);
    setNextCommitIdx(commitCounter);
    
    const numericBranchNames = Object.keys(updatedBranches).map(name => parseInt(name, 10)).filter(num => !isNaN(num));
    const maxBranchNum = numericBranchNames.length > 0 ? Math.max(...numericBranchNames) : (132 -1) ; // Start from 132 if no numeric branches
    setNextBranchNumber(Math.max(132, maxBranchNum + 1)); // Ensure next branch number is at least 132 or max + 1
    
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Helper function to perform a git action, update state, and recalculate layout
  const performGitActionAndUpdateLayout = useCallback(<T extends Record<string, any> | void>(
    actionCallback: (
      draftCommits: Record<string, CommitType>,
      draftBranches: Record<string, BranchType>
    ) => T,
    currentCommits: Record<string, CommitType>,
    currentBranches: Record<string, BranchType>
  ): T => {
    let newCommits = { ...currentCommits };
    let newBranches = { ...currentBranches };
    
    const callbackResult = actionCallback(newCommits, newBranches);

    const { updatedCommits: finalCommits, updatedBranches: finalBranches } = recalculateAndAssignLanes(newCommits, newBranches);
    setCommits(finalCommits);
    setBranches(finalBranches);
    
    return callbackResult;
  }, [setCommits, setBranches]);


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
    const message = currentBranch.name !== INITIAL_BRANCH_NAME ? `Commit ${commitNumberStr} (on ${currentBranch.name})` : `Commit ${commitNumberStr}`;
    
    const newCommit: CommitType = {
      id: newCommitId,
      parentIds: [parentCommit.id],
      message: message,
      timestamp: Date.now(),
      branchLane: currentBranch.lane, // Inherits lane, simple append doesn't need full recalc usually
      depth: parentCommit.depth + 1,
    };
    
    // For simple commit, direct state update is fine, no full lane recalc needed.
    const newCommitsMap = { ...commits, [newCommitId]: newCommit };
    const newBranchesMap = { ...branches, [currentBranch.name]: { ...currentBranch, headCommitId: newCommitId }};
    
    setCommits(newCommitsMap);
    setBranches(newBranchesMap); // Only branch head changes

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
    
    const localNextCommitIdx = nextCommitIdx;
    const localNextBranchNumber = nextBranchNumber;

    const result = performGitActionAndUpdateLayout((draftCommits, draftBranches) => {
      const newBranchName = `${localNextBranchNumber}`;
      const newCommitId = `commit-${localNextCommitIdx}`;
      const commitNumberStr = newCommitId.split('-')[1];
      const message = `Commit ${commitNumberStr} (on ${newBranchName})`;
      
      const newBranchInitialCommit: CommitType = {
          id: newCommitId,
          parentIds: [selectedCommitId],
          message: message,
          timestamp: Date.now(),
          branchLane: 0, // Placeholder, will be updated by recalculateAndAssignLanes
          depth: parentCommitForBranch.depth + 1,
      };
      const newBranchDef: BranchType = { 
          name: newBranchName, 
          headCommitId: newCommitId, 
          lane: 0 // Placeholder
      };

      draftCommits[newCommitId] = newBranchInitialCommit;
      draftBranches[newBranchName] = newBranchDef;
      return { newBranchName, newCommitId };
    }, commits, branches);
    
    setSelectedBranchName(result.newBranchName); 
    setSelectedCommitId(result.newCommitId); 
    setNextCommitIdx(prev => prev + 1);
    setNextBranchNumber(prev => prev + 1);
    toast({ title: "Branch Created", description: `Branch ${result.newBranchName} created. Layout updated.` });
  }, [selectedCommitId, commits, branches, nextCommitIdx, nextBranchNumber, toast, performGitActionAndUpdateLayout]);

  const handleAddCustomCommits = useCallback(() => {
    if (!selectedCommitId || !commits[selectedCommitId]) {
      toast({ title: "Error", description: "No commit selected to branch from for customisations.", variant: "destructive" });
      return;
    }
    const parentCommitForBranch = commits[selectedCommitId];
    let localNextCommitIdx = nextCommitIdx;

    const result = performGitActionAndUpdateLayout((draftCommits, draftBranches) => {
      const newBranchName = `Custom`; // Fixed name for custom branch
      
      let tempParentId = selectedCommitId;
      let tempParentDepth = parentCommitForBranch.depth;
      let headOfCustomCommits = '';
      let commitTime = Date.now();

      for (let i = 0; i < 4; i++) {
        const newCommitId = `commit-${localNextCommitIdx + i}`;
        const commitNumberStr = newCommitId.split('-')[1];
        const message = `Custom Commit ${commitNumberStr} (on ${newBranchName})`;
        const newCustomCommit: CommitType = {
          id: newCommitId,
          parentIds: [tempParentId],
          message: message,
          timestamp: commitTime + i,
          branchLane: 0, // Placeholder
          depth: tempParentDepth + 1,
        };
        draftCommits[newCommitId] = newCustomCommit;
        tempParentId = newCommitId;
        tempParentDepth = newCustomCommit.depth;
        headOfCustomCommits = newCommitId;
      }
      const newBranchDef: BranchType = { 
        name: newBranchName, 
        headCommitId: headOfCustomCommits, 
        lane: 0 // Placeholder
      };
      draftBranches[newBranchName] = newBranchDef;
      return { newBranchName, headOfCustomCommits, updatedNextCommitIdx: localNextCommitIdx + 4 };
    }, commits, branches);
        
    setSelectedBranchName(result.newBranchName);
    setSelectedCommitId(result.headOfCustomCommits);
    setNextCommitIdx(result.updatedNextCommitIdx);
    // Note: We might want a different strategy for 'Custom' branch names if multiple are created.
    // For now, it will overwrite if 'Custom' already exists or create a new one.
    // This could be enhanced by appending a number to 'Custom' if it already exists.
    toast({ title: "Customisations Applied", description: `Branch ${result.newBranchName} created with 4 custom commits. Layout updated.` });
  }, [selectedCommitId, commits, branches, nextCommitIdx, toast, performGitActionAndUpdateLayout]);


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
    if (!commits[commitToMoveId] || !commits[newParentId]) {
      toast({ title: "Error", description: "Invalid commit for move operation.", variant: "destructive"});
      setIsMoveModeActive(false); return;
    }
    if (commitToMoveId === newParentId) {
      toast({ title: "Error", description: "Cannot move a commit onto itself.", variant: "destructive"});
      setIsMoveModeActive(false); return;
    }
    
    // Cycle detection
    let isCyclic = false;
    const q_descendants: string[] = [commitToMoveId];
    const visited_descendants = new Set<string>([commitToMoveId]);
    let head_desc = 0;
    while(head_desc < q_descendants.length) {
        const current_descendant = q_descendants[head_desc++];
        if (current_descendant === newParentId) { isCyclic = true; break; }
        // Check against original commits for children structure
        for (const cid in commits) { 
            if (commits[cid].parentIds.includes(current_descendant) && !visited_descendants.has(cid)) {
                visited_descendants.add(cid); q_descendants.push(cid);
            }
        }
    }
    if (isCyclic) {
         toast({ title: "Error", description: "Cannot move commit: creates a cycle.", variant: "destructive"});
         setIsMoveModeActive(false); return;
    }

    performGitActionAndUpdateLayout((draftCommits, draftBranches) => {
      const sourceCommit = draftCommits[commitToMoveId];
      const targetParentCommit = draftCommits[newParentId];
      let movedCommitTime = Date.now();
      
      draftCommits[commitToMoveId] = {
        ...sourceCommit,
        parentIds: [newParentId],
        depth: targetParentCommit.depth + 1, // Base depth update
        branchLane: targetParentCommit.branchLane, // Inherit lane, recalc will finalize
        timestamp: movedCommitTime,
      };
      
      const queue: string[] = [commitToMoveId];
      const visitedInThisBFSRecalculation = new Set<string>([commitToMoveId]);
      let head = 0;
      let descendantTimestampCounter = 1;
      while (head < queue.length) {
          const currentProcessedParentId = queue[head++];
          const currentProcessedParentData = draftCommits[currentProcessedParentId];
          // Iterate over a snapshot of original commit keys to find children
          Object.keys(commits).forEach(potentialChildId => { 
              const potentialChildCommit = commits[potentialChildId]; // Read from original to find structure
              if (potentialChildCommit.parentIds.includes(currentProcessedParentId) && 
                  potentialChildCommit.id !== commitToMoveId && // Don't reprocess the moved commit itself as a child of its old self
                  !visitedInThisBFSRecalculation.has(potentialChildCommit.id)) {
                    
                   draftCommits[potentialChildId] = { // Update in draft
                      ...draftCommits[potentialChildId], // Use current state from draft for other props
                      depth: currentProcessedParentData.depth + 1,
                      branchLane: currentProcessedParentData.branchLane, 
                      timestamp: movedCommitTime + descendantTimestampCounter++,
                  };
                  visitedInThisBFSRecalculation.add(potentialChildId);
                  queue.push(potentialChildId);
              }
          });
      }
      // Branches might need their head commit ID updated if the moved commit was a head
      // Or if a descendant of the moved commit was a head. This is complex.
      // recalculateAndAssignLanes might implicitly handle some of this by re-evaluating fork points.
      // For simplicity, we're not explicitly hunting down and updating branch heads here,
      // relying on recalculateAndAssignLanes and user actions to fix branch heads if they become detached.
    }, commits, branches);

    setIsMoveModeActive(false);
    setSelectedCommitId(commitToMoveId); // Keep the moved commit selected
    toast({ title: "Commit Moved", description: `Commit re-parented. Layout updated.`});
  }, [commits, branches, toast, performGitActionAndUpdateLayout]); 

  const handleMergeBranch = useCallback((sourceBranchNameToMerge: string) => {
    if (!selectedBranchName || !branches[selectedBranchName]) {
      toast({ title: "Error", description: "No target branch selected for merge.", variant: "destructive" }); return;
    }
    const targetBranch = branches[selectedBranchName];
    if (!branches[sourceBranchNameToMerge]) {
      toast({ title: "Error", description: "Source branch for merge not found.", variant: "destructive" }); return;
    }
    if (selectedBranchName === sourceBranchNameToMerge) {
      toast({ title: "Error", description: "Cannot merge a branch into itself.", variant: "destructive" }); return;
    }

    const sourceBranch = branches[sourceBranchNameToMerge];
    const targetHeadCommit = commits[targetBranch.headCommitId];
    const sourceHeadCommit = commits[sourceBranch.headCommitId];

    if (!targetHeadCommit || !sourceHeadCommit) {
      toast({ title: "Error", description: "Head commit not found for one or both branches.", variant: "destructive" }); return;
    }
    
    // Check if already merged (source head is an ancestor of target head)
    let current = targetHeadCommit;
    const visitedAncestors = new Set<string>();
    const q = [current.id];
    let head = 0;
    while(head < q.length){
        const currentId = q[head++];
        if(visitedAncestors.has(currentId)) continue;
        visitedAncestors.add(currentId);
        const commitNode = commits[currentId];
        if(!commitNode) continue;

        if(commitNode.id === sourceHeadCommit.id){
            toast({ title: "Already Merged", description: `Branch ${sourceBranchNameToMerge} is already an ancestor of ${selectedBranchName}. No merge needed.`, variant: "default"}); return;
        }
        commitNode.parentIds.forEach(pid => { if(!visitedAncestors.has(pid)){ q.push(pid); } })
    }
    
    const localNextCommitIdx = nextCommitIdx;

    const result = performGitActionAndUpdateLayout((draftCommits, draftBranches) => {
      const newCommitId = `commit-${localNextCommitIdx}`;
      const commitNumberStr = newCommitId.split('-')[1];
      const message = `Merge branch '${sourceBranchNameToMerge}' into '${selectedBranchName}' (commit ${commitNumberStr})`;
      
      const newMergeCommit: CommitType = {
        id: newCommitId,
        parentIds: [targetHeadCommit.id, sourceHeadCommit.id],
        message: message,
        timestamp: Date.now(),
        branchLane: targetBranch.lane, // Stays on target branch's lane, recalc may adjust globally
        depth: Math.max(targetHeadCommit.depth, sourceHeadCommit.depth) + 1,
      };

      draftCommits[newCommitId] = newMergeCommit;
      draftBranches[targetBranch.name] = { ...draftBranches[targetBranch.name], headCommitId: newCommitId };
      return { newCommitId };
    }, commits, branches);
    
    setSelectedCommitId(result.newCommitId);
    setNextCommitIdx(prev => prev + 1);
    toast({ title: "Merge Successful", description: `Branch merged. Layout updated.` });
  }, [selectedBranchName, branches, commits, nextCommitIdx, toast, performGitActionAndUpdateLayout]);


  const { positionedCommits, edges, graphWidth, graphHeight } = useMemo(() => {
    // Pass commits & branches to calculateLayout. Branches might not be strictly needed if commits are already up-to-date with lanes.
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
        branches={branches}
        onAddCommit={handleAddCommit}
        onCreateBranch={handleCreateBranch}
        onMoveCommit={handleMoveCommit} 
        onMergeBranch={handleMergeBranch}
        onAddCustomCommits={handleAddCustomCommits} 
        isMoveModeActive={isMoveModeActive}
        toggleMoveMode={toggleMoveMode}
      />
      <main className="flex-grow">
        <GitGraph
          commits={commits} // Pass full commits map
          branches={branches} // Pass full branches map
          positionedCommits={positionedCommits}
          edges={edges}
          selectedCommitId={selectedCommitId}
          selectedBranchName={selectedBranchName}
          onCommitSelect={handleSelectCommit}
          onBranchSelect={handleSelectBranch}
          onCommitDrop={handleMoveCommit} // This is where drop events from CommitNode end up
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

