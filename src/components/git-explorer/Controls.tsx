"use client";

import { Button } from '@/components/ui/button';
import { GitCommit, GitBranchPlus, MoveIcon, AlertTriangle, GitMergeIcon, Layers, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CommitType, BranchType } from '@/types/git';
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ControlsProps {
  selectedBranchName: string | null;
  selectedCommitId: string | null;
  commits: Record<string, CommitType>; // Kept for selectedCommitId display if needed
  branches: Record<string, BranchType>;
  onAddCommit: () => void;
  onCreateBranch: () => void;
  onMoveCommit: (commitToMoveId: string, targetParentId: string) => void;
  onMergeBranch: (sourceBranchName: string) => void;
  onAddCustomCommits: () => void;
  isMoveModeActive: boolean;
  toggleMoveMode: () => void;
  onReset: () => void;
}

export function Controls({
  selectedBranchName,
  selectedCommitId,
  commits, // Still needed for selectedCommitId to get its details for display
  branches,
  onAddCommit,
  onCreateBranch,
  onMoveCommit,
  onMergeBranch,
  onAddCustomCommits,
  isMoveModeActive,
  toggleMoveMode,
  onReset
}: ControlsProps) {

  const [sourceBranchForMerge, setSourceBranchForMerge] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(true); // Domyślnie rozwinięte menu
  const [position, setPosition] = useState({ x: 20, y: 20 }); // Tymczasowa pozycja początkowa
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Ładowanie zapisanej pozycji menu
  useEffect(() => {
    try {
      const savedPosition = localStorage.getItem('gitExplorerMenuPosition');
      if (savedPosition) {
        const parsedPosition = JSON.parse(savedPosition);
        setPosition(parsedPosition);
      } else {
        // Jeśli nie ma zapisanej pozycji, ustaw menu po prawej stronie
        if (typeof window !== 'undefined') {
          setPosition({ x: window.innerWidth - 320, y: 80 });
        }
      }
    } catch (error) {
      console.error('Error loading saved menu position:', error);
      // W przypadku błędu, również spróbuj ustawić po prawej
      if (typeof window !== 'undefined') {
        setPosition({ x: window.innerWidth - 320, y: 80 });
      }
    }
  }, []);

  // Zapisywanie pozycji menu
  useEffect(() => {
    if (!isDragging) {
      try {
        localStorage.setItem('gitExplorerMenuPosition', JSON.stringify(position));
      } catch (error) {
        console.error('Error saving menu position:', error);
      }
    }
  }, [position, isDragging]);

  // Obsługa przeciągania menu
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDragging(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    }
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Dodaj/usuń globalnych handlerów dla ruchu myszy
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Obsługa zmiany rozmiaru okna
  useEffect(() => {
    const handleResize = () => {
      setPosition(prevPos => {
        // Sprawdź, czy menu nie wychodzi poza granice ekranu po zmianie rozmiaru
        const maxX = window.innerWidth - 300; // przybliżona szerokość menu
        const maxY = window.innerHeight - 100; // przybliżona wysokość menu
        
        return {
          x: Math.min(Math.max(0, prevPos.x), maxX),
          y: Math.min(Math.max(0, prevPos.y), maxY)
        };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

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
  <Card 
    className="p-2 shadow-md bg-background/90 backdrop-blur-md border-2 cursor-move"
    style={{ 
      position: 'absolute',
      left: `${position.x}px`, 
      top: `${position.y}px`,
      zIndex: 50,
      opacity: isDragging ? 0.8 : 1,
      transition: isDragging ? 'none' : 'opacity 0.2s',
      borderRadius: '8px',
      borderRightWidth: typeof window !== 'undefined' && position.x > window.innerWidth - 350 ? '0' : '2px',
      borderTopRightRadius: typeof window !== 'undefined' && position.x > window.innerWidth - 350 ? '0' : '8px',
      borderBottomRightRadius: typeof window !== 'undefined' && position.x > window.innerWidth - 350 ? '0' : '8px'
    }}
  >
      <CardHeader className="p-3 select-none" onMouseDown={handleMouseDown}>
        <CardTitle className="text-lg flex justify-between items-center">
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span>Git Actions</span>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => {
            e.stopPropagation(); // Zapobiega wyzwoleniu przeciągania
            setIsExpanded(!isExpanded);
          }}>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardTitle>
        <CardDescription className="text-xs">Perform operations on the Git graph.</CardDescription>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-3 p-3">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={onAddCommit}
              disabled={!selectedBranchName || isMoveModeActive}
              aria-label="Add new commit to selected branch"
              variant="outline"
              size="sm"
            >
              <GitCommit className="mr-1 h-3.5 w-3.5" /> Add Commit
            </Button>
            <Button
              onClick={onCreateBranch}
              disabled={!selectedCommitId || isMoveModeActive}
              aria-label="Create new branch from selected commit"
              variant="outline"
              size="sm"
            >
              <GitBranchPlus className="mr-1 h-3.5 w-3.5" /> Create Branch
            </Button>
            <Button
              onClick={toggleMoveMode}
              disabled={!selectedCommitId}
              variant={isMoveModeActive ? "destructive" : "outline"}
              aria-label={isMoveModeActive ? "Cancel Move Commit (or use drag-and-drop)" : "Initiate Move Commit (or use drag-and-drop)"}
              size="sm"
            >
              <MoveIcon className="mr-1 h-3.5 w-3.5" /> {isMoveModeActive ? 'Cancel Move' : 'Move Commit'}
            </Button>
            <Button
              onClick={onAddCustomCommits}
              disabled={!selectedCommitId || isMoveModeActive}
              aria-label="Create new branch with 4 custom commits from selected commit"
              variant="outline"
              size="sm"
            >
              <Layers className="mr-1 h-3.5 w-3.5" /> Apply Customisations
            </Button>
            <Button
              onClick={onReset}
              variant="secondary"
              aria-label="Resetuj symulację"
              size="sm"
            >
              Reset
            </Button>
          </div>

          {isMoveModeActive && selectedCommitId && (
            <div className="p-3 border rounded-md bg-secondary/50">
              <p className="text-xs font-medium text-secondary-foreground mb-2">
                <AlertTriangle className="inline mr-1 h-3.5 w-3.5 text-amber-500" />
                Moving commit: <span className="font-bold">{selectedCommitId}</span>. Select new parent:
              </p>
              <Select onValueChange={handleMoveTargetSelect} disabled={availableCommitsForMove.length === 0 || !selectedCommitId}>
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Select target parent commit..." />
                </SelectTrigger>
                <SelectContent>
                  {availableCommitsForMove.map(commit => (
                    <SelectItem key={commit.id} value={commit.id} className="text-xs">
                      Commit ID: {commit.id}
                    </SelectItem>
                  ))}
                  {availableCommitsForMove.length === 0 && (
                    <div className="p-2 text-xs text-muted-foreground">No other commits available to be parent.</div>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isMoveModeActive && selectedBranchName && (
            <div className="p-3 border rounded-md bg-secondary/50">
              <p className="text-xs font-medium text-secondary-foreground mb-2">
                Merge into <span className="font-bold">{selectedBranchName}</span>:
              </p>
              <div className="flex gap-2">
                <Select
                  onValueChange={setSourceBranchForMerge}
                  value={sourceBranchForMerge || ""}
                  disabled={availableBranchesForMerge.length === 0}
                >
                  <SelectTrigger className="flex-grow h-8 text-xs">
                    <SelectValue placeholder="Select source branch to merge..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBranchesForMerge.map(branchName => (
                      <SelectItem key={branchName} value={branchName} className="text-xs">
                        {branchName} (Head: {branches[branchName].headCommitId})
                      </SelectItem>
                    ))}
                    {availableBranchesForMerge.length === 0 && (
                      <div className="p-2 text-xs text-muted-foreground">No branches available to merge.</div>
                    )}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleMergeClick}
                  disabled={!sourceBranchForMerge || !selectedBranchName}
                  aria-label={`Merge branch ${sourceBranchForMerge || ''} into ${selectedBranchName}`}
                  size="sm"
                >
                  <GitMergeIcon className="mr-1 h-3.5 w-3.5" /> Merge
                </Button>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground pt-1">
            {selectedBranchName && <p>Selected Branch: <span className="font-semibold text-primary">{selectedBranchName}</span></p>}
            {selectedCommitId && <p>Selected Commit ID: <span className="font-semibold text-accent">{selectedCommitId}</span></p>}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
