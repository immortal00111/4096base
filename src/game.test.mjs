// Ad-hoc runtime check of core 2048/4096 merge rules. Run with Node 26
// (native TS type-stripping): `node src/game.test.mjs`. Not part of the build.
import { computeMove, hasMovesLeft } from "./game.ts";

let pass = 0;
let fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Build a tile list from a 4x4 grid of values (0 = empty).
const fromGrid = (g) => {
  let id = 1;
  const tiles = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (g[r][c]) tiles.push({ id: id++, value: g[r][c], row: r, col: c });
  return tiles;
};

// Render resultTiles back to a 4x4 grid of values for easy comparison.
const toGrid = (tiles) => {
  const g = Array.from({ length: 4 }, () => Array(4).fill(0));
  for (const t of tiles) g[t.row][t.col] = t.value;
  return g;
};

const check = (name, got, want) => {
  if (eq(got, want)) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL: ${name}`);
    console.log("  got: ", JSON.stringify(got));
    console.log("  want:", JSON.stringify(want));
  }
};

const move = (grid, dir) => toGrid(computeMove(fromGrid(grid), dir).resultTiles);

// 1. Basic merge of a pair to the left.
check(
  "merge pair left",
  move(
    [
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    "left"
  ),
  [
    [4, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
);

// 2. Three equal tiles: only ONE merge (leftmost pair), survivor slides.
check(
  "three equal -> one merge",
  move(
    [
      [2, 2, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    "left"
  ),
  [
    [4, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
);

// 3. Four equal tiles: two independent merges, not a single 8.
check(
  "four equal -> two merges",
  move(
    [
      [2, 2, 2, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    "left"
  ),
  [
    [4, 4, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
);

// 4. No double-merge: 4,4 must not pull in to make 16 with an 8 next to it.
check(
  "no chained merge",
  move(
    [
      [4, 4, 8, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    "left"
  ),
  [
    [8, 8, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
);

// 5. Direction: merge to the right.
check(
  "merge pair right",
  move(
    [
      [2, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    "right"
  ),
  [
    [0, 0, 0, 4],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
);

// 6. Vertical merge up a column.
check(
  "merge column up",
  move(
    [
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [4, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    "up"
  ),
  [
    [4, 0, 0, 0],
    [4, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
);

// 7. gained = sum of merged tile values.
{
  const r = computeMove(
    fromGrid([
      [2, 2, 4, 4],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]),
    "left"
  );
  check("score gained", r.gained, 12); // 4 + 8
}

// 8. maxMerged reports the largest tile produced (for shake/milestones).
{
  const r = computeMove(
    fromGrid([
      [256, 256, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]),
    "left"
  );
  check("maxMerged", r.maxMerged, 512);
}

// 9. A move that changes nothing reports moved = false.
{
  const r = computeMove(
    fromGrid([
      [2, 4, 8, 16],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]),
    "left"
  );
  check("no-op move", r.moved, false);
}

// 10. hasMovesLeft: full board with no equal neighbours = game over.
check(
  "game over detection",
  hasMovesLeft(
    fromGrid([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ])
  ),
  false
);

// 11. hasMovesLeft: full board WITH an equal neighbour = still playable.
check(
  "playable when neighbours match",
  hasMovesLeft(
    fromGrid([
      [2, 2, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ])
  ),
  true
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
