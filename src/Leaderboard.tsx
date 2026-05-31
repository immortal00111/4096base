// Base-themed leaderboard panel (top 10 local scores).

import type { ScoreEntry } from "./storage";

type Props = {
  open: boolean;
  entries: ScoreEntry[];
  onClose: () => void;
  /** Highlight the most recently added entry (by index) if present. */
  highlightDate?: number;
};

const MEDALS = ["🥇", "🥈", "🥉"];

export const Leaderboard = ({ open, entries, onClose, highlightDate }: Props) => {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="panel leaderboard"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Leaderboard"
      >
        <div className="panel-head">
          <h2>🏆 Leaderboard</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="empty">No scores yet — be the first to make the board!</p>
        ) : (
          <ol className="lb-list">
            {entries.map((e, i) => (
              <li
                key={`${e.name}-${e.date}-${i}`}
                className={
                  "lb-row" +
                  (highlightDate && e.date === highlightDate ? " lb-new" : "")
                }
              >
                <span className="lb-rank">{MEDALS[i] ?? i + 1}</span>
                <span className="lb-name">{e.name}</span>
                <span className="lb-score">{e.score.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        )}

        <button className="btn btn-primary full" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
};
