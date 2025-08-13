"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { CommitType, BranchType, PositionedCommit, Edge } from '@/types/git';
import { GitGraph } from '@/components/git-explorer/GitGraph';
import { Controls } from '@/components/git-explorer/Controls';
import { useToast } from "@/hooks/use-toast";

const INITIAL_BRANCH_NAME = 'master';
const X_SPACING = 90; // Reduced from 120
const Y_SPACING = 60; // Reduced from 80
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
  const usedPositions = new Set<string>(); // Track used positions to avoid collisions

  for (const commitData of sortedCommits) {
    let xPos = (commitData.branchLane || 0) * X_SPACING + GRAPH_PADDING;
    let yPos = commitData.depth * Y_SPACING + GRAPH_PADDING;

    // Check for collision and resolve by adjusting position
    let positionKey = `${xPos},${yPos}`;
    let offsetX = 0;
    let offsetY = 0;

    // If position is already used, find an alternative
    while (usedPositions.has(positionKey)) {
      // First try to offset horizontally (slight right shift)
      if (offsetX < X_SPACING * 0.7) {
        offsetX += 20; // Small horizontal offset
        xPos = (commitData.branchLane || 0) * X_SPACING + GRAPH_PADDING + offsetX;
      } else {
        // If horizontal offset is too large, try vertical offset
        offsetY += 15; // Small vertical offset
        offsetX = 0; // Reset horizontal offset
        xPos = (commitData.branchLane || 0) * X_SPACING + GRAPH_PADDING;
        yPos = commitData.depth * Y_SPACING + GRAPH_PADDING + offsetY;
      }
      positionKey = `${xPos},${yPos}`;
    }

    // Mark this position as used
    usedPositions.add(positionKey);

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

  // Create edges after all commits have been positioned
  for (const commitId in tempPositionedCommitsMap) {
    const currentPositionedCommit = tempPositionedCommitsMap[commitId];
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
  const [nextCustomSuffix, setNextCustomSuffix] = useState(1);
  const [nextSharedTimestamp, setNextSharedTimestamp] = useState(Date.now());

  const [showCommitLabels, setShowCommitLabels] = useState(false);

  const generateInitialGraphState = useCallback(() => {
    let initialCommits: Record<string, CommitType> = {};
    let initialBranches: Record<string, BranchType> = {};
    let commitCounter = 0;

    const initialTimestampForSession = Date.now();
    setNextSharedTimestamp(initialTimestampForSession + 1000);

    let currentLocalTimestamp = initialTimestampForSession;
    const getInitialTimestamp = () => {
      currentLocalTimestamp++;
      return currentLocalTimestamp;
    };

    const createCommit = (
      parentIds: string[],
      initialBranchLaneGuess: number,
      depth: number,
      isCustom: boolean = false
    ): CommitType => {
      const id = `commit-${commitCounter++}`;
      return { id, parentIds, timestamp: getInitialTimestamp(), branchLane: initialBranchLaneGuess, depth, isCustom };
    };

    const appendCommitsToBranch = (
      startingParentCommit: CommitType,
      numberOfCommits: number,
      initialLaneGuess: number,
      targetCommitsMap: Record<string, CommitType>,
      isBranchCustom: boolean = false
    ): string => {
      let currentParentIdInSequence = startingParentCommit.id;
      let currentDepthInSequence = startingParentCommit.depth + 1;
      let headOfThisSequence = '';
      for (let i = 0; i < numberOfCommits; i++) {
        const newCommit = createCommit(
          [currentParentIdInSequence],
          initialLaneGuess,
          currentDepthInSequence,
          isBranchCustom
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
        0, currentDepthMaster
      );
      if (i === 0) {
        newCommit.label = "Initial commit";
      }
      initialCommits[newCommit.id] = newCommit;
      masterCommitsIds.push(newCommit.id);
      parentCommitIdMaster = newCommit.id;
      currentDepthMaster++;
    }
    initialBranches[masterBranchName] = { name: masterBranchName, headCommitId: parentCommitIdMaster!, lane: 0 };

    const branch139Name = '139';
    const parentForBranch139 = initialCommits[masterCommitsIds[7]];
    const branch139HeadId = appendCommitsToBranch(parentForBranch139, 5, 1, initialCommits);
    initialBranches[branch139Name] = { name: branch139Name, headCommitId: branch139HeadId, lane: 1 };

    const branch136Name = '136';
    const parentForBranch136 = initialCommits[masterCommitsIds[4]];
    const branch136HeadId = appendCommitsToBranch(parentForBranch136, 4, 2, initialCommits);
    initialBranches[branch136Name] = { name: branch136Name, headCommitId: branch136HeadId, lane: 2 };

    const branch134Name = '134';
    const parentForBranch134 = initialCommits[masterCommitsIds[2]];
    const branch134HeadId = appendCommitsToBranch(parentForBranch134, 3, 3, initialCommits);
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
      .map(name => {
        const parts = name.split('-');
        return parseInt(parts[0], 10);
      })
      .filter(num => !isNaN(num));
    const maxBranchNum = numericBranchNames.length > 0 ? Math.max(...numericBranchNames) : (132 - 1);
    setNextBranchNumber(Math.max(132, maxBranchNum + 1));
  }, []);

  const toggleShowCommitLabels = useCallback(() => {
    setShowCommitLabels(prev => !prev);
  }, []);

  const handleUpdateCommitLabel = useCallback((commitId: string, label: string) => {
    setCommits(prevCommits => {
      const newCommits = { ...prevCommits };
      if (newCommits[commitId]) {
        newCommits[commitId] = { ...newCommits[commitId], label };
      }
      return newCommits;
    });
  }, []);

  const getNewTimestamp = useCallback(() => {
    const ts = nextSharedTimestamp;
    setNextSharedTimestamp(prev => prev + 1); // Ensure strictly increasing timestamps
    return ts;
  }, [nextSharedTimestamp]);


  useEffect(() => {
    generateInitialGraphState();
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
    const newCommit: CommitType = {
      id: newCommitId,
      parentIds: [parentCommit.id],
      timestamp: getNewTimestamp(),
      branchLane: currentBranch.lane, 
      depth: parentCommit.depth + 1,
      isCustom: false,
    };

    const newCommitsMap = { ...commits, [newCommitId]: newCommit };
    const newBranchesMap = { ...branches, [currentBranch.name]: { ...currentBranch, headCommitId: newCommitId }};

    const { updatedCommits, updatedBranches } = recalculateAndAssignLanes(newCommitsMap, newBranchesMap);
    setCommits(updatedCommits);
    setBranches(updatedBranches);

    setSelectedCommitId(newCommitId);
    setNextCommitIdx(prev => prev + 1);
    toast({ title: "Commit Added", description: `Commit ${newCommitId} added to branch ${currentBranch.name}.` });
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

      const newBranchInitialCommit: CommitType = {
          id: newCommitId,
          parentIds: [selectedCommitId],
          timestamp: newBranchTimestamp,
          branchLane: 0, 
          depth: parentCommitForBranch.depth + 1,
          isCustom: false,
      };
      const newBranchDef: BranchType = {
          name: newBranchName,
          headCommitId: newCommitId,
          lane: 0 
      };

      draftCommits[newCommitId] = newBranchInitialCommit;
      draftBranches[newBranchName] = newBranchDef;
      return { newBranchName, newCommitId };
    }, commits, branches);

    setSelectedBranchName(result.newBranchName);
    setSelectedCommitId(result.newCommitId);
    setNextCommitIdx(prev => prev + 1);
    setNextBranchNumber(prev => prev + 1);
    toast({ title: "Branch Created", description: `Branch ${result.newBranchName} created with initial commit ${result.newCommitId}. Layout updated.` });
  }, [selectedCommitId, commits, branches, nextCommitIdx, nextBranchNumber, toast, performGitActionAndUpdateLayout, getNewTimestamp]);

  const handleAddCustomCommits = useCallback(() => {
    if (!selectedCommitId || !commits[selectedCommitId]) {
      toast({ title: "Error", description: "No commit selected to branch from for customisations.", variant: "destructive" });
      return;
    }
    const parentCommitForBranch = commits[selectedCommitId];
    let localNextCommitIdx = nextCommitIdx;
    const localNextCustomSuffix = nextCustomSuffix;

    const customTimestamps: number[] = [];
    for (let i=0; i<4; i++) {
        customTimestamps.push(getNewTimestamp());
    }

    const result = performGitActionAndUpdateLayout((draftCommits, draftBranches) => {
      const newBranchName = `custom-${localNextCustomSuffix}`;

      let tempParentId = selectedCommitId;
      let tempParentDepth = parentCommitForBranch.depth;
      let headOfCustomCommits = '';

      for (let i = 0; i < 4; i++) {
        const newCommitId = `commit-${localNextCommitIdx + i}`;
        const newCustomCommit: CommitType = {
          id: newCommitId,
          parentIds: [tempParentId],
          timestamp: customTimestamps[i],
          branchLane: 0, 
          depth: tempParentDepth + 1,
          isCustom: true,
        };
        draftCommits[newCommitId] = newCustomCommit;
        tempParentId = newCommitId;
        tempParentDepth = newCustomCommit.depth;
        headOfCustomCommits = newCommitId;
      }
      const newBranchDef: BranchType = {
        name: newBranchName,
        headCommitId: headOfCustomCommits,
        lane: 0 
      };
      draftBranches[newBranchName] = newBranchDef;
      return { newBranchName, headOfCustomCommits, updatedNextCommitIdx: localNextCommitIdx + 4 };
    }, commits, branches);

    setSelectedBranchName(result.newBranchName);
    setSelectedCommitId(result.headOfCustomCommits);
    setNextCommitIdx(result.updatedNextCommitIdx);
    setNextCustomSuffix(prev => prev + 1); 
    toast({ title: "Customisations Applied", description: `Branch ${result.newBranchName} created with 4 custom commits. Layout updated.` });
  }, [selectedCommitId, commits, branches, nextCommitIdx, nextCustomSuffix, toast, performGitActionAndUpdateLayout, getNewTimestamp]);


  const handleSelectCommit = useCallback((commitId: string) => {
    setSelectedCommitId(commitId);
  }, []);

  const handleSelectBranch = useCallback((branchName: string) => {
    setSelectedBranchName(branchName);
    if (branches[branchName]) {
      setSelectedCommitId(branches[branchName].headCommitId);
    }
  }, [branches]);

  const handleMergeBranch = useCallback((sourceBranchNameToMerge: string) => {
    if (!selectedBranchName || !branches[selectedBranchName]) {
      toast({ title: "Error", description: "No target branch selected for merge.", variant: "destructive" }); return;
    }
    if (!branches[sourceBranchNameToMerge]) {
      toast({ title: "Error", description: "Source branch for merge not found.", variant: "destructive" }); return;
    }
    if (selectedBranchName === sourceBranchNameToMerge) {
      toast({ title: "Error", description: "Cannot merge a branch into itself.", variant: "destructive" }); return;
    }

    const targetBranch = branches[selectedBranchName];
    const sourceBranch = branches[sourceBranchNameToMerge];
    const targetHeadCommit = commits[targetBranch.headCommitId];
    const sourceHeadCommit = commits[sourceBranch.headCommitId];

    if (!targetHeadCommit || !sourceHeadCommit) {
      toast({ title: "Error", description: "Head commit not found for one or both branches.", variant: "destructive" }); return;
    }

    // Check if already merged (target contains source)
    const visitedAncestors = new Set<string>();
    const q_anc: string[] = [targetHeadCommit.id];
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

    // Check for fast-forward: if target is ancestor of source
    const visitedSourceAncestors = new Set<string>();
    const q_source: string[] = [sourceHeadCommit.id];
    let head_source = 0;
    while(head_source < q_source.length){
        const currentId = q_source[head_source++];
        if(visitedSourceAncestors.has(currentId)) continue;
        visitedSourceAncestors.add(currentId);
        const commitNode = commits[currentId];
        if(!commitNode) continue;
        if(commitNode.id === targetHeadCommit.id){
            // Fast-forward
            const result = performGitActionAndUpdateLayout((draftCommits, draftBranches) => {
              draftBranches[targetBranch.name] = { ...draftBranches[targetBranch.name], headCommitId: sourceHeadCommit.id };
              return { fastForward: true, newHeadId: sourceHeadCommit.id };
            }, commits, branches);
            setSelectedCommitId(sourceHeadCommit.id);
            toast({ title: "Fast-Forward Merge", description: `${selectedBranchName} fast-forwarded to ${sourceBranchNameToMerge}.` });
            return;
        }
        commitNode.parentIds.forEach(pid => { if(commits[pid] && !visitedSourceAncestors.has(pid)){ q_source.push(pid); } })
    }

    // Standard merge: always create a new commit with two parents (HEAD master, HEAD source)
    const localNextCommitIdx = nextCommitIdx;
    const mergeTimestamp = getNewTimestamp();
    const newCommitId = `merge-commit-${localNextCommitIdx}`;
    const newMergeCommit: CommitType = {
      id: newCommitId,
      parentIds: [targetHeadCommit.id, sourceHeadCommit.id],
      timestamp: mergeTimestamp,
      branchLane: branches[sourceBranch.name].lane,
      depth: Math.max(targetHeadCommit.depth, sourceHeadCommit.depth) + 1,
      isCustom: false,
    };
    const updatedCommits = { ...commits, [newCommitId]: newMergeCommit };
    const updatedBranches = { ...branches, [targetBranch.name]: { ...branches[targetBranch.name], headCommitId: newCommitId }};

    setCommits(updatedCommits);
    setBranches(updatedBranches);

    setSelectedCommitId(newCommitId);
    setNextCommitIdx(prev => prev + 1);
    toast({ title: "Merge Successful", description: `Merge commit ${newCommitId} created. Layout updated.` });
  }, [selectedBranchName, branches, commits, nextCommitIdx, toast, performGitActionAndUpdateLayout, getNewTimestamp]);

  // Debug function to inspect commit structure - expose to window for manual testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).setTestGraph = (testCommits: Record<string, CommitType>, testBranches: Record<string, BranchType>) => {
        setCommits(testCommits);
        setBranches(testBranches);
      };

      (window as any).getGraphState = () => {
        return {
          commits,
          branches,
        };
      };

      (window as any).testMerge = (sourceBranch: string) => {
        handleMergeBranch(sourceBranch);
      };
    }
  }, [commits, branches, handleMergeBranch]);

  const handleReset = useCallback(() => {
    generateInitialGraphState();
    toast({ title: "Reset Completed", description: "Git repository has been reset to initial state." });
  }, [generateInitialGraphState, toast]);

  const handleClear = useCallback(() => {
    const initialCommit = Object.values(commits).find(c => c.parentIds.length === 0);
    if (initialCommit) {
      const clearedCommit = { ...initialCommit, label: "Initial commit" };
      setCommits({ [initialCommit.id]: clearedCommit });
      setBranches({ [INITIAL_BRANCH_NAME]: { name: INITIAL_BRANCH_NAME, headCommitId: initialCommit.id, lane: 0 } });
      setSelectedCommitId(initialCommit.id);
      setSelectedBranchName(INITIAL_BRANCH_NAME);
      setNextCommitIdx(1);
      setNextBranchNumber(132);
      setNextCustomSuffix(1);
      toast({ title: "Graph Cleared", description: "The graph has been cleared, leaving only the initial commit." });
    } else {
      toast({ title: "Error", description: "Could not find the initial commit to clear the graph.", variant: "destructive" });
    }
  }, [commits, toast]);

  const { positionedCommits, edges, graphWidth, graphHeight } = useMemo(() => {
    return calculateLayout(commits, branches);
  }, [commits, branches]);

  return (
    <div className="flex flex-col h-screen p-4 bg-background text-foreground relative">
      <header className="text-center py-2">
        <h1 className="text-3xl font-headline font-bold text-primary">Git Simulator</h1>
      </header>
      
      <main className="flex-grow relative">
        <GitGraph
          commits={commits}
          branches={branches}
          positionedCommits={positionedCommits}
          edges={edges}
          selectedCommitId={selectedCommitId}
          selectedBranchName={selectedBranchName}
          onCommitSelect={handleSelectCommit}
          onBranchSelect={handleSelectBranch}
          height={Math.max(graphHeight, 400)}
          width={Math.max(graphWidth, 600)}
          showCommitLabels={showCommitLabels}
        />
        
        {/* Pływające menu kontrolne */}
        <Controls
          selectedBranchName={selectedBranchName}
          selectedCommitId={selectedCommitId}
          commits={commits}
          branches={branches}
          onAddCommit={handleAddCommit}
          onCreateBranch={handleCreateBranch}
          onMergeBranch={handleMergeBranch}
          onAddCustomCommits={handleAddCustomCommits}
          onReset={handleReset}
          onClear={handleClear}
          showCommitLabels={showCommitLabels}
          onToggleShowCommitLabels={toggleShowCommitLabels}
          onUpdateCommitLabel={handleUpdateCommitLabel}
        />
      </main>
      <footer className="text-center text-sm text-muted-foreground py-2">
        <p>Interactive Git simulation. Select commits and branches to perform actions. You can drag commits to re-parent them.</p>
      </footer>
    </div>
  );
}



