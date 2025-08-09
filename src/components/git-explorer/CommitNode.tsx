"use client";

import type { PositionedCommit } from '@/types/git';
import { GitCommit } from 'lucide-react';
import React from 'react';

interface CommitNodeProps {
  commit: PositionedCommit;
  isSelected: boolean;
  isBranchHead: boolean;
  isCurrentBranchHead: boolean;
  onSelect: (commitId: string) => void;
  showLabel: boolean;
}

const COMMIT_RADIUS = 12;
const SELECTED_STROKE_WIDTH = 2;

export function CommitNode({ commit, isSelected, isBranchHead, isCurrentBranchHead, onSelect, showLabel }: CommitNodeProps) {
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

  const strokeColorClass = isSelected ? 'stroke-accent' : 'stroke-primary';
  const currentStrokeWidth = isSelected ? SELECTED_STROKE_WIDTH : 1;

  return (
    <g
      transform={`translate(${commit.x}, ${commit.y})`}
      onClick={() => onSelect(commit.id)}
      className="cursor-pointer group"
      aria-label={`Commit ID ${commit.id}`}
    >
      <circle
        cx={0}
        cy={0}
        r={COMMIT_RADIUS}
        className={`${fillColor} ${strokeColorClass} transition-all duration-150 group-hover:opacity-80`}
        strokeWidth={currentStrokeWidth}
      />
      <g transform="translate(-8 -8)">
        <GitCommit
          className="text-primary-foreground" 
          width={16} 
          height={16} 
        />
      </g>
      {showLabel && (
        <text
          x="0"
          y={COMMIT_RADIUS + 14}
          textAnchor="middle"
          fontSize="10"
          className="fill-muted-foreground"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {commit.id}
        </text>
      )}
      {commit.label && (
        <text
          x="0"
          y={-COMMIT_RADIUS - 5}
          textAnchor="middle"
          fontSize="10"
          className="fill-primary font-semibold"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {commit.label}
        </text>
      )}
      <title>{`Commit: ${commit.id}`}</title>
    </g>
  );
}
