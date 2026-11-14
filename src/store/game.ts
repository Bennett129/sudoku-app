import { create } from "zustand";
import {
  colOf,
  createRng,
  generateSolution,
  makeDisplayPuzzle,
  peersOf,
  randomSeed,
  rowOf,
  specFor,
  type GridSpec,
} from "@/lib/engine";
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

  newGame: (size: number, seed?: number) => void;
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

  restore: (saved) =>
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
    }),

  newGame: (size, seed = randomSeed()) => {
    const spec = specFor(size);
    const rng = createRng(seed);
    const solution = generateSolution(spec, rng);
    const values = makeDisplayPuzzle(solution, rng);
    const cells = size * size;
    set({
      spec,
      seed,
      id: makeGameId(size, seed),
      createdAt: Date.now(),
      solution,
      values,
      givens: values.map((v) => v !== 0),
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

  tick: () => set((s) => (s.status === "playing" ? { elapsed: s.elapsed + 1 } : s)),
}));

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
