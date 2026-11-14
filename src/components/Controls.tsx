"use client";

import { range, symbolFor } from "@/lib/engine";
import { useGame } from "@/store/game";
import { useSettings } from "@/store/settings";

export function Controls() {
  return (
    <div className="flex w-full flex-col gap-3">
      <Toolbar />
      <NumberPad />
    </div>
  );
}

function Toolbar() {
  const notesMode = useGame((s) => s.notesMode);
  const undosLeft = useGame((s) => s.past.length);
  const canRedo = useGame((s) => s.future.length > 0);
  const hintsUsed = useGame((s) => s.hintsUsed);
  const { undo, redo, erase, toggleNotesMode, hint } = useGame.getState();
  const undoLimit = useSettings((s) => s.undoLimit);

  return (
    <div className="grid grid-cols-5 gap-2">
      <Tool label="Undo" onClick={undo} disabled={undosLeft === 0} badge={undoLimit === null ? undefined : String(undosLeft)}>
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
      </Tool>
      <Tool label="Redo" onClick={redo} disabled={!canRedo}>
        <path d="m15 14 5-5-5-5" />
        <path d="M20 9H9a5 5 0 0 0 0 10h3" />
      </Tool>
      <Tool label="Erase" onClick={erase}>
        <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l9.6-9.6a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21" />
        <path d="M22 21H7" />
        <path d="m5 11 9 9" />
      </Tool>
      <Tool label="Notes" onClick={toggleNotesMode} active={notesMode} badge={notesMode ? "on" : "off"}>
        <path d="M12 20h9" />
        <path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </Tool>
      <Tool label="Hint" onClick={hint} badge={hintsUsed ? String(hintsUsed) : undefined}>
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2Z" />
      </Tool>
    </div>
  );
}

function Tool(props: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={props.active}
      className={`relative flex flex-col items-center gap-0.5 rounded-xl py-2 text-xs font-medium transition disabled:opacity-40 ${
        props.active ? "bg-accent text-accent-ink" : "text-ink hover:bg-key"
      }`}
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {props.children}
      </svg>
      <span>{props.label}</span>
      {props.badge && (
        <span className="absolute top-1 right-[18%] rounded-full bg-accent px-1.5 text-[10px] leading-4 text-accent-ink">
          {props.badge}
        </span>
      )}
    </button>
  );
}

function NumberPad() {
  const size = useGame((s) => s.spec.size);
  const values = useGame((s) => s.values);
  const notesMode = useGame((s) => s.notesMode);
  const input = useGame((s) => s.input);

  const counts = new Array<number>(size + 1).fill(0);
  for (const v of values) counts[v]++;

  const boxCols = useGame((s) => s.spec.box.cols);

  // Phone: at most 9 keys per row (9 → 1 row, 16 → 8×2, 25 → 9/9/7).
  // Desktop sidebar: keypad shaped like a box (9 → 3×3, 16 → 4×4, 25 → 5×5).
  const cols = Math.ceil(size / Math.ceil(size / 9));

  return (
    <div
      className="grid grid-cols-[repeat(var(--pad),minmax(0,1fr))] gap-1.5 lg:grid-cols-[repeat(var(--pad-lg),minmax(0,1fr))] lg:gap-2"
      style={{ "--pad": cols, "--pad-lg": boxCols } as React.CSSProperties}
    >
      {range(size).map((k) => {
        const v = k + 1;
        const done = counts[v] >= size;
        return (
          <button
            key={v}
            type="button"
            onClick={() => input(v)}
            disabled={done && !notesMode}
            className="flex aspect-[4/5] max-h-16 flex-col lg:max-h-none items-center justify-center rounded-lg bg-key text-ink shadow-sm transition hover:bg-key-hover active:scale-95 disabled:opacity-30 sm:aspect-square"
          >
            <span className={notesMode ? "text-base text-ink-muted" : "text-xl font-semibold sm:text-2xl"}>{symbolFor(v)}</span>
            <span className="text-[10px] text-ink-muted tabular-nums">{Math.max(0, size - counts[v])}</span>
          </button>
        );
      })}
    </div>
  );
}
