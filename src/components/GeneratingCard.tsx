"use client";

import { puzzleLabel } from "@/lib/labels";
import { useGame } from "@/store/game";

/** Shown over the board while a new puzzle is generated in the background. */
export function GeneratingCard() {
  const generating = useGame((s) => s.generating);
  if (!generating) return null;
  const big = generating.size >= 16;

  return (
    <div className="board-square z-20 grid aspect-square place-items-center rounded-md bg-black/25 backdrop-blur-[3px] [grid-area:1/1]">
      <div
        role="status"
        aria-live="polite"
        className="solid-card animate-pop flex w-[min(85%,18rem)] flex-col items-center gap-3 rounded-3xl px-5 py-6 text-center shadow-2xl shadow-black/40"
      >
        <span
          className="size-8 animate-spin rounded-full border-[3px] border-[var(--line-thin)] border-t-[var(--accent)]"
          aria-hidden="true"
        />
        <p className="font-medium">Generating {puzzleLabel(generating.size, generating.difficulty)}…</p>
        <p className="text-sm text-ink-muted">
          {big ? "Big grids can take a few seconds." : "Checking it has exactly one solution."}
        </p>
      </div>
    </div>
  );
}
