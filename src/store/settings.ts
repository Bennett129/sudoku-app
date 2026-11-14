import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Difficulty } from "@/lib/engine";
import { DEFAULT_THEME, type ThemeId } from "@/lib/themes";

export interface Settings {
  theme: ThemeId;
  /** Entering a value removes it from the notes of every peer cell. */
  autoCleanNotes: boolean;
  /** Show entries that disagree with the solution. */
  highlightMistakes: boolean;
  /** Max undo steps kept; null = unlimited. Default 3 by design. */
  undoLimit: number | null;
  /** Difficulty used for new puzzles. */
  difficulty: Difficulty;
}

interface SettingsStore extends Settings {
  update: (patch: Partial<Settings>) => void;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: DEFAULT_THEME,
  autoCleanNotes: true,
  highlightMistakes: true,
  undoLimit: 3,
  difficulty: "medium",
};

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
    }),
    {
      name: "sudoku-settings",
      version: 1,
      // Rehydrated on the client after mount (see <ClientBoot>) to avoid
      // server/client markup mismatches.
      skipHydration: true,
    },
  ),
);
