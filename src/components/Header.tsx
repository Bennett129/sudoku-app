"use client";

import { useEffect, useState } from "react";
import { difficultiesFor, effectiveDifficulty, SUPPORTED_SIZES, type Difficulty } from "@/lib/engine";
import { difficultyLabel } from "@/lib/labels";
import { hasProgress } from "@/lib/save/serialize";
import { openSize, useSaves } from "@/store/autosave";
import { authClient } from "@/lib/auth-client";
import { THEMES } from "@/lib/themes";
import { formatTime, useGame } from "@/store/game";
import { useSettings } from "@/store/settings";
import { useZoom } from "@/store/zoom";

export function Header({
  onOpenSettings,
  onOpenAccount,
  onOpenHistory,
}: {
  onOpenSettings: () => void;
  onOpenAccount: () => void;
  onOpenHistory: () => void;
}) {
  // While a new size is generating, show that size rather than the old board's.
  const size = useGame((s) => s.generating?.size ?? s.spec.size);
  const elapsed = useGame((s) => s.elapsed);
  const rating = useGame((s) => s.difficulty);
  const preferred = useSettings((s) => s.difficulty);
  const inProgress = useSaves((s) => s.inProgress);

  return (
    // Phones: two compact rows (game controls, then status + tools).
    // Wider screens: one wrapping row.
    <header className="frost flex flex-col gap-2 rounded-2xl px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="text-base font-semibold tracking-tight sm:text-lg">Sudoku</h1>

        <label className="flex min-w-0 items-center text-sm">
          <span className="sr-only">Grid size</span>
          <select
            value={size}
            onChange={(e) => void openSize(Number(e.target.value))}
            // Fixed width: otherwise the longest option ("25×25 · in progress") sets it.
            className="w-[5.75rem] rounded-lg bg-key px-2 py-1 font-medium text-ink"
          >
            {SUPPORTED_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}×{n}
                {n !== size && inProgress.includes(n) ? " · in progress" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 items-center text-sm">
          <span className="sr-only">Difficulty for new puzzles</span>
          <select
            value={effectiveDifficulty(size, preferred)}
            onChange={(e) => chooseDifficulty(e.target.value as Difficulty)}
            className="rounded-lg bg-key px-2 py-1 font-medium text-ink"
          >
            {difficultiesFor(size).map((d) => (
              <option key={d} value={d}>
                {difficultyLabel(d)}
              </option>
            ))}
          </select>
        </label>

        <NewGameButton />
      </div>

      <div className="flex items-center gap-2 sm:ml-auto sm:gap-3">
        <span className="flex items-center gap-2 text-sm">
          {rating && (
            <span
              className="rounded-full bg-key px-2 py-0.5 text-xs font-medium text-ink-muted"
              title="This puzzle's graded difficulty"
            >
              {difficultyLabel(rating)}
            </span>
          )}
          <span className="font-mono tabular-nums" aria-label="Time elapsed">
            {formatTime(elapsed)}
          </span>
        </span>

        <div className="ml-auto flex items-center gap-1 sm:ml-0 sm:gap-2">
          <ZoomControls />
          {/* Theme swatches live in Settings on phones to keep the header short. */}
          <ThemePicker className="hidden sm:flex" />

          <button
            type="button"
            onClick={onOpenHistory}
            aria-label="History and stats"
            title="History and stats"
            className="rounded-lg p-1 text-ink hover:bg-key"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
              <path d="M12 7v5l3 2" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings"
            className="rounded-lg p-1 text-ink hover:bg-key"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
              <circle cx="16" cy="6" r="2" />
              <circle cx="10" cy="12" r="2" />
              <circle cx="18" cy="18" r="2" />
            </svg>
          </button>
          <AccountButton onClick={onOpenAccount} />
        </div>
      </div>
    </header>
  );
}

/** Theme swatches (header on wide screens, Settings everywhere). */
export function ThemePicker({ className = "" }: { className?: string }) {
  const theme = useSettings((s) => s.theme);
  const update = useSettings((s) => s.update);
  return (
    <div className={`items-center gap-1.5 ${className || "flex"}`} role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          aria-label={`${t.name} theme (${t.tone})`}
          title={t.name}
          onClick={() => update({ theme: t.id })}
          className={`size-6 rounded-full border-2 transition ${theme === t.id ? "scale-110 border-ink" : "border-white/60"}`}
          style={{ background: t.swatch }}
        />
      ))}
    </div>
  );
}

/** Person icon when signed out; the email's initial when signed in. */
function AccountButton({ onClick }: { onClick: () => void }) {
  const { data: session, isPending } = authClient.useSession();
  const email = session?.user.email;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={email ? `Account (${email})` : "Sign in"}
      title={email ?? "Sign in"}
      className={`grid size-8 place-items-center rounded-full text-sm font-semibold transition ${
        email ? "bg-accent text-accent-ink" : "text-ink hover:bg-key"
      } ${isPending ? "opacity-50" : ""}`}
    >
      {email ? (
        email[0].toUpperCase()
      ) : (
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      )}
    </button>
  );
}

/**
 * Starts a new puzzle of the current size. If the current game has progress,
 * the first tap turns the button into "Sure?" for a few seconds, so a stray
 * tap can't throw away a game in progress.
 */
/**
 * Save the difficulty preference. If the current game hasn't been started
 * (or is finished), deal a puzzle at the new difficulty straight away;
 * otherwise it applies to the next "New".
 */
function chooseDifficulty(difficulty: Difficulty) {
  useSettings.getState().update({ difficulty });
  const game = useGame.getState();
  if (!hasProgress(game)) void game.newGame(game.spec.size, difficulty);
}

function NewGameButton() {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(id);
  }, [confirming]);

  return (
    <button
      type="button"
      onClick={() => {
        const game = useGame.getState();
        if (!confirming && hasProgress(game)) return setConfirming(true);
        setConfirming(false);
        void game.newGame(game.spec.size);
      }}
      aria-live="polite"
      className="min-w-14 rounded-lg bg-accent px-3 py-1 text-sm font-medium text-accent-ink"
    >
      {confirming ? "Sure?" : "New"}
    </button>
  );
}

/** Zoom for the board; pinch / wheel work too. The % button resets to fit. */
function ZoomControls() {
  const scale = useZoom((z) => z.scale);
  const maxScale = useZoom((z) => z.maxScale);
  const zoomed = scale > 1.01;
  const btn = "min-w-8 px-2 py-1 font-medium tabular-nums hover:bg-key-hover disabled:opacity-40";
  return (
    <div className="flex overflow-hidden rounded-lg bg-key text-sm text-ink" role="group" aria-label="Board zoom">
      <button type="button" className={btn} aria-label="Zoom out" disabled={!zoomed} onClick={() => useZoom.getState().zoomBy(1 / 1.5)}>
        −
      </button>
      <button type="button" className={btn} aria-label="Fit board" title="Fit board" disabled={!zoomed} onClick={() => useZoom.getState().reset()}>
        {Math.round(scale * 100)}%
      </button>
      <button type="button" className={btn} aria-label="Zoom in" disabled={scale >= maxScale} onClick={() => useZoom.getState().zoomBy(1.5)}>
        +
      </button>
    </div>
  );
}
