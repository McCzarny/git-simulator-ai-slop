
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

const COMMIT_RADIUS = 12;
const SELECTED_STROKE_WIDTH = 2;
const DRAG_OVER_STROKE_COLOR = 'stroke-blue-500';

export function CommitNode({ commit, isSelected, isBranchHead, isCurrentBranchHead, onSelect, onCommitDrop }: CommitNodeProps) {
  const [isBeingDraggedOver, setIsBeingDraggedOver] = useState(false);

  let fillColor;
  if (commit.isCustom) {
    fillColor = 'fill-custom-commit';
  } else if (isCurrentBranchHead) {
    fillColor = 'fill-accent';
  } else if (isBranchHead) {
    fillColor = 'fill-primary';
  } else {
    fillColor = 'fill-secondary';
  }

  let strokeColorClass = isSelected ? 'stroke-accent' : 'stroke-primary';
  let currentStrokeWidth = isSelected ? SELECTED_STROKE_WIDTH : 1;

  if (isBeingDraggedOver) {
    strokeColorClass = DRAG_OVER_STROKE_COLOR;
    currentStrokeWidth = SELECTED_STROKE_WIDTH + 1;
  }

  const handleDragStart = (event: React.DragEvent<SVGGElement>) => {
    event.dataTransfer.setData('application/x-git-commit-id', commit.id);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (event: React.DragEvent<SVGGElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (event: React.DragEvent<SVGGElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes('application/x-git-commit-id')) {
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
    } else if (draggedCommitId === targetParentId) {
      // Consider a toast or a more visible warning for self-drop
      console.warn("Attempted to drop a commit on itself.");
    }
  };

  return (
    <g
      transform={`translate(${commit.x}, ${commit.y})`}
      onClick={() => onSelect(commit.id)}
      className="cursor-pointer group"
      aria-label={`Commit ID ${commit.id}`}
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
        className={`w-4 h-4 text-primary-foreground`}
        style={{ transform: 'translate(-8px, -8px)'}}
      />
      <title>{`Commit: ${commit.id}`}</title>
    </g>
  );
}
