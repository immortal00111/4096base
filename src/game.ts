// Core 2048-style game logic for "4096 on Base".
//
// The merge rules here are intentionally identical to a classic 2048:
// non-zero tiles in a line are packed toward the move direction, and each
// adjacent equal pair merges exactly once (leftmost pair first). The only
// addition over a plain number-grid implementation is stable tile IDs so the
// UI can animate real slides and merges. Rules are NOT changed — only tracked.

export const GRID_SIZE = 4;
export const WINNING_TILE = 4096;
export const WINNING_EXPONENT = 12; // 4096 === 2 ** 12

export type Direction = "up" | "down" | "left" | "right";

export type Tile = {
  id: number;
  value: number;
  row: number;
  col: number;
  /** Tile spawned this turn — triggers a pop-in animation. */
  isNew?: boolean;
  /** Tile is the result of a merge this turn — triggers a merge pop. */
  merged?: boolean;
};

export type MoveResult = {
  moved: boolean;
  gained: number;
  /** Existing tiles moved to their destination cells (for the slide phase). */
  slideTiles: Tile[];
  /** Consolidated tiles after merges resolve (absorbed tiles removed). */
  resultTiles: Tile[];
  /** Largest tile produced by a merge this move (for shake / milestones). */
  maxMerged: number;
};

let idCounter = 1;
const nextId = () => idCounter++;

const emptyGrid = (): (Tile | null)[][] =>
  Array.from({ length: GRID_SIZE }, () => Array<Tile | null>(GRID_SIZE).fill(null));

const tilesToGrid = (tiles: Tile[]): (Tile | null)[][] => {
  const grid = emptyGrid();
  for (const t of tiles) grid[t.row][t.col] = t;
  return grid;
};

const getEmptyCells = (tiles: Tile[]): [number, number][] => {
  const grid = tilesToGrid(tiles);
  const empty: [number, number][] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!grid[r][c]) empty.push([r, c]);
    }
  }
  return empty;
};

/** Add a random 2 (90%) or 4 (10%) tile to an empty cell, marked as new. */
export const addRandomTile = (tiles: Tile[]): Tile[] => {
  const empty = getEmptyCells(tiles);
  if (empty.length === 0) return tiles;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const value = Math.random() < 0.9 ? 2 : 4;
  return [...tiles, { id: nextId(), value, row: r, col: c, isNew: true }];
};

export const createInitialTiles = (): Tile[] => addRandomTile(addRandomTile([]));

export const highestTile = (tiles: Tile[]): number =>
  tiles.reduce((max, t) => (t.value > max ? t.value : max), 0);

/**
 * Compute a move. Produces both the "slide" set (every current tile moved to
 * its destination, with merging pairs sharing a cell) and the consolidated
 * "result" set (the absorbed tile removed, the survivor's value doubled).
 */
export const computeMove = (tiles: Tile[], dir: Direction): MoveResult => {
  const grid = tilesToGrid(tiles);
  const isVertical = dir === "up" || dir === "down";
  const forward = dir === "left" || dir === "up";

  const slideTiles: Tile[] = [];
  const resultTiles: Tile[] = [];
  let moved = false;
  let gained = 0;
  let maxMerged = 0;

  for (let line = 0; line < GRID_SIZE; line++) {
    // Collect tiles in this line, ordered from the leading edge inward.
    const cells: Tile[] = [];
    for (let idx = 0; idx < GRID_SIZE; idx++) {
      const realIdx = forward ? idx : GRID_SIZE - 1 - idx;
      const r = isVertical ? realIdx : line;
      const c = isVertical ? line : realIdx;
      const t = grid[r][c];
      if (t) cells.push(t);
    }

    let target = 0;
    let i = 0;
    while (i < cells.length) {
      const a = cells[i];
      const targetReal = forward ? target : GRID_SIZE - 1 - target;
      const destR = isVertical ? targetReal : line;
      const destC = isVertical ? line : targetReal;

      const b = cells[i + 1];
      if (b && b.value === a.value) {
        // Merge: both tiles slide onto the destination cell.
        slideTiles.push({ ...a, row: destR, col: destC });
        slideTiles.push({ ...b, row: destR, col: destC });
        const value = a.value * 2;
        resultTiles.push({ id: a.id, value, row: destR, col: destC, merged: true });
        gained += value;
        if (value > maxMerged) maxMerged = value;
        moved = true;
        i += 2;
      } else {
        slideTiles.push({ ...a, row: destR, col: destC });
        resultTiles.push({ id: a.id, value: a.value, row: destR, col: destC });
        if (a.row !== destR || a.col !== destC) moved = true;
        i += 1;
      }
      target++;
    }
  }

  return { moved, gained, slideTiles, resultTiles, maxMerged };
};

/** True if any move is still possible (an empty cell or a mergeable neighbour). */
export const hasMovesLeft = (tiles: Tile[]): boolean => {
  const grid = tilesToGrid(tiles);
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const t = grid[r][c];
      if (!t) return true;
      const right = grid[r][c + 1];
      const down = grid[r + 1]?.[c];
      if (right && right.value === t.value) return true;
      if (down && down.value === t.value) return true;
    }
  }
  return false;
};
