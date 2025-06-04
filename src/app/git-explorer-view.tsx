
"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { CommitType, BranchType, PositionedCommit, Edge } from '@/types/git';
import { GitGraph } from '@/components/git-explorer/GitGraph';
import { Controls } from '@/components/git-explorer/Controls';
import { useToast } from "@/hooks/use-toast";

const INITIAL_BRANCH_NAME = 'master';
const STARTING_BRANCH_NUMBER = 132; // Not strictly used for naming anymore if we use nextBranchNumber
const X_SPACING = 120;
const Y_SPACING = 80;
const GRAPH_PADDING = 50;

function calculateLayout(
  commitsInput: Readonly<Record<string, CommitType>>,
  branchesInput: Readonly<Record<string, BranchType>> // branchesInput is not directly used but signals dependency
): { positionedCommits: PositionedCommit[]; edges: Edge[]; graphWidth: number; graphHeight: number } {
  const positionedCommits: PositionedCommit[] = [];
  const edges: Edge[] = [];

  const commitsMap = { ...commitsInput };

  if (Object.keys(commitsMap).length === 0) {
    return { positionedCommits, edges, graphWidth: GRAPH_PADDING * 2, graphHeight: GRAPH_PADDING * 2 };
  }
  
  // Sort commits: primary by depth, secondary by timestamp, tertiary by branchLane
  // This helps in determining the order of processing and can affect visual stacking if x,y were identical (though unlikely with unique lanes/depths)
  const sortedCommits = Object.values(commitsMap).sort((a, b) => {
    if (a.depth === b.depth) {
      if(a.timestamp === b.timestamp) return (a.branchLane || 0) - (b.branchLane || 0);
      return a.timestamp - b.timestamp; // Earlier timestamps first
    }
    return a.depth - b.depth; // Lower depth first
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
  
  // Create edges after all commits have their positions calculated
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
    graphWidth: maxX + X_SPACING, // Add some padding to the right
    graphHeight: maxY + Y_SPACING, // Add some padding to the bottom
  };
}

export default function GitExplorerView() {
  const { toast } = useToast();
  const [commits, setCommits] = useState<Record<string, CommitType>>({});
  const [branches, setBranches] = useState<Record<string, BranchType>>({});
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const [selectedBranchName, setSelectedBranchName] = useState<string | null>(INITIAL_BRANCH_NAME);
  
  const [nextCommitIdx, setNextCommitIdx] = useState(0);
  const [nextBranchNumber, setNextBranchNumber] = useState(STARTING_BRANCH_NUMBER); // Initial value for dynamic branch naming
  const [nextLaneIdx, setNextLaneIdx] = useState(0); // For assigning lanes to new branches

  const [isMoveModeActive, setIsMoveModeActive] = useState(false);

  useEffect(() => {
    const initialCommits: Record<string, CommitType> = {};
    const initialBranches: Record<string, BranchType> = {};
    let commitCounter = 0;
    let currentTime = Date.now(); // Base timestamp, ensure it increments for each commit

    // Helper to create a single commit
    const createCommit = (
      parentIds: string[],
      messagePrefix: string,
      branchLane: number,
      depth: number,
      branchName?: string // Optional: for including branch name in message
    ): CommitType => {
      const id = `commit-${commitCounter++}`;
      currentTime++; // Ensure unique, incrementing timestamp for sorting
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

    // Helper to append a sequence of commits to a branch
    const appendCommitsToBranch = (
      startingParentCommit: CommitType,
      branchNameForMessage: string,
      numberOfCommits: number,
      branchLaneForLayout: number,
      targetCommitsMap: Record<string, CommitType> // The map to add commits to
    ): string => { // Returns the ID of the head commit of this sequence
      let currentParentIdInSequence = startingParentCommit.id;
      let currentDepthInSequence = startingParentCommit.depth + 1;
      let headOfThisSequence = '';

      for (let i = 0; i < numberOfCommits; i++) {
        const newCommit = createCommit(
          [currentParentIdInSequence],
          `Commit`, // Generic prefix for these auto-generated commits
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
    const masterLane = 0; // Master always starts at lane 0
    let parentCommitIdMaster: string | null = null;
    let currentDepthMaster = 0;
    const masterCommitsIds: string[] = []; // To easily reference master commits by index

    for (let i = 0; i < 10; i++) {
      const newCommit = createCommit(
        parentCommitIdMaster ? [parentCommitIdMaster] : [],
        `Commit`,
        masterLane, 
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
      lane: masterLane,
    };
    
    const assignedLanes = [masterLane];


    // --- BRANCH 139 (Latest fork from master, gets lane masterLane + 1) ---
    const branch139Name = '139';
    const parentForBranch139 = initialCommits[masterCommitsIds[7]]; 
    const branch139Lane = masterLane + 1; // Furthest to the left (after master)
    const branch139HeadId = appendCommitsToBranch(parentForBranch139, branch139Name, 5, branch139Lane, initialCommits);
    initialBranches[branch139Name] = {
      name: branch139Name,
      headCommitId: branch139HeadId,
      lane: branch139Lane,
    };
    assignedLanes.push(branch139Lane);

    // --- BRANCH 136 (Middle fork, gets lane masterLane + 2) ---
    const branch136Name = '136';
    const parentForBranch136 = initialCommits[masterCommitsIds[4]]; 
    const branch136Lane = masterLane + 2;
    const branch136HeadId = appendCommitsToBranch(parentForBranch136, branch136Name, 4, branch136Lane, initialCommits);
    initialBranches[branch136Name] = {
      name: branch136Name,
      headCommitId: branch136HeadId,
      lane: branch136Lane,
    };
    assignedLanes.push(branch136Lane);
    
    // --- BRANCH 134 (Earliest fork from master, gets lane masterLane + 3) ---
    const branch134Name = '134';
    const parentForBranch134 = initialCommits[masterCommitsIds[2]]; 
    const branch134Lane = masterLane + 3; // Furthest to the right
    const branch134HeadId = appendCommitsToBranch(parentForBranch134, branch134Name, 3, branch134Lane, initialCommits);
    initialBranches[branch134Name] = {
      name: branch134Name,
      headCommitId: branch134HeadId,
      lane: branch134Lane,
    };
    assignedLanes.push(branch134Lane);  

    setCommits(initialCommits);
    setBranches(initialBranches);
    setSelectedCommitId(initialBranches[masterBranchName].headCommitId);
    setSelectedBranchName(masterBranchName);

    setNextCommitIdx(commitCounter); // Update global commit counter
    
    // Update nextBranchNumber based on highest numeric branch name created
    const numericBranchNames = Object.keys(initialBranches)
      .map(name => parseInt(name, 10))
      .filter(num => !isNaN(num));
    const maxBranchNum = numericBranchNames.length > 0 ? Math.max(...numericBranchNames) : (STARTING_BRANCH_NUMBER -1) ; // Default if no numeric branches
    setNextBranchNumber(Math.max(STARTING_BRANCH_NUMBER, maxBranchNum + 1)); // Ensure it's at least STARTING_BRANCH_NUMBER or one more than max
    
    setNextLaneIdx(Math.max(...assignedLanes) + 1); // Next dynamic branch will use the next available lane
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs only once on mount

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
      timestamp: Date.now(), // Use a fresh timestamp
      branchLane: currentBranch.lane, // Commit stays on the current branch's lane
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
    const newBranchName = `${nextBranchNumber}`; // Use the incrementing branch number
    const newBranchLane = nextLaneIdx; // Assign the next available lane

    // Create the first commit for the new branch
    const newCommitId = `commit-${nextCommitIdx}`;
    const commitNumberStr = newCommitId.split('-')[1];
    const message = `Commit ${commitNumberStr} (on ${newBranchName})`;
    
    const newBranchInitialCommit: CommitType = {
        id: newCommitId,
        parentIds: [selectedCommitId], // Parent is the currently selected commit
        message: message,
        timestamp: Date.now(), // Fresh timestamp
        branchLane: newBranchLane, // New branch gets its own lane
        depth: parentCommitForBranch.depth + 1,
    };
    
    // Define the new branch
    const newBranchDef: BranchType = {
      name: newBranchName,
      headCommitId: newCommitId, // Head is the new initial commit
      lane: newBranchLane,
    };

    // Update state
    setCommits(prevCommits => ({ ...prevCommits, [newCommitId]: newBranchInitialCommit }));
    setBranches(prevBranches => ({
      ...prevBranches,
      [newBranchName]: newBranchDef,
    }));
    
    // Select the new branch and its head commit
    setSelectedBranchName(newBranchName); 
    setSelectedCommitId(newCommitId); 
    setNextCommitIdx(prev => prev + 1);
    setNextBranchNumber(prev => prev + 1); // Increment for the next branch
    setNextLaneIdx(prev => prev + 1);     // Increment for the next lane
    toast({ title: "Branch Created", description: `Branch ${newBranchName} created from ${parentCommitForBranch.message.substring(0,8)}. New commit ${newBranchInitialCommit.message.substring(0,15)} added to ${newBranchName}.` });
  }, [selectedCommitId, commits, nextCommitIdx, nextBranchNumber, nextLaneIdx, toast]);

  const handleAddCustomCommits = useCallback(() => {
    if (!selectedCommitId || !commits[selectedCommitId]) {
      toast({ title: "Error", description: "No commit selected to branch from for customisations.", variant: "destructive" });
      return;
    }

    const parentCommitForBranch = commits[selectedCommitId];
    const newBranchName = `${nextBranchNumber}`; // Use the next available branch number
    const newBranchLane = nextLaneIdx; // Use the next available lane

    const newCommitsData: Record<string, CommitType> = {};
    let tempParentId = selectedCommitId; // First custom commit parents the selected commit
    let tempParentDepth = parentCommitForBranch.depth;
    let headOfCustomCommits = '';
    let localNextCommitIdx = nextCommitIdx;
    let commitTime = Date.now(); // Base time for this batch of commits

    for (let i = 0; i < 4; i++) {
      const newCommitId = `commit-${localNextCommitIdx}`;
      const commitNumberStr = newCommitId.split('-')[1];
      const message = `Custom Commit ${commitNumberStr} (on ${newBranchName})`;
      
      const newCustomCommit: CommitType = {
        id: newCommitId,
        parentIds: [tempParentId],
        message: message,
        timestamp: commitTime + i, // Stagger timestamps slightly for deterministic sorting
        branchLane: newBranchLane, // All custom commits on the new branch's lane
        depth: tempParentDepth + 1,
      };

      newCommitsData[newCommitId] = newCustomCommit;
      tempParentId = newCommitId; // Next commit in sequence parents this one
      tempParentDepth = newCustomCommit.depth;
      headOfCustomCommits = newCommitId; // Keep track of the latest commit
      localNextCommitIdx++;
    }
    
    // Define the new branch
    const newBranchDef: BranchType = {
      name: newBranchName,
      headCommitId: headOfCustomCommits, // Head is the last custom commit
      lane: newBranchLane,
    };

    // Update state
    setCommits(prev => ({ ...prev, ...newCommitsData }));
    setBranches(prev => ({ ...prev, [newBranchName]: newBranchDef }));
    
    // Select the new branch and its head
    setSelectedBranchName(newBranchName);
    setSelectedCommitId(headOfCustomCommits);
    setNextCommitIdx(localNextCommitIdx); // Update global commit counter
    setNextBranchNumber(prev => prev + 1); // Increment for next branch creation
    setNextLaneIdx(prev => prev + 1);     // Increment for next lane assignment

    toast({ title: "Customisations Applied", description: `Branch ${newBranchName} created with 4 custom commits from ${parentCommitForBranch.message.substring(0,8)}.` });

  }, [selectedCommitId, commits, nextCommitIdx, nextBranchNumber, nextLaneIdx, toast]);


  const handleSelectCommit = useCallback((commitId: string) => {
    setSelectedCommitId(commitId);
    if (isMoveModeActive) {
        // If move mode was active, and user clicks a commit,
        // it could be interpreted as selecting the target OR just selecting a new commit.
        // For now, let's disable move mode to avoid ambiguity. User can re-enable if needed.
        setIsMoveModeActive(false);
    }
  }, [isMoveModeActive]); // Dependency on isMoveModeActive

  const handleSelectBranch = useCallback((branchName: string) => {
    setSelectedBranchName(branchName);
    if (branches[branchName]) {
      setSelectedCommitId(branches[branchName].headCommitId);
    }
    setIsMoveModeActive(false); // Selecting a branch always exits move mode
  }, [branches]); // Dependency on branches map

  const toggleMoveMode = useCallback(() => {
    if (!selectedCommitId && !isMoveModeActive) { // Can't enter move mode without a selected commit
      toast({ title: "Error", description: "Select a commit to move first.", variant: "destructive"});
      setIsMoveModeActive(false); // Ensure it's off
      return;
    }
    setIsMoveModeActive(prev => !prev);
  }, [selectedCommitId, isMoveModeActive, toast]);


  const handleMoveCommit = useCallback((commitToMoveId: string, newParentId: string) => {
    const currentCommits = {...commits}; // Shallow copy for modification

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
        const current_descendant = q_descendants[head_desc++];
        if (current_descendant === newParentId) {
            isCyclic = true;
            break;
        }
        // Check all commits to see if they are children of current_descendant
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

    // Proceed with the move
    const sourceCommit = currentCommits[commitToMoveId];
    const targetParentCommit = currentCommits[newParentId];
    
    const newCommitsState: Record<string, CommitType> = { ...currentCommits };

    // Update the moved commit itself
    let movedCommitTime = Date.now(); // New timestamp for the moved commit

    newCommitsState[commitToMoveId] = {
      ...sourceCommit,
      parentIds: [newParentId], // New parent
      depth: targetParentCommit.depth + 1,
      branchLane: targetParentCommit.branchLane, // Inherit lane from new parent
      timestamp: movedCommitTime,
    };
    
    // BFS to update descendants of the moved commit
    const queue: string[] = [commitToMoveId];
    const visitedInThisBFSRecalculation = new Set<string>(); // To avoid re-processing in this BFS
    visitedInThisBFSRecalculation.add(commitToMoveId); // Start with the moved commit

    let head = 0;
    let descendantTimestampCounter = 1; // For staggering timestamps of descendants

    while (head < queue.length) {
        const currentProcessedParentId = queue[head++];
        const currentProcessedParentData = newCommitsState[currentProcessedParentId]; // Get the *updated* parent data

        // Find all direct children of currentProcessedParentData in the *original* graph structure
        // These children need their depth, lane, and timestamp updated
        Object.values(currentCommits).forEach(potentialChildCommit => {
            if (potentialChildCommit.parentIds.includes(currentProcessedParentId) && 
                potentialChildCommit.id !== commitToMoveId && // Don't re-process the moved commit if it was its own child (loops)
                !visitedInThisBFSRecalculation.has(potentialChildCommit.id)) { // Process each child only once
                
                 newCommitsState[potentialChildCommit.id] = {
                    ...potentialChildCommit, // Start with the original child data
                    // Parent (currentProcessedParentId) might have changed its depth/lane. Children follow.
                    depth: currentProcessedParentData.depth + 1,
                    branchLane: currentProcessedParentData.branchLane, // Children adopt parent's new lane
                    timestamp: movedCommitTime + descendantTimestampCounter++, // Stagger timestamps
                };
                visitedInThisBFSRecalculation.add(potentialChildCommit.id);
                queue.push(potentialChildCommit.id); // Add this child to the queue to process its children
            }
        });
    }


    setCommits(newCommitsState);
    setIsMoveModeActive(false); // Exit move mode
    setSelectedCommitId(commitToMoveId); // Keep the moved commit selected
    toast({ title: "Commit Moved", description: `Commit ${sourceCommit.message.substring(0,8)} re-parented to ${targetParentCommit.message.substring(0,8)}.`});

  }, [commits, toast]); // Dependencies: commits state and toast

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
    // This is a simplified check. Full git merge has more complex ancestor checks.
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
      depth: Math.max(targetHeadCommit.depth, sourceHeadCommit.depth) + 1, // Place it after the deeper parent
    };

    setCommits(prev => ({ ...prev, [newCommitId]: newMergeCommit }));
    setBranches(prev => ({
      ...prev,
      [targetBranch.name]: { ...targetBranch, headCommitId: newCommitId },
      // Source branch remains unchanged (its head is now a parent of the merge commit)
    }));
    
    setSelectedCommitId(newCommitId); // Select the new merge commit
    setNextCommitIdx(prev => prev + 1);
    toast({ title: "Merge Successful", description: `Branch '${sourceBranchNameToMerge}' merged into '${selectedBranchName}'. New commit: ${newMergeCommit.message.substring(0,25)}...` });

  }, [selectedBranchName, branches, commits, nextCommitIdx, toast]);


  // useMemo will re-calculate the layout whenever commits or branches change.
  const { positionedCommits, edges, graphWidth, graphHeight } = useMemo(() => {
    return calculateLayout(commits, branches);
  }, [commits, branches]); // Dependencies for re-layout

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
        onMoveCommit={handleMoveCommit} // Pass the re-parenting handler
        onMergeBranch={handleMergeBranch}
        onAddCustomCommits={handleAddCustomCommits} 
        isMoveModeActive={isMoveModeActive}
        toggleMoveMode={toggleMoveMode}
      />
      <main className="flex-grow">
        <GitGraph
          commits={commits} // Pass the raw commits for potential direct use if needed by children later
          branches={branches}
          positionedCommits={positionedCommits} // Pass the calculated positions
          edges={edges}
          selectedCommitId={selectedCommitId}
          selectedBranchName={selectedBranchName}
          onCommitSelect={handleSelectCommit}
          onBranchSelect={handleSelectBranch}
          onCommitDrop={handleMoveCommit} // Connect the drop action to the move handler
          height={Math.max(graphHeight, 400)} // Ensure a minimum height
          width={Math.max(graphWidth, 600)}   // Ensure a minimum width
        />
      </main>
      <footer className="text-center text-sm text-muted-foreground py-2">
        <p>Interactive Git simulation. Select commits and branches to perform actions. You can drag commits to re-parent them.</p>
      </footer>
    </div>
  );
}

