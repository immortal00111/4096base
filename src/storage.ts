// Local persistence: best score, top-10 leaderboard, and the 4096 trophy.
// All access is guarded so the game still works where localStorage is blocked
// (private mode, embedded webviews, etc.) — it just won't persist.

const BEST_KEY = "b4096_best";
const LEADERBOARD_KEY = "b4096_leaderboard";
const TROPHY_KEY = "b4096_trophy";

export const LEADERBOARD_SIZE = 10;

// Single source of truth for the initials limit, shared by the input's
// maxLength and the storage normalizer so they can never disagree (the old
// "IMMORTLT" cutoff came from the input and the stored value clipping
// differently). 8 chars comfortably fits initials or a short handle.
export const MAX_NAME_LENGTH = 8;

export type ScoreEntry = {
  name: string;
  score: number;
  date: number;
};

/** Normalize a typed name to what we store/show: trimmed, capped, uppercased. */
export const normalizeName = (raw: string): string =>
  raw.trim().slice(0, MAX_NAME_LENGTH).toUpperCase();

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore — persistence unavailable */
  }
};

export const getBestScore = (): number => {
  const raw = read(BEST_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
};

export const setBestScore = (score: number): void => {
  write(BEST_KEY, String(score));
};

export const getLeaderboard = (): ScoreEntry[] => {
  const raw = read(LEADERBOARD_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is ScoreEntry =>
          e && typeof e.name === "string" && typeof e.score === "number"
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, LEADERBOARD_SIZE);
  } catch {
    return [];
  }
};

/** A score qualifies if the board isn't full yet or it beats the lowest entry. */
export const qualifiesForLeaderboard = (score: number): boolean => {
  if (score <= 0) return false;
  const board = getLeaderboard();
  if (board.length < LEADERBOARD_SIZE) return true;
  return score > board[board.length - 1].score;
};

export const addLeaderboardEntry = (
  name: string,
  score: number,
  date: number
): ScoreEntry[] => {
  const entry: ScoreEntry = {
    name: normalizeName(name) || "YOU",
    score,
    date,
  };
  const next = [...getLeaderboard(), entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, LEADERBOARD_SIZE);
  write(LEADERBOARD_KEY, JSON.stringify(next));
  return next;
};

/**
 * Where a score ranks among the given board (defaults to the persisted one).
 * `rank` is 1-based (1 = top); `total` is the size it's being ranked within.
 * Works both before saving (projected rank) and after (the entry is present).
 */
export const getRank = (
  score: number,
  entries?: ScoreEntry[]
): { rank: number; total: number } => {
  const board = entries ?? getLeaderboard();
  const better = board.filter((e) => e.score > score).length;
  const rank = better + 1;
  const total = Math.min(LEADERBOARD_SIZE, Math.max(board.length, rank));
  return { rank, total };
};

export const getTrophy = (): boolean => read(TROPHY_KEY) === "1";

export const setTrophy = (earned: boolean): void => {
  write(TROPHY_KEY, earned ? "1" : "0");
};
