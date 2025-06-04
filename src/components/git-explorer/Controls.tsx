
"use client";

import { Button } from '@/components/ui/button';
import { GitCommit, GitBranchPlus, MoveIcon, AlertTriangle, GitMergeIcon, Layers } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CommitType, BranchType } from '@/types/git';
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ControlsProps {
  selectedBranchName: string | null;
  selectedCommitId: string | null;
  commits: Record<string, CommitType>;
  branches: Record<string, BranchType>;
  onAddCommit: () => void;
  onCreateBranch: () => void;
  onMoveCommit: (commitToMoveId: string, targetParentId: string) => void;
  onMergeBranch: (sourceBranchName: string) => void;
  onAddCustomCommits: () => void;
  isMoveModeActive: boolean;
  toggleMoveMode: () => void;
}

export function Controls({
  selectedBranchName,
  selectedCommitId,
  commits,
  branches,
  onAddCommit,
  onCreateBranch,
  onMoveCommit,
  onMergeBranch,
  onAddCustomCommits,
  isMoveModeActive,
  toggleMoveMode
}: ControlsProps) {
  
  const [sourceBranchForMerge, setSourceBranchForMerge] = useState<string | null>(null);

  const handleMoveTargetSelect = (targetParentId: string) => {
    if (!selectedCommitId) {
      return;
    }
    if(targetParentId === selectedCommitId){
      return;
    }
    onMoveCommit(selectedCommitId, targetParentId);
  };
  
  const availableCommitsForMove = Object.values(commits).filter(c => c.id !== selectedCommitId);
  const availableBranchesForMerge = selectedBranchName && selectedCommitId && commits[selectedCommitId]
    ? Object.keys(branches).filter(bName => bName !== selectedBranchName && !commits[selectedCommitId!]?.parentIds.includes(branches[bName].headCommitId))
    : [];


  const handleMergeClick = () => {
    if (sourceBranchForMerge) {
      onMergeBranch(sourceBranchForMerge);
      setSourceBranchForMerge(null); // Reset after attempting merge
    }
  };

  return (
    <Card className="p-4 shadow-md">
      <CardHeader>
        <CardTitle>Git Actions</CardTitle>
        <CardDescription>Perform operations on the Git graph. You can also drag-and-drop commits to move them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={onAddCommit}
            disabled={!selectedBranchName || isMoveModeActive}
            aria-label="Add new commit to selected branch"
            variant="outline"
          >
            <GitCommit className="mr-2 h-4 w-4" /> Add Commit
          </Button>
          <Button
            onClick={onCreateBranch}
            disabled={!selectedCommitId || isMoveModeActive}
            aria-label="Create new branch from selected commit"
            variant="outline"
          >
            <GitBranchPlus className="mr-2 h-4 w-4" /> Create Branch
          </Button>
          <Button
            onClick={toggleMoveMode}
            disabled={!selectedCommitId}
            variant={isMoveModeActive ? "destructive" : "outline"}
            aria-label={isMoveModeActive ? "Cancel Move Commit (or use drag-and-drop)" : "Initiate Move Commit (or use drag-and-drop)"}
          >
            <MoveIcon className="mr-2 h-4 w-4" /> {isMoveModeActive ? 'Cancel Move' : 'Move Commit'}
          </Button>
          <Button
            onClick={onAddCustomCommits}
            disabled={!selectedCommitId || isMoveModeActive}
            aria-label="Create new branch with 4 custom commits from selected commit"
            variant="outline"
          >
            <Layers className="mr-2 h-4 w-4" /> Apply Customisations
          </Button>
        </div>

        {isMoveModeActive && selectedCommitId && (
          <div className="p-4 border rounded-md bg-secondary/50">
            <p className="text-sm font-medium text-secondary-foreground mb-2">
              <AlertTriangle className="inline mr-2 h-4 w-4 text-amber-500" />
              Moving commit: <span className="font-bold">{commits[selectedCommitId]?.message.substring(0,8)}</span>. Select new parent:
            </p>
            <Select onValueChange={handleMoveTargetSelect} disabled={availableCommitsForMove.length === 0 || !selectedCommitId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select target parent commit..." />
              </SelectTrigger>
              <SelectContent>
                {availableCommitsForMove.map(commit => (
                  <SelectItem key={commit.id} value={commit.id}>
                    {commit.message.substring(0,8)} (ID: {commit.id})
                  </SelectItem>
                ))}
                {availableCommitsForMove.length === 0 && (
                  <div className="p-2 text-sm text-muted-foreground">No other commits available to be parent.</div>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              Note: Moving commits can simplify or alter history. This is a basic re-parenting operation. Alternatively, try dragging the commit.
            </p>
          </div>
        )}

        {!isMoveModeActive && selectedBranchName && (
          <div className="p-4 border rounded-md bg-secondary/50 mt-4">
            <p className="text-sm font-medium text-secondary-foreground mb-2">
              Merge into <span className="font-bold">{selectedBranchName}</span>:
            </p>
            <div className="flex gap-2">
              <Select 
                onValueChange={setSourceBranchForMerge} 
                value={sourceBranchForMerge || ""}
                disabled={availableBranchesForMerge.length === 0}
              >
                <SelectTrigger className="flex-grow">
                  <SelectValue placeholder="Select source branch to merge..." />
                </SelectTrigger>
                <SelectContent>
                  {availableBranchesForMerge.map(branchName => (
                    <SelectItem key={branchName} value={branchName}>
                      {branchName} (Head: {commits[branches[branchName].headCommitId]?.message.substring(0,8)})
                    </SelectItem>
                  ))}
                  {availableBranchesForMerge.length === 0 && (
                    <div className="p-2 text-sm text-muted-foreground">No other branches available to merge.</div>
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={handleMergeClick}
                disabled={!sourceBranchForMerge || !selectedBranchName}
                aria-label={`Merge branch ${sourceBranchForMerge || ''} into ${selectedBranchName}`}
              >
                <GitMergeIcon className="mr-2 h-4 w-4" /> Merge
              </Button>
            </div>
          </div>
        )}
        
        <div className="text-sm text-muted-foreground pt-2">
          {selectedBranchName && <p>Selected Branch: <span className="font-semibold text-primary">{selectedBranchName}</span></p>}
          {selectedCommitId && <p>Selected Commit: <span className="font-semibold text-accent">{commits[selectedCommitId]?.message.substring(0,8)}</span></p>}
        </div>
      </CardContent>
    </Card>
  );
}

