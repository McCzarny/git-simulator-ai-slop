"use client";

import { Button } from '@/components/ui/button';
import { GitCommit, GitBranchPlus, MoveIcon, AlertTriangle, GitMergeIcon, Layers, ChevronUp, ChevronDown, GripVertical, Trash2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';

interface ControlsProps {
  selectionType: 'branch' | 'commit';
  selectedBranchName: string | null;
  selectedCommitId: string | null;
  commits: Record<string, CommitType>; // Kept for selectedCommitId display if needed
  branches: Record<string, BranchType>;
  onAddCommit: () => void;
  onCreateBranch: () => void;
  onMergeBranch: (sourceBranchName: string) => void;
  onAddCustomCommits: () => void;
  onReset: () => void;
  onClear: () => void;
  onDelete: () => void;
  showCommitIds: boolean;
  onToggleShowCommitIds: () => void;
  onUpdateCommitLabel: (commitId: string, label: string) => void;
}

export function Controls({
  selectionType,
  selectedBranchName,
  selectedCommitId,
  commits, // Still needed for selectedCommitId to get its details for display
  branches,
  onAddCommit,
  onCreateBranch,
  onMergeBranch,
  onAddCustomCommits,
  onReset,
  onClear,
  onDelete,
  showCommitIds,
  onToggleShowCommitIds,
  onUpdateCommitLabel,
}: ControlsProps) {

  const [sourceBranchForMerge, setSourceBranchForMerge] = useState<string | null>(null);
  const [commitLabel, setCommitLabel] = useState('');
  const [isExpanded, setIsExpanded] = useState<boolean>(true); // Domyślnie rozwinięte menu
  const [position, setPosition] = useState({ x: 20, y: 20 }); // Tymczasowa pozycja początkowa
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const isDeleteDisabled = 
    (selectionType === 'branch' && selectedBranchName === 'master');


  useEffect(() => {
    if (selectedCommitId && commits[selectedCommitId]) {
      setCommitLabel(commits[selectedCommitId].label || '');
    } else {
      setCommitLabel('');
    }
  }, [selectedCommitId, commits]);

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
          {/* Global Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={onReset}
              variant="secondary"
              aria-label="Resetuj symulację"
              size="sm"
            >
              Reset
            </Button>
            <Button
              onClick={onClear}
              variant="destructive"
              aria-label="Clear graph"
              size="sm"
            >
              Clear
            </Button>
            <Button
                onClick={onToggleShowCommitIds}
                variant="outline"
                size="sm"
                aria-label={showCommitIds ? "Hide commit ids" : "Show commit ids"}
            >
                {showCommitIds ? "Hide Ids" : "Show Ids"}
            </Button>
          </div>

          {/* Contextual Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            {selectionType === 'branch' && (
              <>
                <Button
                  onClick={onAddCommit}
                  disabled={!selectedBranchName}
                  aria-label="Add new commit to selected branch"
                  variant="outline"
                  size="sm"
                >
                  <GitCommit className="mr-1 h-3.5 w-3.5" /> Add Commit
                </Button>
                <Button
                  onClick={handleMergeClick}
                  disabled={!sourceBranchForMerge || !selectedBranchName}
                  aria-label={`Merge branch ${sourceBranchForMerge || ''} into ${selectedBranchName}`}
                  size="sm"
                >
                  <GitMergeIcon className="mr-1 h-3.5 w-3.5" /> Merge
                </Button>
              </>
            )}
            {selectionType === 'commit' && (
              <>
                <Button
                  onClick={onCreateBranch}
                  disabled={!selectedCommitId}
                  aria-label="Create new branch from selected commit"
                  variant="outline"
                  size="sm"
                >
                  <GitBranchPlus className="mr-1 h-3.5 w-3.5" /> Create Branch
                </Button>
                <Button
                  onClick={onAddCustomCommits}
                  disabled={!selectedCommitId}
                  aria-label="Create new branch with 4 custom commits from selected commit"
                  variant="outline"
                  size="sm"
                >
                  <Layers className="mr-1 h-3.5 w-3.5" /> Apply Customisations
                </Button>
              </>
            )}
             <Button
              onClick={onDelete}
              variant="destructive"
              size="sm"
              disabled={isDeleteDisabled}
              aria-label="Delete selected branch or commit's branch"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          </div>

          {selectionType === 'commit' && selectedCommitId && (
            <div className="p-3 border rounded-md bg-secondary/50">
              <p className="text-xs font-medium text-secondary-foreground mb-2">
                Label for commit <span className="font-bold">{selectedCommitId}</span>:
              </p>
              <Input
                type="text"
                placeholder="Enter commit label..."
                value={commitLabel}
                onChange={(e) => setCommitLabel(e.target.value)}
                onBlur={() => onUpdateCommitLabel(selectedCommitId, commitLabel)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onUpdateCommitLabel(selectedCommitId, commitLabel);
                  }
                }}
                className="h-8 text-xs"
              />
            </div>
          )}

          {selectionType === 'branch' && selectedBranchName && (
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
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground pt-1">
            {selectedBranchName && <p>Selected Branch: <span className="font-semibold text-primary">{selectedBranchName}</span></p>}
            {selectedCommitId && <p>Selected Commit ID: <span className="font-semibold text-accent">{selectedCommitId}</span></p>}
            {selectedCommitId && commits[selectedCommitId] && commits[selectedCommitId].parentIds.length > 0 && (
              <p>Commit parents: <span className="font-semibold text-accent">{commits[selectedCommitId].parentIds.join(', ')}</span></p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
