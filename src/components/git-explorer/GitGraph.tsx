"use client";

import type { BranchType, CommitType, Edge, PositionedCommit } from '@/types/git';
import { CommitNode } from './CommitNode';
import { BranchLabel } from './BranchLabel';
import React from 'react';

interface GitGraphProps {
  commits: Record<string, CommitType>; // Keep this for easy lookup if needed by children later
  branches: Record<string, BranchType>;
  positionedCommits: PositionedCommit[];
  edges: Edge[];
  selectedCommitId: string | null;
  selectedBranchName: string | null;
  onCommitSelect: (commitId: string) => void;
  onBranchSelect: (branchName: string) => void;
  height: number;
  width: number;
  showCommitLabels: boolean;
}

const ARROW_MARKER_ID = "arrow-marker";
// const MERGE_ARROW_MARKER_ID = "merge-arrow-marker"; // Optional: for different colored arrows

export function GitGraph({
  commits, // Keep commits prop if it's used for something else or planned for future use
  branches,
  positionedCommits,
  edges,
  selectedCommitId,
  selectedBranchName,
  onCommitSelect,
  onBranchSelect,
  height,
  width,
  showCommitLabels,
}: GitGraphProps) {
  if (!positionedCommits.length) {
    return <div className="text-center p-8 text-muted-foreground">No commits to display.</div>;
  }

  // Collision detection: warn if any two nodes overlap (same or very close x/y)
  const COLLISION_THRESHOLD = 2; // px, adjust as needed
  for (let i = 0; i < positionedCommits.length; i++) {
    for (let j = i + 1; j < positionedCommits.length; j++) {
      const a = positionedCommits[i];
      const b = positionedCommits[j];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (dx < COLLISION_THRESHOLD && dy < COLLISION_THRESHOLD) {
        // eslint-disable-next-line no-console
        console.warn(
          `COLLISION: Commits '${a.id}' and '${b.id}' overlap at (${a.x}, ${a.y}) ≈ (${b.x}, ${b.y})`
        );
      }
    }
  }

  const headCommitsByBranch = Object.fromEntries(
    Object.values(branches).map(b => [b.name, b.headCommitId])
  );
  const commitIsBranchHead = (commitId: string) => Object.values(headCommitsByBranch).includes(commitId);

  return (
    <div className="w-full h-full overflow-auto border rounded-md shadow-lg bg-card">
      <svg width={width} height={height} className="min-w-full min-h-full">
        <defs>
          <marker
            id={ARROW_MARKER_ID}
            markerWidth="10"
            markerHeight="7"
            refX="10" 
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" className="fill-primary" />
          </marker>
          {/* 
          // Optional: Define a separate marker for merge lines if you want different arrow color
          <marker
            id={MERGE_ARROW_MARKER_ID}
            markerWidth="10"
            markerHeight="7"
            refX="10"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" className="fill-accent" />
          </marker>
          */}
        </defs>
        <g>
          {edges.map((edge, index) => {
            // edge.from is the child commit (potentially a merge commit)
            // edge.to is the parent commit
            const childCommitIsMerge = edge.from.parentIds.length > 1;
            // The second parent (parentIds[1]) is conventionally the head of the merged-in branch
            const isActualMergeLine = childCommitIsMerge && edge.to.id === edge.from.parentIds[1];
            
            // const markerId = isActualMergeLine ? MERGE_ARROW_MARKER_ID : ARROW_MARKER_ID; // If using separate markers

            return (
              <line
                key={`edge-${index}-${edge.from.id}-${edge.to.id}`} // More specific key
                x1={edge.from.x}
                y1={edge.from.y}
                x2={edge.to.x}
                y2={edge.to.y}
                className={`transition-all duration-300 ${
                  isActualMergeLine ? 'stroke-accent' : 'stroke-primary/70'
                }`}
                strokeWidth="2"
                markerEnd={`url(#${ARROW_MARKER_ID})`} // Using single marker type for now
              />
            );
          })}
        </g>
        <g>
          {positionedCommits.map((commit) => (
            <CommitNode
              key={commit.id}
              commit={commit}
              isSelected={selectedCommitId === commit.id}
              isBranchHead={commitIsBranchHead(commit.id)}
              isCurrentBranchHead={selectedBranchName ? branches[selectedBranchName]?.headCommitId === commit.id : false}
              onSelect={onCommitSelect}
              showLabel={showCommitLabels}
            />
          ))}
        </g>
        <g>
          {Object.values(branches).map((branch) => {
            const headCommit = positionedCommits.find(c => c.id === branch.headCommitId);
            if (!headCommit) return null;
            return (
              <BranchLabel
                key={branch.name}
                branch={branch}
                headCommitPosition={{ x: headCommit.x, y: headCommit.y }}
                isSelected={selectedBranchName === branch.name}
                onSelect={onBranchSelect}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
