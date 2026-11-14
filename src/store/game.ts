import { create } from "zustand";
import {
  candidatesFor,
  colOf,
  effectiveDifficulty,
  peersOf,
  randomSeed,
  rowOf,
  specFor,
  type Difficulty,
  type GridSpec,
} from "@/lib/engine";
import { dealPuzzle, type DealtPuzzle } from "@/lib/generate-client";
import { markBankSeen } from "@/lib/save/storage";
import { makeGameId, type SavedGame } from "@/lib/save/serialize";
import { useSettings } from "./settings";

/** Notes are a bitmask per cell: bit (v - 1) set ⇒ v is pencilled in. */
const bit = (v: number) => 1 << (v - 1);

interface Snapshot {
  values: number[];
  notes: number[];
  hinted: boolean[];
}

export type GameStatus = "loading" | "playing" | "solved";

interface GameState extends Snapshot {
  spec: GridSpec;
  seed: number;
  /** Stable id (size + seed), used to keep past games in History. */
  id: string;
  createdAt: number;
  solution: number[];
  givens: boolean[];
  selected: number | null;
  notesMode: boolean;
  past: Snapshot[];
  future: Snapshot[];
  hintsUsed: number;
  /** Whole seconds; displayed as mm:ss. */
  elapsed: number;
  status: GameStatus;
  /** Rating the grader gave this puzzle; null for games saved before difficulty existed. */
  difficulty: Difficulty | null;
  /** Set while a new puzzle is being generated in the background. */
  generating: { size: number; difficulty: Difficulty } | null;
  /** Puzzle-bank id when the puzzle came from the bank (shareable as /p/<id>). */
  bankId: string | null;

  /** Deal a new puzzle (bank first, else generated in a worker). Defaults to the preferred difficulty. */
  newGame: (size: number, difficulty?: Difficulty) => Promise<void>;
  /** Start a specific, already-fetched puzzle (e.g. from a share link). */
  startPuzzle: (dealt: DealtPuzzle) => void;
  /** Load a validated saved game (see lib/save). */
  restore: (saved: SavedGame) => void;
  select: (index: number | null) => void;
  move: (dRow: number, dCol: number) => void;
  input: (value: number, asNote?: boolean) => void;
  erase: () => void;
  toggleNotesMode: () => void;
  undo: () => void;
  redo: () => void;
  hint: () => void;
  /** Pencil in every possible value for each empty cell (one undo step). */
  fillCandidates: () => void;
  tick: () => void;
}

const snapshot = (s: Snapshot): Snapshot => ({
  values: s.values.slice(),
  notes: s.notes.slice(),
  hinted: s.hinted.slice(),
});

/** Append to history, trimmed to the user's undo limit. */
function pushPast(past: Snapshot[], current: Snapshot): Snapshot[] {
  const limit = useSettings.getState().undoLimit;
  if (limit === 0) return [];
  const next = [...past, snapshot(current)];
  return limit === null ? next : next.slice(-limit);
}

const isSolved = (values: number[], solution: number[]) => values.every((v, i) => v === solution[i]);

function removeFromPeerNotes(spec: GridSpec, notes: number[], index: number, value: number) {
  for (const p of peersOf(spec)[index]) notes[p] &= ~bit(value);
}

const initialSpec = specFor(9);

/** Bumped on every new game / restore so a slow generation can't overwrite a newer game. */
let generation = 0;

export const useGame = create<GameState>()((set, get) => ({
  spec: initialSpec,
  seed: 0,
  id: "",
  createdAt: 0,
  solution: [],
  givens: [],
  values: [],
  notes: [],
  hinted: [],
  selected: null,
  notesMode: false,
  past: [],
  future: [],
  hintsUsed: 0,
  elapsed: 0,
  status: "loading",
  difficulty: null,
  generating: null,
  bankId: null,

  restore: (saved) => {
    generation++; // cancel any puzzle still being generated
    set({
      spec: specFor(saved.size),
      seed: saved.seed,
      id: saved.id,
      createdAt: saved.createdAt,
      solution: saved.solution,
      givens: saved.givens,
      values: saved.values,
      notes: saved.notes,
      hinted: saved.hinted,
      past: saved.past,
      future: saved.future,
      selected: saved.selected,
      notesMode: saved.notesMode,
      hintsUsed: saved.hintsUsed,
      elapsed: saved.elapsed,
      status: saved.status,
      difficulty: saved.difficulty,
      bankId: saved.bankId,
      generating: null,
    });
  },

  newGame: async (size, preferred = useSettings.getState().difficulty) => {
    const difficulty = effectiveDifficulty(size, preferred);
    const token = ++generation;
    set({ generating: { size, difficulty } });
    let dealt: DealtPuzzle;
    try {
      dealt = await dealPuzzle(size, randomSeed(), difficulty);
    } catch (error) {
      console.error("[generate] failed:", error);
      if (token === generation) set({ generating: null });
      return;
    }
    if (token !== generation) return; // superseded by another new game, size switch or restore
    get().startPuzzle(dealt);
  },

  startPuzzle: (dealt) => {
    generation++;
    const size = Math.round(Math.sqrt(dealt.puzzle.length));
    const cells = size * size;
    const seed = randomSeed();
    if (dealt.bankId) void markBankSeen(dealt.bankId);
    set({
      spec: specFor(size),
      seed,
      // Bank puzzles get a stable id so a shared link reopens the same saved game.
      id: dealt.bankId ? `p-${dealt.bankId}` : makeGameId(size, seed),
      bankId: dealt.bankId,
      createdAt: Date.now(),
      solution: dealt.solution,
      values: dealt.puzzle,
      difficulty: dealt.difficulty,
      generating: null,
      givens: dealt.puzzle.map((v) => v !== 0),
      notes: new Array(cells).fill(0),
      hinted: new Array(cells).fill(false),
      selected: null,
      notesMode: false,
      past: [],
      future: [],
      hintsUsed: 0,
      elapsed: 0,
      status: "playing",
    });
  },

  select: (index) => set({ selected: index }),

  move: (dRow, dCol) => {
    const { spec, selected } = get();
    const n = spec.size;
    if (selected === null) return set({ selected: 0 });
    const r = (rowOf(spec, selected) + dRow + n) % n;
    const c = (colOf(spec, selected) + dCol + n) % n;
    set({ selected: r * n + c });
  },

  input: (value, asNote = false) => {
    const s = get();
    const i = s.selected;
    if (s.status !== "playing" || i === null || s.givens[i] || s.hinted[i]) return;

    const values = s.values.slice();
    const notes = s.notes.slice();

    if (s.notesMode !== asNote) {
      // Note entry: only on empty cells.
      if (values[i] !== 0) return;
      notes[i] ^= bit(value);
    } else if (values[i] === value) {
      values[i] = 0; // tapping the same value again clears it
    } else {
      values[i] = value;
      notes[i] = 0;
      if (useSettings.getState().autoCleanNotes) removeFromPeerNotes(s.spec, notes, i, value);
    }

    set({
      values,
      notes,
      past: pushPast(s.past, s),
      future: [],
      status: isSolved(values, s.solution) ? "solved" : "playing",
    });
  },

  erase: () => {
    const s = get();
    const i = s.selected;
    if (s.status !== "playing" || i === null || s.givens[i] || s.hinted[i]) return;
    if (s.values[i] === 0 && s.notes[i] === 0) return;
    const values = s.values.slice();
    const notes = s.notes.slice();
    values[i] = 0;
    notes[i] = 0;
    set({ values, notes, past: pushPast(s.past, s), future: [] });
  },

  toggleNotesMode: () => set((s) => ({ notesMode: !s.notesMode })),

  undo: () => {
    const s = get();
    const prev = s.past.at(-1);
    if (!prev || s.status !== "playing") return;
    set({ ...prev, past: s.past.slice(0, -1), future: [...s.future, snapshot(s)] });
  },

  redo: () => {
    const s = get();
    const next = s.future.at(-1);
    if (!next || s.status !== "playing") return;
    set({ ...next, future: s.future.slice(0, -1), past: pushPast(s.past, s) });
  },

  /** Reveal the selected cell's value. Hinted cells lock like givens. */
  hint: () => {
    const s = get();
    const i = s.selected;
    if (s.status !== "playing" || i === null || s.givens[i] || s.hinted[i]) return;
    const values = s.values.slice();
    const notes = s.notes.slice();
    const hinted = s.hinted.slice();
    values[i] = s.solution[i];
    notes[i] = 0;
    hinted[i] = true;
    if (useSettings.getState().autoCleanNotes) removeFromPeerNotes(s.spec, notes, i, values[i]);
    set({
      values,
      notes,
      hinted,
      hintsUsed: s.hintsUsed + 1,
      past: pushPast(s.past, s),
      future: [],
      status: isSolved(values, s.solution) ? "solved" : "playing",
    });
  },

  fillCandidates: () => {
    const s = get();
    if (s.status !== "playing") return;
    const notes = candidatesFor(s.spec, s.values);
    if (notes.every((m, i) => m === s.notes[i])) return; // nothing would change
    set({ notes, past: pushPast(s.past, s), future: [] });
  },

  tick: () => set((s) => (s.status === "playing" && !s.generating ? { elapsed: s.elapsed + 1 } : s)),
}));

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
