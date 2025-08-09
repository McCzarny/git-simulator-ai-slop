export interface CommitType {
  id: string;
  parentIds: string[];
  timestamp: number;
  branchLane: number; // For X position calculation
  depth: number; // For Y position calculation
  isCustom?: boolean; // To flag custom commits for styling
  label?: string; // Optional label for the commit
  // x and y coordinates are purely presentational and will be part of PositionedCommit
}

export interface BranchType {
  name: string;
  headCommitId: string;
  lane: number; // Assigned X lane for layout
}

// PositionedCommit now explicitly takes all properties from CommitType
// (ensuring none are accidentally omitted if CommitType changes) and adds x, y.
export interface PositionedCommit extends CommitType {
  x: number; // Calculated X position for rendering
  y: number; // Calculated Y position for rendering
}

export interface Edge {
  from: PositionedCommit;
  to: PositionedCommit;
}
