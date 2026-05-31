import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import {
  addRandomTile,
  computeMove,
  createInitialTiles,
  GRID_SIZE,
  hasMovesLeft,
  highestTile,
  WINNING_EXPONENT,
  WINNING_TILE,
  type Direction,
  type Tile,
} from "./game";
import {
  addLeaderboardEntry,
  getBestScore,
  getLeaderboard,
  getRank,
  getTrophy,
  MAX_NAME_LENGTH,
  normalizeName,
  qualifiesForLeaderboard,
  setBestScore as persistBest,
  setTrophy as persistTrophy,
  type ScoreEntry,
} from "./storage";
import { Celebration, type CelebrationHandle } from "./Celebration";
import { Leaderboard } from "./Leaderboard";
import { usePlayFlow } from "./web3/usePlayFlow";
import { WalletBar } from "./web3/WalletBar";
import { FundPanel } from "./web3/FundPanel";
import { contractsConfigured } from "./web3/config";
import "./App.css";

const SLIDE_MS = 110; // keep in sync with the tile transition in App.css

type Tab = "game" | "fund";

type GameStatus = "playing" | "won" | "over";

const MILESTONES: Record<number, string> = {
  128: "Warming up! 🔥",
  256: "Halfway there!",
  512: "Getting close!",
  1024: "Almost there!",
  2048: "One step from the jackpot!",
};

const App = () => {
  const [tiles, setTiles] = useState<Tile[]>(() => createInitialTiles());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => getBestScore());
  const [status, setStatus] = useState<GameStatus>("playing");
  const [wonDismissed, setWonDismissed] = useState(false);
  const [trophy, setTrophy] = useState(() => getTrophy());
  const [showBig, setShowBig] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>(() => getLeaderboard());
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savedEntryDate, setSavedEntryDate] = useState<number | undefined>();
  const [scoreSaved, setScoreSaved] = useState(false);
  // True once this run has beaten the previous all-time best (personal best).
  const [newBest, setNewBest] = useState(false);

  // Pay-to-play. When contracts aren't configured (no deployed addresses yet),
  // the game falls back to free play so all existing behavior is preserved.
  // When configured, a confirmed on-chain payment is required to start a game.
  const flow = usePlayFlow();
  const [armed, setArmed] = useState(!contractsConfigured);
  const armedRef = useRef(armed);

  // Game / Fund tabs. The game stays mounted (just hidden) when on the Fund
  // tab so its in-progress state and listeners are preserved. tabRef keeps the
  // global key handler from moving the board while the Fund tab is open.
  const [tab, setTab] = useState<Tab>("game");
  const tabRef = useRef<Tab>("game");
  const switchTab = useCallback((t: Tab) => {
    tabRef.current = t;
    setTab(t);
  }, []);

  // Refs are the source of truth for fast-path move handling so the global
  // key listener never reads stale closure state.
  const tilesRef = useRef(tiles);
  const scoreRef = useRef(0);
  const bestRef = useRef(best);
  const statusRef = useRef<GameStatus>("playing");
  const highestSeenRef = useRef(highestTile(tiles));
  const lockRef = useRef(false);
  const toastTimer = useRef<number>(0);
  const shakeTimer = useRef<number>(0);
  const confettiRef = useRef<CelebrationHandle>(null);

  useEffect(() => {
    sdk.actions.ready();
  }, []);

  const commitTiles = useCallback((next: Tile[]) => {
    tilesRef.current = next;
    setTiles(next);
  }, []);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1900);
  }, []);

  const triggerShake = useCallback(() => {
    setShake(true);
    window.clearTimeout(shakeTimer.current);
    shakeTimer.current = window.setTimeout(() => setShake(false), 360);
  }, []);

  const celebrate = useCallback(
    (highest: number) => {
      if (highest <= highestSeenRef.current) return;
      const prev = highestSeenRef.current;
      highestSeenRef.current = highest;

      if (highest >= WINNING_TILE && prev < WINNING_TILE) {
        setShowBig(true);
        if (statusRef.current === "playing") {
          statusRef.current = "won";
          setStatus("won");
        }
        if (!getTrophy()) {
          persistTrophy(true);
          setTrophy(true);
        }
        // Big finale: a few staggered bursts across the screen.
        confettiRef.current?.fire(2.4, 0.4);
        window.setTimeout(() => confettiRef.current?.fire(1.8, 0.28), 180);
        window.setTimeout(() => confettiRef.current?.fire(1.8, 0.55), 360);
        return;
      }

      const message = MILESTONES[highest];
      if (message) {
        const intensity = 0.5 + Math.log2(highest) / 12;
        confettiRef.current?.fire(intensity, 0.38);
        flashToast(message);
      }
    },
    [flashToast]
  );

  const handleMove = useCallback(
    (dir: Direction) => {
      if (lockRef.current) return;
      if (tabRef.current !== "game") return; // ignore moves while on Fund tab
      if (statusRef.current === "over") return;
      if (!armedRef.current) return; // must pay to play (when configured)

      const { moved, gained, slideTiles, resultTiles, maxMerged } = computeMove(
        tilesRef.current,
        dir
      );
      if (!moved) return;

      lockRef.current = true;
      commitTiles(slideTiles);
      if (maxMerged >= 512) triggerShake();

      window.setTimeout(() => {
        const withNew = addRandomTile(resultTiles);
        commitTiles(withNew);

        if (gained > 0) {
          const newScore = scoreRef.current + gained;
          scoreRef.current = newScore;
          setScore(newScore);
          if (newScore > bestRef.current) {
            // Only counts as a personal best if there was a prior best to beat,
            // so a brand-new player's first game isn't flagged as a "record".
            if (bestRef.current > 0) setNewBest(true);
            bestRef.current = newScore;
            setBest(newScore);
            persistBest(newScore);
          }
        }

        celebrate(highestTile(withNew));

        if (!hasMovesLeft(withNew)) {
          statusRef.current = "over";
          setStatus("over");
        }

        lockRef.current = false;
      }, SLIDE_MS);
    },
    [celebrate, commitTiles, triggerShake]
  );

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Direction> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        w: "up",
        s: "down",
        a: "left",
        d: "right",
        W: "up",
        S: "down",
        A: "left",
        D: "right",
      };
      const dir = map[e.key];
      if (!dir) return;
      e.preventDefault();
      handleMove(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleMove]);

  // Touch / swipe controls.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    if (!start) return;
    touchStart.current = null;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < 24) return;
    if (absX > absY) handleMove(dx > 0 ? "right" : "left");
    else handleMove(dy > 0 ? "down" : "up");
  };

  const newGame = useCallback(() => {
    const fresh = createInitialTiles();
    commitTiles(fresh);
    scoreRef.current = 0;
    setScore(0);
    statusRef.current = "playing";
    setStatus("playing");
    highestSeenRef.current = highestTile(fresh);
    lockRef.current = false;
    setWonDismissed(false);
    setShowBig(false);
    setToast(null);
    setScoreSaved(false);
    setNameInput("");
    setSavedEntryDate(undefined);
    setNewBest(false);
  }, [commitTiles]);

  // Start a fresh, playable game (arms the board).
  const startGame = useCallback(() => {
    newGame();
    armedRef.current = true;
    setArmed(true);
  }, [newGame]);

  // Request a new game: free play starts immediately; paid mode awaits an
  // on-chain payment confirmation and only then starts the game.
  const { pay, payPhase } = flow;
  const requestNewGame = useCallback(async () => {
    if (!contractsConfigured) {
      startGame();
      return;
    }
    if (await pay()) startGame();
  }, [startGame, pay]);

  const saveScore = useCallback(() => {
    const date = Date.now();
    const next = addLeaderboardEntry(nameInput, scoreRef.current, date);
    setLeaderboard(next);
    setSavedEntryDate(date);
    setScoreSaved(true);
    setShowLeaderboard(true);
  }, [nameInput]);

  // Derived jackpot indicator.
  const highest = useMemo(() => highestTile(tiles), [tiles]);
  const exponent = highest > 0 ? Math.log2(highest) : 0;
  const stepsRemaining = Math.max(0, WINNING_EXPONENT - exponent);
  const progress = Math.min(1, exponent / WINNING_EXPONENT);

  const canSaveScore =
    status === "over" && !scoreSaved && qualifiesForLeaderboard(score);

  // Rank readout on game over: projected before saving, actual after.
  const { rank, total } = useMemo(
    () => getRank(score, leaderboard),
    [score, leaderboard]
  );
  const onLeaderboard = scoreSaved && savedEntryDate !== undefined;

  return (
    <div className="app">
      <Celebration ref={confettiRef} />

      <header className="topbar">
        <div className="brand">
          <h1>
            4096 <span className="on-base">on Base</span>
          </h1>
          {trophy && (
            <span className="trophy-badge" title="You reached 4096!">
              🏆 Reached 4096
            </span>
          )}
        </div>
        <div className="scores">
          <div className="score-box">
            <span className="score-label">Score</span>
            <span className="score-value">{score.toLocaleString()}</span>
          </div>
          <div className="score-box">
            <span className="score-label">Best</span>
            <span className="score-value">{best.toLocaleString()}</span>
          </div>
        </div>
      </header>

      <div className="tabs">
        <button
          className={"tab" + (tab === "game" ? " tab-active" : "")}
          onClick={() => switchTab("game")}
        >
          🎮 Game
        </button>
        <button
          className={"tab" + (tab === "fund" ? " tab-active" : "")}
          onClick={() => switchTab("fund")}
        >
          💰 4096 Fund
        </button>
      </div>

      <div
        className="game-view"
        style={{ display: tab === "game" ? undefined : "none" }}
      >
      <WalletBar flow={flow} />

      <section className="jackpot">
        <div className="jackpot-line">
          {stepsRemaining <= 0 ? (
            <span className="jackpot-text won">Jackpot reached! 🎆</span>
          ) : (
            <span className="jackpot-text">
              <strong>{stepsRemaining}</strong>{" "}
              {stepsRemaining === 1 ? "step" : "steps"} from the jackpot 🎆
            </span>
          )}
          <span className="jackpot-target">{highest} / {WINNING_TILE}</span>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </section>

      <div className="controls-row">
        <button
          className="btn"
          onClick={requestNewGame}
          disabled={
            contractsConfigured &&
            (payPhase === "pending" || payPhase === "confirming")
          }
        >
          {!contractsConfigured
            ? "New Game"
            : payPhase === "pending"
              ? "Confirm in wallet…"
              : payPhase === "confirming"
                ? "Confirming…"
                : `New Game (${flow.feeLabel})`}
        </button>
        <button className="btn" onClick={() => setShowLeaderboard(true)}>
          🏆 Leaderboard
        </button>
      </div>

      <div className="board-wrap">
        <div
          className={"board" + (shake ? " shake" : "")}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="grid-bg">
            {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => (
              <div key={i} className="grid-cell" />
            ))}
          </div>

          <div className="tiles">
            {tiles.map((t) => (
              <div
                key={t.id}
                className={
                  "tile tile-" +
                  t.value +
                  (t.isNew ? " tile-new" : "") +
                  (t.merged ? " tile-merged" : "")
                }
                style={{
                  transform: `translate(calc(var(--gap) + ${t.col} * var(--stride)), calc(var(--gap) + ${t.row} * var(--stride)))`,
                }}
              >
                <span className="tile-inner">{t.value}</span>
              </div>
            ))}
          </div>

          {toast && (
            <div className="toast" key={toast}>
              {toast}
            </div>
          )}

          {status !== "over" && !armed && (
            <div className="overlay">
              <div className="overlay-card">
                <h2 className="overlay-title">Pay to play</h2>
                {!flow.isConnected ? (
                  <p>Connect your wallet above to start a game.</p>
                ) : !flow.onCorrectNetwork ? (
                  <p>Switch to Base Sepolia (above) to start a game.</p>
                ) : (
                  <>
                    <p>
                      One game costs <strong>{flow.feeLabel}</strong>
                      {flow.hasNFT ? " — NFT discount applied 🎟️" : ""}.
                    </p>
                    <button
                      className="btn btn-primary full"
                      onClick={requestNewGame}
                      disabled={
                        !flow.fee ||
                        payPhase === "pending" ||
                        payPhase === "confirming"
                      }
                    >
                      {payPhase === "pending"
                        ? "Confirm in wallet…"
                        : payPhase === "confirming"
                          ? "Confirming payment…"
                          : `Pay ${flow.feeLabel} & play`}
                    </button>
                    {flow.payError && (
                      <p className="wallet-note err">{flow.payError}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {status === "won" && !wonDismissed && !showBig && (
            <div className="overlay">
              <div className="overlay-card">
                <h2 className="overlay-title win">🎆 4096!</h2>
                <p>You hit the jackpot on Base.</p>

                {flow.badgeConfigured && (
                  <div className="badge-mint">
                    {flow.hasBadge ? (
                      <p className="badge-owned">🏆 Badge owned ✓</p>
                    ) : !flow.isConnected ? (
                      <p className="wallet-note">
                        Connect your wallet to mint your badge.
                      </p>
                    ) : !flow.onCorrectNetwork ? (
                      <p className="wallet-note warn">
                        Switch to Base Sepolia to mint your badge.
                      </p>
                    ) : (
                      <>
                        <button
                          className="btn btn-primary full"
                          onClick={flow.mintBadge}
                          disabled={
                            flow.badgePhase === "pending" ||
                            flow.badgePhase === "confirming"
                          }
                        >
                          {flow.badgePhase === "pending"
                            ? "Confirm in wallet…"
                            : flow.badgePhase === "confirming"
                              ? "Minting badge…"
                              : flow.badgePhase === "success"
                                ? "Badge minted ✓"
                                : "Mint your Reached 4096 badge 🏆"}
                        </button>
                        {flow.badgeError && (
                          <p className="wallet-note err">{flow.badgeError}</p>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="overlay-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => setWonDismissed(true)}
                  >
                    Keep going
                  </button>
                  <button className="btn" onClick={requestNewGame}>
                    {contractsConfigured ? "Pay & play again" : "New Game"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {status === "over" && (
            <div className="overlay">
              <div className="overlay-card">
                <h2 className="overlay-title over">Game Over</h2>
                <p>
                  Score <strong>{score.toLocaleString()}</strong> points
                </p>

                {newBest && (
                  <p className="pb-note">🌟 New personal best!</p>
                )}

                {score > 0 && (
                  <p className="rank-note">
                    {onLeaderboard ? "You're" : "You'd rank"}{" "}
                    <strong>#{rank}</strong> of {total}
                  </p>
                )}

                {canSaveScore ? (
                  <div className="name-entry">
                    <p className="qualify">🎉 You made the top 10!</p>
                    <input
                      className="name-input"
                      value={nameInput}
                      onChange={(e) => setNameInput(normalizeName(e.target.value))}
                      placeholder="Your initials"
                      maxLength={MAX_NAME_LENGTH}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveScore();
                      }}
                    />
                    <button className="btn btn-primary full" onClick={saveScore}>
                      Save score
                    </button>
                  </div>
                ) : (
                  scoreSaved && <p className="saved-note">Saved to leaderboard ✓</p>
                )}

                {contractsConfigured && payPhase === "error" && flow.payError && (
                  <p className="wallet-note err">{flow.payError}</p>
                )}
                <div className="overlay-actions">
                  <button
                    className="btn btn-primary"
                    onClick={requestNewGame}
                    disabled={
                      contractsConfigured &&
                      (payPhase === "pending" || payPhase === "confirming")
                    }
                  >
                    {!contractsConfigured
                      ? "New Game"
                      : payPhase === "pending"
                        ? "Confirm in wallet…"
                        : payPhase === "confirming"
                          ? "Confirming…"
                          : "Pay & play again"}
                  </button>
                  <button
                    className="btn"
                    onClick={() => setShowLeaderboard(true)}
                  >
                    Leaderboard
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="hint">Swipe or use arrow keys / WASD. Merge to 4096 to win.</p>
      </div>

      {tab === "fund" && <FundPanel />}

      {showBig && (
        <div
          className="big-celebration"
          onClick={() => {
            setShowBig(false);
            setWonDismissed(true);
          }}
        >
          <div className="big-inner">
            <div className="big-trophy">🏆</div>
            <h2>Reached 4096!</h2>
            <p>Jackpot on Base 🎆</p>
            <button
              className="btn btn-primary"
              onClick={(e) => {
                e.stopPropagation();
                setShowBig(false);
                setWonDismissed(true);
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      <Leaderboard
        open={showLeaderboard}
        entries={leaderboard}
        highlightDate={savedEntryDate}
        onClose={() => setShowLeaderboard(false)}
      />
    </div>
  );
};

export default App;
