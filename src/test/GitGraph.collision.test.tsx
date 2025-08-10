import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { GitGraph } from '@/components/git-explorer/GitGraph'
import type { PositionedCommit, BranchType, Edge } from '@/types/git'

// Mock console.warn to capture collision warnings
const mockConsoleWarn = vi.fn()
global.console.warn = mockConsoleWarn

describe('GitGraph Collision Detection', () => {
  beforeEach(() => {
    mockConsoleWarn.mockClear()
  })

  const createMockCommit = (id: string, x: number, y: number): PositionedCommit => ({
    id,
    parentIds: [],
    timestamp: Date.now(),
    branchLane: 0,
    depth: 0,
    x,
    y,
  })

  const mockBranches: Record<string, BranchType> = {
    master: { name: 'master', headCommitId: 'commit1', lane: 0 },
  }

  const mockProps = {
    commits: {},
    branches: mockBranches,
    positionedCommits: [],
    edges: [] as Edge[],
    selectedCommitId: null,
    selectedBranchName: null,
    onCommitSelect: () => {},
    onBranchSelect: () => {},
    onCommitDrop: () => {},
    height: 400,
    width: 600,
  }

  it('should detect collision when nodes have identical positions', () => {
    const positionedCommits = [
      createMockCommit('commit1', 100, 100),
      createMockCommit('commit2', 100, 100), // Same position as commit1
    ]

    render(
      <GitGraph
        {...mockProps}
        positionedCommits={positionedCommits}
      />
    )

    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('COLLISION: Commits \'commit1\' and \'commit2\' overlap')
    )
  })

  it('should detect collision when nodes are very close (within threshold)', () => {
    const positionedCommits = [
      createMockCommit('commit1', 100, 100),
      createMockCommit('commit2', 101, 101), // 1px distance - within threshold
    ]

    render(
      <GitGraph
        {...mockProps}
        positionedCommits={positionedCommits}
      />
    )

    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('COLLISION: Commits \'commit1\' and \'commit2\' overlap')
    )
  })

  it('should not detect collision when nodes are sufficiently far apart', () => {
    const positionedCommits = [
      createMockCommit('commit1', 100, 100),
      createMockCommit('commit2', 150, 150), // 50px distance - well beyond threshold
    ]

    render(
      <GitGraph
        {...mockProps}
        positionedCommits={positionedCommits}
      />
    )

    expect(mockConsoleWarn).not.toHaveBeenCalled()
  })

  it('should detect multiple collisions', () => {
    const positionedCommits = [
      createMockCommit('commit1', 100, 100),
      createMockCommit('commit2', 100, 100), // Collides with commit1
      createMockCommit('commit3', 200, 200),
      createMockCommit('commit4', 200, 200), // Collides with commit3
    ]

    render(
      <GitGraph
        {...mockProps}
        positionedCommits={positionedCommits}
      />
    )

    expect(mockConsoleWarn).toHaveBeenCalledTimes(2)
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('COLLISION: Commits \'commit1\' and \'commit2\' overlap')
    )
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('COLLISION: Commits \'commit3\' and \'commit4\' overlap')
    )
  })

  it('should handle empty commits array gracefully', () => {
    render(
      <GitGraph
        {...mockProps}
        positionedCommits={[]}
      />
    )

    expect(mockConsoleWarn).not.toHaveBeenCalled()
  })
})
