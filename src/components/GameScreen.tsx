"use client";

import { useEffect, useState } from "react";
import { valueForKeyCode } from "@/lib/engine";
import { themeById } from "@/lib/themes";
import { formatTime, useGame } from "@/store/game";
import { useSettings } from "@/store/settings";
import { Controls } from "./Controls";
import { Header } from "./Header";
import { AccountDialog } from "./AccountDialog";
import { SettingsDialog } from "./SettingsDialog";
import { ZoomableBoard } from "./ZoomableBoard";

export function GameScreen() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const seed = useGame((s) => s.seed);
  const status = useGame((s) => s.status);
  const theme = useSettings((s) => s.theme);

  useBoot();
  useDevicePixelRatio();
  useTimer();
  useKeyboard(settingsOpen || accountOpen);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const credit = themeById(theme).credit;

  return (
    <main className="mx-auto flex h-dvh w-full max-w-6xl flex-col gap-3 p-3 sm:p-4 lg:gap-4">
      <Header onOpenSettings={() => setSettingsOpen(true)} onOpenAccount={() => setAccountOpen(true)} />

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:gap-4">
        {/* Board area: a size container so the square board fits both width and height. */}
        <section className="grid min-h-0 flex-1 place-items-center [container-type:size]">
          <ZoomableBoard key={seed} />
        </section>

        <aside className="frost shrink-0 rounded-2xl p-3 lg:flex lg:w-80 lg:flex-col lg:justify-center">
          <Controls />
          {status === "solved" && <Solved />}
        </aside>
      </div>

      <footer className="text-center text-xs text-white/85 drop-shadow">
        Photo by{" "}
        <a href={credit.profileUrl} target="_blank" rel="noreferrer" className="underline">
          {credit.photographer}
        </a>{" "}
        on{" "}
        <a href={credit.photoUrl} target="_blank" rel="noreferrer" className="underline">
          Unsplash
        </a>
      </footer>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AccountDialog open={accountOpen} onClose={() => setAccountOpen(false)} />
    </main>
  );
}

function Solved() {
  const elapsed = useGame((s) => s.elapsed);
  const hints = useGame((s) => s.hintsUsed);
  return (
    <p role="status" className="mt-3 rounded-xl bg-accent px-3 py-2 text-center font-medium text-accent-ink">
      Solved in {formatTime(elapsed)}
      {hints > 0 && ` · ${hints} hint${hints > 1 ? "s" : ""}`}
    </p>
  );
}

/** Client-only start-up: load saved settings, then deal the first puzzle. */
function useBoot() {
  useEffect(() => {
    void useSettings.persist.rehydrate();
    if (useGame.getState().status === "loading") useGame.getState().newGame(9);
  }, []);
}

/**
 * Expose devicePixelRatio as the CSS variable --dpr so gridlines can stay at
 * least one physical pixel wide. Updates on browser zoom and when the window
 * moves to a screen with different scaling.
 */
function useDevicePixelRatio() {
  useEffect(() => {
    let query: MediaQueryList | null = null;
    const update = () => {
      document.documentElement.style.setProperty("--dpr", String(window.devicePixelRatio || 1));
      query?.removeEventListener("change", update);
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      query.addEventListener("change", update);
    };
    update();
    return () => query?.removeEventListener("change", update);
  }, []);
}

/** One tick per second while playing and the tab is visible. */
function useTimer() {
  const status = useGame((s) => s.status);
  useEffect(() => {
    if (status !== "playing") return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") useGame.getState().tick();
    }, 1000);
    return () => clearInterval(id);
  }, [status]);
}

/**
 * Desktop keys: 1–9 / A–P enter values (Shift = note), arrows move,
 * Backspace/Delete erase, Space toggles notes mode, Ctrl+Z / Ctrl+Y undo/redo.
 */
function useKeyboard(disabled: boolean) {
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      const g = useGame.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.code === "KeyZ") {
        e.preventDefault();
        return e.shiftKey ? g.redo() : g.undo();
      }
      if (mod && e.code === "KeyY") {
        e.preventDefault();
        return g.redo();
      }
      if (mod || e.altKey) return;

      const arrows: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      if (arrows[e.code]) {
        e.preventDefault();
        return g.move(...arrows[e.code]);
      }
      if (e.code === "Backspace" || e.code === "Delete") {
        e.preventDefault();
        return g.erase();
      }
      if (e.code === "Space") {
        e.preventDefault();
        return g.toggleNotesMode();
      }
      const value = valueForKeyCode(e.code, g.spec.size);
      if (value !== null) {
        e.preventDefault();
        g.input(value, e.shiftKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled]);
}
