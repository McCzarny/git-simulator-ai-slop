
"use client";

import type { PositionedCommit } from '@/types/git';
import { GitCommit } from 'lucide-react';
import React, { useState } from 'react';

interface CommitNodeProps {
  commit: PositionedCommit;
  isSelected: boolean;
  isBranchHead: boolean;
  isCurrentBranchHead: boolean;
  onSelect: (commitId: string) => void;
  onCommitDrop: (draggedCommitId: string, targetParentId: string) => void;
}

const COMMIT_RADIUS = 20;
const SELECTED_STROKE_WIDTH = 3;
const DRAG_OVER_STROKE_COLOR = 'stroke-blue-500'; // A distinct color for drop target indication

export function CommitNode({ commit, isSelected, isBranchHead, isCurrentBranchHead, onSelect, onCommitDrop }: CommitNodeProps) {
  const [isBeingDraggedOver, setIsBeingDraggedOver] = useState(false);

  const fillColor = isCurrentBranchHead ? 'fill-accent' : (isBranchHead ? 'fill-primary' : 'fill-secondary');
  
  let strokeColorClass = isSelected ? 'stroke-accent' : 'stroke-primary';
  let currentStrokeWidth = isSelected ? SELECTED_STROKE_WIDTH : 1;

  if (isBeingDraggedOver) {
    strokeColorClass = DRAG_OVER_STROKE_COLOR;
    currentStrokeWidth = SELECTED_STROKE_WIDTH + 1; // Make it slightly thicker
  }

  const handleDragStart = (event: React.DragEvent<SVGGElement>) => {
    event.dataTransfer.setData('application/x-git-commit-id', commit.id);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (event: React.DragEvent<SVGGElement>) => {
    event.preventDefault(); // Necessary to allow dropping
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (event: React.DragEvent<SVGGElement>) => {
    event.preventDefault();
    // Check if the dragged item is another commit and not itself
    const draggedCommitId = event.dataTransfer.types.includes('application/x-git-commit-id') ? event.dataTransfer.getData('application/x-git-commit-id') : null;
    if (commit.id !== draggedCommitId) { // Cannot drop on itself
      setIsBeingDraggedOver(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<SVGGElement>) => {
    event.preventDefault();
    setIsBeingDraggedOver(false);
  };

  const handleDrop = (event: React.DragEvent<SVGGElement>) => {
    event.preventDefault();
    setIsBeingDraggedOver(false);
    const draggedCommitId = event.dataTransfer.getData('application/x-git-commit-id');
    const targetParentId = commit.id;

    if (draggedCommitId && draggedCommitId !== targetParentId) {
      onCommitDrop(draggedCommitId, targetParentId);
    }
  };

  return (
    <g
      transform={`translate(${commit.x}, ${commit.y})`}
      onClick={() => onSelect(commit.id)}
      className="cursor-pointer group"
      aria-label={`Commit ${commit.message}`}
      draggable={true}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <circle
        cx={0}
        cy={0}
        r={COMMIT_RADIUS}
        className={`${fillColor} ${strokeColorClass} transition-all duration-150 group-hover:opacity-80`}
        strokeWidth={currentStrokeWidth}
      />
      <GitCommit
        className={`w-5 h-5 text-primary-foreground absolute-center-translate`}
        style={{ transform: 'translate(-10px, -10px)'}}
      />
      <title>{`Commit: ${commit.message}\nID: ${commit.id}\nParents: ${commit.parentIds.join(', ')}\n(Drag to move, drop on another commit to re-parent)`}</title>
      <text
        y={COMMIT_RADIUS + 16}
        textAnchor="middle"
        className="text-xs fill-foreground select-none"
      >
        {commit.message.substring(0,8)}
      </text>
    </g>
  );
}
