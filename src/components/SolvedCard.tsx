"use client";

import { useEffect, useState } from "react";
import type { CompletedGame } from "@/lib/save/serialize";
import { loadCompleted } from "@/lib/save/storage";
import { puzzleLabel } from "@/lib/labels";
import { sharePuzzle } from "@/lib/share";
import { computeStats, solveBadge, statsFor } from "@/lib/stats";
import { formatTime, useGame } from "@/store/game";

/**
 * Celebration card shown over the board when the player finishes a puzzle.
 * Only for games finished in this session — reopening an old solved game from
 * History doesn't pop it up again. "View board" dismisses it.
 */
export function SolvedCard() {
  const id = useGame((s) => s.id);
  const size = useGame((s) => s.spec.size);
  const seed = useGame((s) => s.seed);
  const elapsed = useGame((s) => s.elapsed);
  const hintsUsed = useGame((s) => s.hintsUsed);
  const difficulty = useGame((s) => s.difficulty);
  const bankId = useGame((s) => s.bankId);
  const [shareLabel, setShareLabel] = useState<string | null>(null);
  const [solvedId, setSolvedId] = useState<string | null>(null);
  const [solvedAt, setSolvedAt] = useState(0);
  const [records, setRecords] = useState<CompletedGame[] | null>(null);

  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        if (prev.status === "playing" && s.status === "solved" && s.id === prev.id) {
          setRecords(null);
          setSolvedId(s.id);
          setSolvedAt(Date.now());
          void loadCompleted().then(setRecords);
        }
      }),
    [],
  );

  if (solvedId === null || solvedId !== id) return null;

  // Include this game even if its record hasn't finished writing yet.
  const self: CompletedGame = { size, difficulty, seed, elapsed, hintsUsed, completedAt: solvedAt };
  const all = records ? [...records.filter((r) => !(r.size === size && r.seed === seed)), self] : null;
  const stats = all ? statsFor(computeStats(all), size, difficulty) : null;
  const badge = records ? solveBadge(records, { size, difficulty, seed, elapsed, hintsUsed }) : null;

  return (
    // Scrim sized to the board: dims and blurs the grid so the card reads cleanly.
    <div className="board-square z-10 grid aspect-square place-items-center rounded-md bg-black/25 backdrop-blur-[3px] [grid-area:1/1]">
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="solved-title"
        onKeyDown={(e) => e.key === "Escape" && setSolvedId(null)}
        className="solid-card animate-pop flex max-h-full w-[min(90%,21rem)] flex-col items-center gap-3 overflow-y-auto rounded-3xl px-5 py-5 text-center shadow-2xl shadow-black/40"
      >
        <div className="flex h-6 items-center">
          {badge === "best" && <Pill>New best time</Pill>}
          {badge === "first" && <Pill>First {puzzleLabel(size, difficulty)} solve</Pill>}
        </div>

        <div className="-mt-2 flex flex-col items-center gap-1">
          <h2 id="solved-title" className="text-xl font-semibold tracking-tight">
            Solved!
          </h2>
          <p className="font-mono text-4xl font-semibold tabular-nums sm:text-5xl">{formatTime(elapsed)}</p>
          <p className="h-5 text-sm text-ink-muted">
            {hintsUsed > 0 ? `with ${hintsUsed} hint${hintsUsed > 1 ? "s" : ""}` : "no hints"}
          </p>
        </div>

        <dl className="grid w-full grid-cols-3 gap-2 text-sm">
          <Stat label="Solved" value={stats ? String(stats.solved) : "…"} />
          <Stat label="Best" value={stats ? (stats.bestTime === null ? "—" : formatTime(stats.bestTime)) : "…"} />
          <Stat label="Average" value={stats ? formatTime(stats.averageTime) : "…"} />
        </dl>
        <p className="-mt-2 text-xs text-ink-muted">
          {puzzleLabel(size, difficulty)} · best time counts solves without hints
        </p>

        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => void useGame.getState().newGame(size)}
            className="rounded-xl bg-accent py-2.5 font-medium text-accent-ink transition active:scale-[0.98]"
          >
            New {size}×{size}
          </button>
          <button
            type="button"
            onClick={() => setSolvedId(null)}
            className="rounded-xl bg-key py-2.5 font-medium hover:bg-key-hover"
          >
            View board
          </button>
          {bankId && (
            <button
              type="button"
              onClick={async () => {
                const result = await sharePuzzle(bankId, puzzleLabel(size, difficulty));
                setShareLabel(result === "copied" ? "Link copied" : result === "failed" ? "Couldn't share" : null);
              }}
              className="text-sm font-medium text-ink-muted underline-offset-2 hover:underline"
            >
              {shareLabel ?? "Challenge a friend with this puzzle"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold tracking-wide text-accent-ink uppercase">
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-key px-2 py-2">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-mono font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
