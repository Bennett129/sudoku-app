"use client";

import { useEffect, useRef, useState } from "react";
import type { GameSummary } from "@/lib/save/serialize";
import { listGames, MAX_GAMES } from "@/lib/save/storage";
import { deleteGame, openGame, useSaves } from "@/store/autosave";
import { formatTime, useGame } from "@/store/game";

type Filter = "all" | "playing" | "solved";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "playing", label: "In progress" },
  { id: "solved", label: "Solved" },
];

/** Past games saved on this device; tap one to reopen it. */
export function HistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const revision = useSaves((s) => s.revision);
  const currentId = useGame((s) => s.id);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Reload the list whenever the dialog opens or a save lands while it's open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listGames().then((list) => !cancelled && setGames(list));
    return () => {
      cancelled = true;
    };
  }, [open, revision]);

  const shown = (games ?? []).filter((g) => filter === "all" || g.status === filter);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="history-title"
      className="frost m-auto w-[min(94vw,30rem)] rounded-2xl p-0 text-ink backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[min(80dvh,40rem)] flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <h2 id="history-title" className="text-lg font-semibold">
            History
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm hover:bg-key">
            Close
          </button>
        </div>

        <div role="tablist" aria-label="Filter games" className="flex gap-1 rounded-xl bg-key p-1 text-sm">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`flex-1 rounded-lg py-1.5 font-medium transition ${
                filter === f.id ? "bg-accent text-accent-ink shadow-sm" : "text-ink-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <ul className="-mx-1 flex min-h-0 flex-col gap-2 overflow-y-auto px-1 py-1">
          {games === null ? (
            <li className="py-6 text-center text-sm text-ink-muted">Loading…</li>
          ) : shown.length === 0 ? (
            <li className="py-6 text-center text-sm text-ink-muted">
              {filter === "all" ? "No games yet." : filter === "playing" ? "No games in progress." : "No solved games yet."}
            </li>
          ) : (
            shown.map((g) => (
              <HistoryRow
                key={g.id}
                game={g}
                current={g.id === currentId}
                onOpen={async () => {
                  if (await openGame(g.id)) onClose();
                }}
                onRemove={() => void deleteGame(g.id)}
              />
            ))
          )}
        </ul>

        <p className="text-xs text-ink-muted">
          Saved on this device. The {MAX_GAMES} most recent games are kept.
        </p>
      </div>
    </dialog>
  );
}

function HistoryRow(props: { game: GameSummary; current: boolean; onOpen: () => void; onRemove: () => void }) {
  const { game: g, current } = props;
  const [confirming, setConfirming] = useState(false);
  const solved = g.status === "solved";
  const pct = Math.round((g.filled / g.total) * 100);

  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(id);
  }, [confirming]);

  return (
    <li
      className={`group relative flex items-stretch overflow-hidden rounded-xl bg-key transition hover:bg-key-hover ${
        current ? "ring-2 ring-accent" : ""
      }`}
    >
      <button type="button" onClick={props.onOpen} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left">
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-accent font-semibold text-accent-ink tabular-nums">
          {g.size}×{g.size}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{solved ? "Solved" : "In progress"}</span>
              {current && (
                <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold tracking-wide text-accent-ink uppercase">
                  Now playing
                </span>
              )}
            </span>
            <span className="shrink-0 text-xs text-ink-muted">{relativeTime(g.updatedAt)}</span>
          </span>
          <span className="text-sm text-ink-muted tabular-nums">
            {formatTime(g.elapsed)}
            {solved ? "" : ` · ${g.filled}/${g.total} filled`}
            {g.hintsUsed > 0 && ` · ${g.hintsUsed} hint${g.hintsUsed > 1 ? "s" : ""}`}
          </span>
          <span className="h-1 overflow-hidden rounded-full bg-black/10" aria-hidden="true">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${solved ? 100 : pct}%` }} />
          </span>
        </span>
      </button>
      {!current && (
        <button
          type="button"
          onClick={() => (confirming ? props.onRemove() : setConfirming(true))}
          aria-label={confirming ? "Confirm remove" : `Remove ${g.size}×${g.size} game`}
          className={`shrink-0 px-3 text-xs font-medium transition ${
            confirming ? "bg-[var(--error)] text-white" : "text-ink-muted hover:text-[var(--error)]"
          }`}
        >
          {confirming ? (
            "Remove"
          ) : (
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
            </svg>
          )}
        </button>
      )}
    </li>
  );
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function relativeTime(ts: number): string {
  const diff = (ts - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.35],
    ["month", 12],
    ["year", Infinity],
  ];
  let value = diff;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return unit === "second" ? "just now" : rtf.format(Math.round(value), unit);
    value /= size;
  }
  return "";
}
