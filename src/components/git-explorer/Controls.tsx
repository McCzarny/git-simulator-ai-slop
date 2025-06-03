
"use client";

import { Button } from '@/components/ui/button';
import { GitCommit, GitBranchPlus, MoveIcon, AlertTriangle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CommitType } from '@/types/git';

interface ControlsProps {
  selectedBranchName: string | null;
  selectedCommitId: string | null;
  commits: Record<string, CommitType>;
  onAddCommit: () => void;
  onCreateBranch: () => void;
  onMoveCommit: (commitToMoveId: string, targetParentId: string) => void; // Updated signature
  isMoveModeActive: boolean;
  toggleMoveMode: () => void;
}

export function Controls({
  selectedBranchName,
  selectedCommitId,
  commits,
  onAddCommit,
  onCreateBranch,
  onMoveCommit,
  isMoveModeActive,
  toggleMoveMode
}: ControlsProps) {
  
  const handleMoveTargetSelect = (targetParentId: string) => {
    if (!selectedCommitId) {
      // This should ideally not happen if move mode is active correctly
      return;
    }
    if(targetParentId === selectedCommitId){
      // Toast is handled by parent
      return;
    }
    onMoveCommit(selectedCommitId, targetParentId); // Use selectedCommitId as the source
  };
  
  const availableCommitsForMove = Object.values(commits).filter(c => c.id !== selectedCommitId);

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
            disabled={!selectedCommitId} // Disable if no commit is selected to initiate move
            variant={isMoveModeActive ? "destructive" : "outline"}
            aria-label={isMoveModeActive ? "Cancel Move Commit (or use drag-and-drop)" : "Initiate Move Commit (or use drag-and-drop)"}
          >
            <MoveIcon className="mr-2 h-4 w-4" /> {isMoveModeActive ? 'Cancel Move' : 'Move Commit'}
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
        
        <div className="text-sm text-muted-foreground">
          {selectedBranchName && <p>Selected Branch: <span className="font-semibold text-primary">{selectedBranchName}</span></p>}
          {selectedCommitId && <p>Selected Commit: <span className="font-semibold text-accent">{commits[selectedCommitId]?.message.substring(0,8)}</span></p>}
        </div>
      </CardContent>
    </Card>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
