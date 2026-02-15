import { useEffect, useMemo, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

type Dir = "left" | "right" | "up" | "down";
type Board = number[][];

const SIZE = 4;
const TARGET = 4096;

function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}
function cloneBoard(b: Board): Board {
  return b.map((r) => r.slice());
}
function randInt(n: number) {
  return Math.floor(Math.random() * n);
}
function getEmptyCells(b: Board) {
  const cells: { r: number; c: number }[] = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (b[r][c] === 0) cells.push({ r, c });
  return cells;
}
function addRandomTile(b: Board): Board {
  const cells = getEmptyCells(b);
  if (cells.length === 0) return b;
  const { r, c } = cells[randInt(cells.length)];
  const v = Math.random() < 0.9 ? 2 : 4;
  const nb = cloneBoard(b);
  nb[r][c] = v;
  return nb;
}
function boardsEqual(a: Board, b: Board) {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (a[r][c] !== b[r][c]) return false;
  return true;
}
function slideAndMergeLine(line: number[]): { out: number[]; gained: number } {
  const filtered = line.filter((x) => x !== 0);
  const out: number[] = [];
  let gained = 0;

  for (let i = 0; i < filtered.length; i++) {
    const cur = filtered[i];
    const nxt = filtered[i + 1];
    if (nxt !== undefined && cur === nxt) {
      const merged = cur * 2;
      out.push(merged);
      gained += merged;
      i++;
    } else {
      out.push(cur);
    }
  }
  while (out.length < SIZE) out.push(0);
  return { out, gained };
}
function rotateRight(b: Board): Board {
  const nb = emptyBoard();
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) nb[c][SIZE - 1 - r] = b[r][c];
  return nb;
}
function rotateLeft(b: Board): Board {
  const nb = emptyBoard();
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) nb[SIZE - 1 - c][r] = b[r][c];
  return nb;
}
function moveBoard(b: Board, dir: Dir): { board: Board; gained: number; moved: boolean } {
  let work = cloneBoard(b);

  if (dir === "up") work = rotateLeft(work);
  if (dir === "down") work = rotateRight(work);
  if (dir === "right") work = work.map((row) => row.slice().reverse());

  let gained = 0;
  const next = work.map((row) => {
    const res = slideAndMergeLine(row);
    gained += res.gained;
    return res.out;
  });

  let restored = next;
  if (dir === "up") restored = rotateRight(restored);
  if (dir === "down") restored = rotateLeft(restored);
  if (dir === "right") restored = restored.map((row) => row.slice().reverse());

  const moved = !boardsEqual(b, restored);
  return { board: restored, gained, moved };
}
function canMove(b: Board) {
  if (getEmptyCells(b).length > 0) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = b[r][c];
      if (r + 1 < SIZE && b[r + 1][c] === v) return true;
      if (c + 1 < SIZE && b[r][c + 1] === v) return true;
    }
  }
  return false;
}
function maxTile(b: Board) {
  let m = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) m = Math.max(m, b[r][c]);
  return m;
}
function getBestFromStorage() {
  const raw = localStorage.getItem("base4096_best");
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}
function setBestToStorage(n: number) {
  localStorage.setItem("base4096_best", String(n));
}
function tileBg(v: number) {
  if (v === 0) return "rgba(255,255,255,0.06)";
  if (v <= 8) return "rgba(255,255,255,0.15)";
  if (v <= 32) return "rgba(255,255,255,0.22)";
  if (v <= 128) return "rgba(120,180,255,0.35)";
  if (v <= 512) return "rgba(120,255,180,0.35)";
  if (v <= 2048) return "rgba(255,220,120,0.45)";
  return "rgba(255,120,160,0.55)";
}

export default function App() {
  const [board, setBoard] = useState<Board>(() => addRandomTile(addRandomTile(emptyBoard())));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => getBestFromStorage());
  const [won, setWon] = useState(false);
  const [over, setOver] = useState(false);

  // base miniapp: tell the container we are ready (safe on localhost)
  useEffect(() => {
    try {
      sdk.actions.ready();
    } catch {
      // ignore when not running inside base/farcaster container
    }
  }, []);

  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const statusText = useMemo(() => {
    if (over) return "game over";
    if (won) return "you hit 4096";
    return "reach 4096";
  }, [over, won]);

  function reset() {
    setBoard(addRandomTile(addRandomTile(emptyBoard())));
    setScore(0);
    setWon(false);
    setOver(false);
  }

  function tryMove(dir: Dir) {
    if (over) return;

    const res = moveBoard(board, dir);
    if (!res.moved) return;

    const nb = addRandomTile(res.board);
    const newScore = score + res.gained;

    setBoard(nb);
    setScore(newScore);

    if (newScore > best) {
      setBest(newScore);
      setBestToStorage(newScore);
    }

    if (!won && maxTile(nb) >= TARGET) setWon(true);
    if (!canMove(nb)) setOver(true);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") tryMove("left");
      if (e.key === "ArrowRight") tryMove("right");
      if (e.key === "ArrowUp") tryMove("up");
      if (e.key === "ArrowDown") tryMove("down");
      if (e.key === "r" || e.key === "R") reset();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, score, best, over, won]);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < 30) return;

    if (ax > ay) tryMove(dx > 0 ? "right" : "left");
    else tryMove(dy > 0 ? "down" : "up");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b1220",
        color: "white",
        fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        display: "flex",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div style={{ width: 420, maxWidth: "92vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>4096</div>
            <div style={{ opacity: 0.75, fontSize: 13 }}>{statusText}</div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            {[
              ["score", score],
              ["best", best],
            ].map(([label, val]) => (
              <div
                key={label as string}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  minWidth: 92,
                  textAlign: "center",
                }}
              >
                <div style={{ opacity: 0.75, fontSize: 11 }}>{label as string}</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{val as number}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button
            onClick={reset}
            style={{
              cursor: "pointer",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(255,255,255,0.08)",
              color: "white",
              padding: "10px 12px",
              fontWeight: 800,
            }}
          >
            new game
          </button>

          <div style={{ opacity: 0.7, fontSize: 12, alignSelf: "center" }}>
            arrows to move, r to reset, swipe on mobile
          </div>
        </div>

        <div
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          style={{
            marginTop: 16,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 18,
            padding: 12,
            position: "relative",
            userSelect: "none",
            touchAction: "none",
          }}
        >
          {(won || over) && (
            <div
              style={{
                position: "absolute",
                inset: 12,
                borderRadius: 14,
                background: "rgba(0,0,0,0.55)",
                border: "1px solid rgba(255,255,255,0.14)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 10,
                zIndex: 5,
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 22 }}>{over ? "game over" : "you won"}</div>
              <div style={{ opacity: 0.8, fontSize: 13 }}>{over ? "no moves left" : "keep going if you want"}</div>
              <button
                onClick={reset}
                style={{
                  cursor: "pointer",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(255,255,255,0.10)",
                  color: "white",
                  padding: "10px 14px",
                  fontWeight: 900,
                }}
              >
                play again
              </button>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: `repeat(${SIZE}, 1fr)`, gap: 10 }}>
            {board.flatMap((row, r) =>
              row.map((v, c) => (
                <div
                  key={`${r}-${c}`}
                  style={{
                    height: 86,
                    borderRadius: 14,
                    background: tileBg(v),
                    border: "1px solid rgba(255,255,255,0.10)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: v >= 1024 ? 24 : v >= 128 ? 28 : 32,
                  }}
                >
                  {v === 0 ? "" : v}
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ marginTop: 14, opacity: 0.7, fontSize: 12, lineHeight: 1.5 }}>
          merge equal tiles. each merge adds to your score. hit 4096 to win.
        </div>
      </div>
    </div>
  );
}
