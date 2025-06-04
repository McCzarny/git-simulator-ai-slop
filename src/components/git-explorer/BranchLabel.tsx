
"use client";

import type { BranchType, PositionedCommit } from '@/types/git';

interface BranchLabelProps {
  branch: BranchType;
  headCommitPosition: { x: number; y: number };
  isSelected: boolean;
  onSelect: (branchName: string) => void;
}

export function BranchLabel({ branch, headCommitPosition, isSelected, onSelect }: BranchLabelProps) {
  const labelColor = isSelected ? 'fill-accent' : 'fill-primary';
  const fontWeight = isSelected ? 'font-bold' : 'font-medium';

  // Adjusted Y-offset to move the label below the commit dot.
  // Commit radius is 12. Rect height is 24, rect y is -15.
  // New Y_OFFSET_GROUP = 30.
  // Rect top in screen coords: headCommitPosition.y + 30 - 15 = headCommitPosition.y + 15.
  // Commit bottom in screen coords: headCommitPosition.y + 12.
  // Gap is 3px.
  return (
    <g
      transform={`translate(${headCommitPosition.x}, ${headCommitPosition.y + 30})`}
      onClick={() => onSelect(branch.name)}
      className="cursor-pointer group"
      aria-label={`Branch ${branch.name}`}
    >
      <rect
        x={-40}
        y={-15}
        width={80}
        height={24}
        rx={5}
        ry={5}
        className={`${isSelected ? 'fill-accent/20' : 'fill-primary/10'} stroke-primary/50 group-hover:fill-primary/20 transition-colors duration-300`}
      />
      <text
        textAnchor="middle"
        className={`${labelColor} ${fontWeight} text-sm select-none`}
      >
        {branch.name}
      </text>
      <title>{`Branch: ${branch.name}`}</title>
    </g>
  );
}
