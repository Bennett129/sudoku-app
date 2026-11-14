import type { Difficulty } from "@/lib/engine";

const NAMES: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};

/** Display name; null means the game predates difficulty grading. */
export const difficultyLabel = (d: Difficulty | null) => (d ? NAMES[d] : "Unrated");

/** e.g. "Hard 9×9" */
export const puzzleLabel = (size: number, d: Difficulty | null) =>
  d ? `${NAMES[d]} ${size}×${size}` : `${size}×${size}`;
