// Daily check-in UI for registered players. Self-contained over the useCheckIn
// hook; renders nothing unless the feature is configured and `show` is true
// (the caller passes show = registry configured && player is registered).

import { useCheckIn } from "./useCheckIn";

const busy = (p: string) => p === "pending" || p === "confirming";

export const CheckInPanel = ({ show }: { show: boolean }) => {
  const c = useCheckIn();

  if (!c.configured || !show) return null;

  const streakLabel =
    c.currentStreak > 0
      ? `🔥 ${c.currentStreak}-day streak`
      : "No streak yet — check in to start one";

  return (
    <div className="checkin-bar">
      <div className="checkin-info">
        <span className="checkin-streak">{streakLabel}</span>
        {c.longestStreak > 0 && (
          <span className="checkin-best">best {c.longestStreak}</span>
        )}
      </div>

      {!c.onCorrectNetwork ? (
        <span className="wallet-stat-value">Switch to Base to check in</span>
      ) : c.canCheckIn ? (
        <button
          className="btn btn-primary"
          onClick={c.checkIn}
          disabled={busy(c.phase)}
        >
          {c.phase === "pending"
            ? "Confirm in wallet…"
            : c.phase === "confirming"
              ? "Checking in…"
              : "Claim daily check-in"}
        </button>
      ) : (
        <span className="checkin-done">✓ Checked in today — back tomorrow</span>
      )}

      {c.error && <p className="wallet-note err">{c.error}</p>}
    </div>
  );
};
