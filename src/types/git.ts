export interface CommitType {
  id: string;
  parentIds: string[];
  message: string;
  timestamp: number;
  branchLane: number; // For X position calculation
  depth: number; // For Y position calculation
  x?: number; // Calculated X position for rendering
  y?: number; // Calculated Y position for rendering
}

export interface BranchType {
  name: string;
  headCommitId: string;
  lane: number; // Assigned X lane for layout
}

export interface PositionedCommit extends CommitType {
  x: number;
  y: number;
}

export interface Edge {
  from: PositionedCommit;
  to: PositionedCommit;
}
