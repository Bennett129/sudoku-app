/**
 * Player settings: shape, defaults and validation (pure, shared by the
 * client store and the sync endpoint).
 */
import { DIFFICULTIES, type Difficulty } from "@/lib/engine";
import { DEFAULT_THEME, THEMES, type ThemeId } from "@/lib/themes";

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

export const DEFAULT_SETTINGS: Settings = {
  theme: DEFAULT_THEME,
  autoCleanNotes: true,
  highlightMistakes: true,
  undoLimit: 3,
  difficulty: "medium",
};

export const MAX_UNDO_LIMIT = 1000;

/** Just the settings fields of a larger object (e.g. the store). */
export const pickSettings = (s: Settings): Settings => ({
  theme: s.theme,
  autoCleanNotes: s.autoCleanNotes,
  highlightMistakes: s.highlightMistakes,
  undoLimit: s.undoLimit,
  difficulty: s.difficulty,
});

/**
 * Validate settings from an untrusted source. Unknown or invalid fields fall
 * back to the default, so a setting added later never breaks older data.
 */
export function parseSettings(x: unknown): Settings | null {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    theme: THEMES.some((t) => t.id === o.theme) ? (o.theme as ThemeId) : d.theme,
    autoCleanNotes: typeof o.autoCleanNotes === "boolean" ? o.autoCleanNotes : d.autoCleanNotes,
    highlightMistakes: typeof o.highlightMistakes === "boolean" ? o.highlightMistakes : d.highlightMistakes,
    undoLimit:
      o.undoLimit === null
        ? null
        : Number.isInteger(o.undoLimit) && (o.undoLimit as number) >= 0 && (o.undoLimit as number) <= MAX_UNDO_LIMIT
          ? (o.undoLimit as number)
          : d.undoLimit,
    difficulty: DIFFICULTIES.includes(o.difficulty as Difficulty) ? (o.difficulty as Difficulty) : d.difficulty,
  };
}
