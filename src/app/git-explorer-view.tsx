
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
function getForkParentInfo(branch: BranchType, allCommits: Readonly<Record<string, CommitType>>): { forkParentDepth: number; headTimestamp: number } {
  const headCommit = allCommits[branch.headCommitId];
  if (!headCommit) return { forkParentDepth: -1, headTimestamp: 0 };

  if (headCommit.parentIds.length > 0) {
    // For sorting, we are interested in the "main" parent, typically the first one for merge commits.
    const mainParentId = headCommit.parentIds[0];
    const mainParentCommit = allCommits[mainParentId];

    return {
        forkParentDepth: mainParentCommit ? mainParentCommit.depth : (headCommit.depth > 0 ? headCommit.depth - 1 : -1),
        headTimestamp: headCommit.timestamp // Timestamp of the branch's head
    };
  }
  // No parents (e.g. very first commit of the repo)
  return {
      forkParentDepth: headCommit.depth > 0 ? headCommit.depth - 1 : -1,
      headTimestamp: headCommit.timestamp
  };
}


// Recalculates lanes for all branches and updates commit lanes accordingly
function recalculateAndAssignLanes(
  currentCommits: Readonly<Record<string, CommitType>>,
  currentBranches: Readonly<Record<string, BranchType>>
): { updatedCommits: Record<string, CommitType>; updatedBranches: Record<string, BranchType> } {
  const newCommitsState = { ...currentCommits };
  const newBranchesState = { ...currentBranches };

  const nonMasterBranchesInfo = Object.values(newBranchesState)
    .filter(b => b.name !== INITIAL_BRANCH_NAME)
    .map(b => ({
      branchName: b.name,
      ...getForkParentInfo(b, newCommitsState)
    }));

  // Sort: Higher forkParentDepth (later/deeper fork) first. Then later headTimestamp first.
  // This means branches forking later get numerically smaller lanes (closer to master).
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
  const commitLaneAssigned = new Set<string>(); // Tracks commits whose lanes are *finalized*

  // Master commits first
  if (newBranchesState[INITIAL_BRANCH_NAME] && newCommitsState[newBranchesState[INITIAL_BRANCH_NAME].headCommitId]) {
    const masterHead = newBranchesState[INITIAL_BRANCH_NAME].headCommitId;
    const qMaster: string[] = [masterHead];
    const visitedMaster = new Set<string>([masterHead]);
    let headMaster = 0;
    while(headMaster < qMaster.length) {
        const commitId = qMaster[headMaster++];
        if (newCommitsState[commitId]) {
            newCommitsState[commitId] = { ...newCommitsState[commitId], branchLane: 0 };
            commitLaneAssigned.add(commitId);
            newCommitsState[commitId].parentIds.forEach(pId => {
                if (newCommitsState[pId] && !visitedMaster.has(pId)) {
                    visitedMaster.add(pId);
                    qMaster.push(pId);
                }
            });
        }
    }
  }

  // Other branches, in their new lane order (e.g., lane 1, then lane 2, ...)
  const sortedBranchNames = Object.keys(newBranchesState).sort((a,b) => (newBranchesState[a]?.lane ?? Infinity) - (newBranchesState[b]?.lane ?? Infinity));

  for (const branchName of sortedBranchNames) {
    if (branchName === INITIAL_BRANCH_NAME) continue;
    const branch = newBranchesState[branchName];
    if (!branch || !newCommitsState[branch.headCommitId] ) continue;
    const branchLane = branch.lane; // The "best" lane this branch can offer

    const q: string[] = [branch.headCommitId];
    const visitedForThisBranchTraversal = new Set<string>([branch.headCommitId]);

    let head = 0;
    while(head < q.length) {
        const commitId = q[head++];
        const currentCommit = newCommitsState[commitId];
        if (!currentCommit) continue;

        if (commitLaneAssigned.has(commitId)) {
             // This commit's lane has been finalized by a previous, "better" branch.
             // (Branches are processed in order of "better" lanes: 0, 1, 2...)
             continue;
        }

        newCommitsState[commitId] = { ...currentCommit, branchLane: branchLane };
        commitLaneAssigned.add(commitId); // Mark its lane as finalized by the current branch.

        currentCommit.parentIds.forEach((pId, parentIndex) => {
            const parentCommitData = newCommitsState[pId];
            if (parentCommitData && !visitedForThisBranchTraversal.has(pId)) {
                let allowPropagationToThisParent = true;

                // Special handling for the second parent of a merge commit
                if (currentCommit.parentIds.length > 1 && parentIndex === 1) {
                    const sourceBranchOfParent = Object.values(newBranchesState).find(b => b.headCommitId === pId);
                    if (sourceBranchOfParent) {
                        const sourceBranchLane = sourceBranchOfParent.lane;
                        // If the source branch of this merged-in parent has a "worse" (larger) lane
                        // than the current branch processing this merge commit, don't pull its history
                        // onto the current (better) lane. Let it be colored by its own branch later.
                        if (sourceBranchLane > branchLane) {
                            allowPropagationToThisParent = false;
                        }
                    }
                }

                if (allowPropagationToThisParent) {
                  // Only propagate if this parent hasn't already been claimed by an even "better" branch
                  if (!commitLaneAssigned.has(pId)) {
                      visitedForThisBranchTraversal.add(pId);
                      q.push(pId);
                  }
                }
            }
        });
    }
  }
  return { updatedCommits: newCommitsState, updatedBranches: newBranchesState };
}


function calculateLayout(
  commitsInput: Readonly<Record<string, CommitType>>,
  _branchesInput: Readonly<Record<string, BranchType>>
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
  const [nextBranchNumber, setNextBranchNumber] = useState(132); // Start from a base
  const [nextSharedTimestamp, setNextSharedTimestamp] = useState(Date.now());


  const [isMoveModeActive, setIsMoveModeActive] = useState(false);

  const getNewTimestamp = useCallback(() => {
    const ts = nextSharedTimestamp;
    setNextSharedTimestamp(prev => prev + 1); // Ensure strictly increasing timestamps
    return ts;
  }, [nextSharedTimestamp]);


  useEffect(() => {
    let initialCommits: Record<string, CommitType> = {};
    let initialBranches: Record<string, BranchType> = {};
    let commitCounter = 0;

    // Initialize timestamp state for the session
    const initialTimestampForSession = Date.now();
    setNextSharedTimestamp(initialTimestampForSession + 1000); // Start shared timestamp ahead

    let currentLocalTimestamp = initialTimestampForSession; // For initial setup only
    const getInitialTimestamp = () => {
        currentLocalTimestamp++;
        return currentLocalTimestamp;
    }

    const createCommit = (
      parentIds: string[],
      messagePrefix: string,
      initialBranchLaneGuess: number,
      depth: number,
      branchName?: string
    ): CommitType => {
      const id = `commit-${commitCounter++}`;
      const commitNumberStr = id.split('-')[1];
      const message = branchName && branchName !== INITIAL_BRANCH_NAME
        ? `${messagePrefix} ${commitNumberStr} (on ${branchName})`
        : `${messagePrefix} ${commitNumberStr}`;
      return { id, parentIds, message, timestamp: getInitialTimestamp(), branchLane: initialBranchLaneGuess, depth };
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
          initialLaneGuess,
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

    const masterBranchName = INITIAL_BRANCH_NAME;
    let parentCommitIdMaster: string | null = null;
    let currentDepthMaster = 0;
    const masterCommitsIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const newCommit = createCommit(
        parentCommitIdMaster ? [parentCommitIdMaster] : [],
        `Commit`, 0, currentDepthMaster, masterBranchName
      );
      initialCommits[newCommit.id] = newCommit;
      masterCommitsIds.push(newCommit.id);
      parentCommitIdMaster = newCommit.id;
      currentDepthMaster++;
    }
    initialBranches[masterBranchName] = { name: masterBranchName, headCommitId: parentCommitIdMaster!, lane: 0 };


    const branch139Name = '139'; // Forks latest (from master commit 8)
    const parentForBranch139 = initialCommits[masterCommitsIds[7]]; // masterCommitsIds is 0-indexed
    const branch139HeadId = appendCommitsToBranch(parentForBranch139, branch139Name, 5, 1, initialCommits); // Temp lane 1
    initialBranches[branch139Name] = { name: branch139Name, headCommitId: branch139HeadId, lane: 1 };

    const branch136Name = '136'; // Middle fork (from master commit 5)
    const parentForBranch136 = initialCommits[masterCommitsIds[4]];
    const branch136HeadId = appendCommitsToBranch(parentForBranch136, branch136Name, 4, 2, initialCommits); // Temp lane 2
    initialBranches[branch136Name] = { name: branch136Name, headCommitId: branch136HeadId, lane: 2 };

    const branch134Name = '134'; // Forks earliest (from master commit 3)
    const parentForBranch134 = initialCommits[masterCommitsIds[2]];
    const branch134HeadId = appendCommitsToBranch(parentForBranch134, branch134Name, 3, 3, initialCommits); // Temp lane 3
    initialBranches[branch134Name] = { name: branch134Name, headCommitId: branch134HeadId, lane: 3 };


    const { updatedCommits, updatedBranches } = recalculateAndAssignLanes(initialCommits, initialBranches);
    setCommits(updatedCommits);
    setBranches(updatedBranches);

    if (updatedBranches[masterBranchName]) {
      setSelectedCommitId(updatedBranches[masterBranchName].headCommitId);
    }
    setSelectedBranchName(masterBranchName);
    setNextCommitIdx(commitCounter);

    const numericBranchNames = Object.keys(updatedBranches)
      .map(name => parseInt(name.split('-')[0], 10)) // Handle names like "140-custom"
      .filter(num => !isNaN(num));
    const maxBranchNum = numericBranchNames.length > 0 ? Math.max(...numericBranchNames) : (132 -1) ;
    setNextBranchNumber(Math.max(132, maxBranchNum + 1));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const performGitActionAndUpdateLayout = useCallback(<T extends Record<string, any> | void>(
    actionCallback: (
      draftCommits: Record<string, CommitType>,
      draftBranches: Record<string, BranchType>
    ) => T,
    currentCommitsState: Record<string, CommitType>,
    currentBranchesState: Record<string, BranchType>
  ): T => {
    let newCommits = { ...currentCommitsState };
    let newBranches = { ...currentBranchesState };

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
      timestamp: getNewTimestamp(),
      branchLane: currentBranch.lane,
      depth: parentCommit.depth + 1,
    };

    const newCommitsMap = { ...commits, [newCommitId]: newCommit };
    const newBranchesMap = { ...branches, [currentBranch.name]: { ...currentBranch, headCommitId: newCommitId }};

    // Simple appends might not need full recalculateAndAssignLanes if lane stickiness is desired
    // and no other branches are affected. However, for consistency with other actions:
    const { updatedCommits, updatedBranches } = recalculateAndAssignLanes(newCommitsMap, newBranchesMap);
    setCommits(updatedCommits);
    setBranches(updatedBranches);

    setSelectedCommitId(newCommitId);
    setNextCommitIdx(prev => prev + 1);
    toast({ title: "Commit Added", description: `${newCommit.message} added to branch ${currentBranch.name}.` });
  }, [selectedBranchName, branches, commits, nextCommitIdx, toast, getNewTimestamp]);

  const handleCreateBranch = useCallback(() => {
    if (!selectedCommitId || !commits[selectedCommitId]) {
       toast({ title: "Error", description: "No commit selected to create branch from.", variant: "destructive" });
      return;
    }
    const parentCommitForBranch = commits[selectedCommitId];

    const localNextCommitIdx = nextCommitIdx;
    const localNextBranchNumber = nextBranchNumber;
    const newBranchTimestamp = getNewTimestamp();

    const result = performGitActionAndUpdateLayout((draftCommits, draftBranches) => {
      const newBranchName = `${localNextBranchNumber}`;
      const newCommitId = `commit-${localNextCommitIdx}`;
      const commitNumberStr = newCommitId.split('-')[1];
      const message = `Commit ${commitNumberStr} (on ${newBranchName})`;

      const newBranchInitialCommit: CommitType = {
          id: newCommitId,
          parentIds: [selectedCommitId],
          message: message,
          timestamp: newBranchTimestamp,
          branchLane: 0, // Lane will be recalculated
          depth: parentCommitForBranch.depth + 1,
      };
      const newBranchDef: BranchType = {
          name: newBranchName,
          headCommitId: newCommitId,
          lane: 0 // Lane will be recalculated
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
  }, [selectedCommitId, commits, branches, nextCommitIdx, nextBranchNumber, toast, performGitActionAndUpdateLayout, getNewTimestamp]);

  const handleAddCustomCommits = useCallback(() => {
    if (!selectedCommitId || !commits[selectedCommitId]) {
      toast({ title: "Error", description: "No commit selected to branch from for customisations.", variant: "destructive" });
      return;
    }
    const parentCommitForBranch = commits[selectedCommitId];
    let localNextCommitIdx = nextCommitIdx;
    const localNextBranchNumber = nextBranchNumber;

    const customTimestamps: number[] = [];
    for (let i=0; i<4; i++) {
        customTimestamps.push(getNewTimestamp());
    }

    const result = performGitActionAndUpdateLayout((draftCommits, draftBranches) => {
      const newBranchName = `${localNextBranchNumber}-custom`;

      let tempParentId = selectedCommitId;
      let tempParentDepth = parentCommitForBranch.depth;
      let headOfCustomCommits = '';

      for (let i = 0; i < 4; i++) {
        const newCommitId = `commit-${localNextCommitIdx + i}`;
        const commitNumberStr = newCommitId.split('-')[1];
        const message = `Custom Commit ${commitNumberStr} (on ${newBranchName})`;
        const newCustomCommit: CommitType = {
          id: newCommitId,
          parentIds: [tempParentId],
          message: message,
          timestamp: customTimestamps[i],
          branchLane: 0, // Lane will be recalculated
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
        lane: 0 // Lane will be recalculated
      };
      draftBranches[newBranchName] = newBranchDef;
      return { newBranchName, headOfCustomCommits, updatedNextCommitIdx: localNextCommitIdx + 4 };
    }, commits, branches);

    setSelectedBranchName(result.newBranchName);
    setSelectedCommitId(result.headOfCustomCommits);
    setNextCommitIdx(result.updatedNextCommitIdx);
    setNextBranchNumber(prev => prev + 1);
    toast({ title: "Customisations Applied", description: `Branch ${result.newBranchName} created with 4 custom commits. Layout updated.` });
  }, [selectedCommitId, commits, branches, nextCommitIdx, nextBranchNumber, toast, performGitActionAndUpdateLayout, getNewTimestamp]);


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

    let isCyclic = false;
    const q_descendants: string[] = [commitToMoveId];
    const visited_descendants = new Set<string>([commitToMoveId]);
    let head_desc = 0;
    while(head_desc < q_descendants.length) {
        const current_descendant = q_descendants[head_desc++];
        if (current_descendant === newParentId) { isCyclic = true; break; }

        // Check against current commits state, not draft
        Object.values(commits).forEach(commit => {
            if (commit.parentIds.includes(current_descendant) && !visited_descendants.has(commit.id)) {
                visited_descendants.add(commit.id);
                q_descendants.push(commit.id);
            }
        });
    }
    if (isCyclic) {
         toast({ title: "Error", description: "Cannot move commit: creates a cycle.", variant: "destructive"});
         setIsMoveModeActive(false); return;
    }

    const movedCommitTime = getNewTimestamp();


    performGitActionAndUpdateLayout((draftCommits, _draftBranches) => {
      const sourceCommit = draftCommits[commitToMoveId];
      const targetParentCommit = draftCommits[newParentId];

      draftCommits[commitToMoveId] = {
        ...sourceCommit,
        parentIds: [newParentId],
        depth: targetParentCommit.depth + 1,
        timestamp: movedCommitTime,
      };

      const queue: { commitId: string; newDepth: number; }[] = [
        { commitId: commitToMoveId, newDepth: targetParentCommit.depth + 1 }
      ];
      const visitedInThisBFSRecalculation = new Set<string>([commitToMoveId]);
      let head = 0;
      let descendantTimestampCounter = 1;

      while (head < queue.length) {
          const { commitId: currentProcessedParentId, newDepth: currentParentDepth } = queue[head++];

          const potentialChildIds = Object.keys(draftCommits);

          for (const potentialChildId of potentialChildIds) {
              const potentialChildCommit = draftCommits[potentialChildId];
              if (potentialChildCommit && potentialChildCommit.parentIds.includes(currentProcessedParentId) &&
                  !visitedInThisBFSRecalculation.has(potentialChildId)) {

                   const childNewTimestamp = movedCommitTime + descendantTimestampCounter++;

                   draftCommits[potentialChildId] = {
                      ...potentialChildCommit,
                      depth: currentParentDepth + 1,
                      timestamp: childNewTimestamp,
                  };
                  visitedInThisBFSRecalculation.add(potentialChildId);
                  queue.push({
                      commitId: potentialChildId,
                      newDepth: currentParentDepth + 1,
                  });
              }
          }
      }
    }, commits, branches);

    setIsMoveModeActive(false);
    setSelectedCommitId(commitToMoveId);
    toast({ title: "Commit Moved", description: `Commit re-parented. Layout updated.`});
  }, [commits, branches, toast, performGitActionAndUpdateLayout, getNewTimestamp]);

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

    // Check if source is already an ancestor of target (simple check)
    let current = targetHeadCommit;
    const visitedAncestors = new Set<string>();
    const q_anc: string[] = [];
    if(commits[current.id]) q_anc.push(current.id);

    let head_anc = 0;
    while(head_anc < q_anc.length){
        const currentId = q_anc[head_anc++];
        if(visitedAncestors.has(currentId)) continue;
        visitedAncestors.add(currentId);
        const commitNode = commits[currentId];
        if(!commitNode) continue;

        if(commitNode.id === sourceHeadCommit.id){
            toast({ title: "Already Merged", description: `Branch ${sourceBranchNameToMerge} is already an ancestor of ${selectedBranchName}. No merge needed.`, variant: "default"}); return;
        }
        commitNode.parentIds.forEach(pid => { if(commits[pid] && !visitedAncestors.has(pid)){ q_anc.push(pid); } })
    }

    const localNextCommitIdx = nextCommitIdx;
    const mergeTimestamp = getNewTimestamp();

    const result = performGitActionAndUpdateLayout((draftCommits, draftBranches) => {
      const newCommitId = `commit-${localNextCommitIdx}`;
      const commitNumberStr = newCommitId.split('-')[1];
      const message = `Merge branch '${sourceBranchNameToMerge}' into '${selectedBranchName}' (commit ${commitNumberStr})`;

      const newMergeCommit: CommitType = {
        id: newCommitId,
        parentIds: [targetHeadCommit.id, sourceHeadCommit.id],
        message: message,
        timestamp: mergeTimestamp,
        branchLane: draftBranches[targetBranch.name].lane, // Will be recalculated, but good initial guess
        depth: Math.max(targetHeadCommit.depth, sourceHeadCommit.depth) + 1,
      };

      draftCommits[newCommitId] = newMergeCommit;
      draftBranches[targetBranch.name] = { ...draftBranches[targetBranch.name], headCommitId: newCommitId };
      return { newCommitId };
    }, commits, branches);

    setSelectedCommitId(result.newCommitId);
    setNextCommitIdx(prev => prev + 1);
    toast({ title: "Merge Successful", description: `Branch merged. Layout updated.` });
  }, [selectedBranchName, branches, commits, nextCommitIdx, toast, performGitActionAndUpdateLayout, getNewTimestamp]);


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
