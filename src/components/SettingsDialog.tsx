"use client";

import { useEffect, useRef } from "react";
import { THEMES } from "@/lib/themes";
import { useSettings } from "@/store/settings";
import { ThemePicker } from "./Header";

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const s = useSettings();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="frost m-auto w-[min(92vw,26rem)] rounded-2xl p-0 text-ink backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col gap-5 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm hover:bg-key">
            Done
          </button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="font-medium">Theme</div>
          <ThemePicker />
        </div>

        <Toggle
          label="Auto-clean notes"
          description="Entering a value removes it from notes in the same row, column and box."
          checked={s.autoCleanNotes}
          onChange={(v) => s.update({ autoCleanNotes: v })}
        />
        <Toggle
          label="Highlight mistakes"
          description="Mark entries that don't match the solution."
          checked={s.highlightMistakes}
          onChange={(v) => s.update({ highlightMistakes: v })}
        />

        <div className="flex flex-col gap-2">
          <div>
            <div className="font-medium">Undo limit</div>
            <p className="text-sm text-ink-muted">
              How many moves you can take back. Raise it if you play with mistake highlighting off.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={999}
              inputMode="numeric"
              disabled={s.undoLimit === null}
              value={s.undoLimit ?? ""}
              onChange={(e) => s.update({ undoLimit: clampLimit(e.target.value) })}
              className="w-20 rounded-lg bg-key px-2 py-1 tabular-nums disabled:opacity-40"
              aria-label="Undo limit"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={s.undoLimit === null}
                onChange={(e) => s.update({ undoLimit: e.target.checked ? null : 3 })}
              />
              Unlimited
            </label>
          </div>
        </div>

        <div className="border-t border-panel-border pt-4 text-sm text-ink-muted">
          <div className="mb-1 font-medium text-ink">Photography</div>
          <ul className="flex flex-col gap-1">
            {THEMES.map((t) => (
              <li key={t.id}>
                {t.name}:{" "}
                <a href={t.credit.photoUrl} target="_blank" rel="noreferrer" className="underline">
                  photo
                </a>{" "}
                by{" "}
                <a href={t.credit.profileUrl} target="_blank" rel="noreferrer" className="underline">
                  {t.credit.photographer}
                </a>{" "}
                on Unsplash
              </li>
            ))}
          </ul>
        </div>
      </div>
    </dialog>
  );
}

function clampLimit(raw: string): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.min(999, Math.max(0, n)) : 0;
}

function Toggle(props: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block font-medium">{props.label}</span>
        <span className="block text-sm text-ink-muted">{props.description}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
        className="mt-1 size-5 accent-[var(--accent)]"
      />
    </label>
  );
}
