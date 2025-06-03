"use client";

import type { PositionedCommit } from '@/types/git';
import { GitCommit } from 'lucide-react';

interface CommitNodeProps {
  commit: PositionedCommit;
  isSelected: boolean;
  isBranchHead: boolean;
  isCurrentBranchHead: boolean;
  onSelect: (commitId: string) => void;
}

const COMMIT_RADIUS = 20;
const SELECTED_STROKE_WIDTH = 3;

export function CommitNode({ commit, isSelected, isBranchHead, isCurrentBranchHead, onSelect }: CommitNodeProps) {
  const fillColor = isCurrentBranchHead ? 'fill-accent' : (isBranchHead ? 'fill-primary' : 'fill-secondary');
  const strokeColor = isSelected ? 'stroke-accent' : 'stroke-primary';
  const strokeWidth = isSelected ? SELECTED_STROKE_WIDTH : 1;

  return (
    <g
      transform={`translate(${commit.x}, ${commit.y})`}
      onClick={() => onSelect(commit.id)}
      className="cursor-pointer group"
      aria-label={`Commit ${commit.message}`}
    >
      <circle
        cx={0}
        cy={0}
        r={COMMIT_RADIUS}
        className={`${fillColor} ${strokeColor} transition-all duration-300 group-hover:opacity-80`}
        strokeWidth={strokeWidth}
      />
      <GitCommit
        className={`w-5 h-5 text-primary-foreground absolute-center-translate`}
        style={{ transform: 'translate(-10px, -10px)'}}
      />
      <title>{`Commit: ${commit.message}\nID: ${commit.id}\nParents: ${commit.parentIds.join(', ')}`}</title>
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
