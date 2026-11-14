# Sudoku — Project Plan

A sudoku web app that is comfortable on a phone and supports grids from 6×6 to 25×25.
Most sudoku sites are clumsy on mobile and stop at 9×9; this one does neither.

_Last updated: 2026-11-14_

---

## 1. Goals

- **Mobile-first.** Pinch-zoom and pan on the grid, a number pad that stays in reach, no layout jank.
- **Many sizes.** Every size N that splits into rectangular boxes, from 6×6 to 25×25.
- **Size is separate from difficulty.** Any size can be played at any difficulty that size supports.
- **Every puzzle has exactly one solution.** No guessing required, and difficulty ratings stay meaningful.
- **Difficulty comes from the logic required**, not from how many cells are filled in.
- **Looks good.** Three photographic themes on frosted-glass panels.

## 2. Decisions

| Topic | Decision |
|---|---|
| Sizes | 6, 8, 9, 10, 12, 15, 16, 20, 25. **4×4 was dropped**: it only ever needs singles, so difficulty levels can't apply, and 6×6 covers "small and easy". **Prime sizes (5, 7, 11, 13…) are out of scope**: they need irregular "jigsaw" regions. |
| Box shape | Most-square factor pair, rows ≤ cols (6 → 2×3, 12 → 3×4, 20 → 4×5). |
| Symbols | 1–9, then A–P. Each value maps to exactly one key. |
| Solutions | **Exactly one.** Checked after every cell removal. |
| Notes | Per-cell candidate marks (stored as a bitmask). The setting **Auto-clean notes** (default on) removes a placed value from the notes in its row, column and box. |
| Mistakes | Setting **Highlight mistakes**, **default on**. A mistake is any entry that differs from the solution. |
| Undo / redo | **Default limit 3**, configurable from 0 to 999 or unlimited. Players who turn mistake highlighting off will want a higher limit. Undo also reverts auto-cleaned notes and hints. |
| Hints | The player selects a cell and its value is revealed. Hinted cells lock like givens. Hints used are counted and saved with the result. |
| Timer | Stored as **whole seconds**, displayed as `m:ss` (`h:mm:ss` past an hour). Pauses while the tab is hidden; stops when solved. |
| Keyboard | `1–9`/`A–P` enter a value · **Shift+key** enters a note · arrow keys move · Backspace/Delete erase · Space toggles notes mode · Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) undo/redo. Uses `KeyboardEvent.code`, so Shift doesn't change which value a key means. Space is used for notes mode because N is a value in 25×25. |
| Zoom | In-app pinch/drag/wheel zoom on the grid only, plus −/%/+ buttons in the header. Browser page zoom stays enabled for accessibility. The view pans automatically to keep the selected cell visible. |
| Accounts | Email-only sign-in with a **6-digit code**, not a magic link: on phones, links usually open inside the mail app's own browser, so the session would land in the wrong browser. First sign-in creates the account. **Optional**: the app works fully without an account; signing in adds sync across devices. |
| Saving | Local first (IndexedDB), synced to the server when signed in. |

## 3. Tech stack

Chosen to be solid engineering and also recognisable on a CV.

| Area | Choice | Status |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack, React Compiler) + TypeScript | ✅ in place |
| Styling | Tailwind CSS v4 + CSS custom-property theme tokens | ✅ in place |
| State | Zustand (game store, persisted settings store, zoom bridge) | ✅ in place |
| Gestures | `@use-gesture/react` | ✅ in place |
| Unit tests | Vitest | ✅ in place |
| E2E tests | Playwright with mobile device emulation | phase 2 |
| UI kit | shadcn/ui (dialogs, selects, toasts) when the settings UI grows | phase 2 |
| Database | PostgreSQL (local for dev; Neon or Supabase in production) | ✅ in place |
| ORM | Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`) | ✅ in place |
| Auth | **Better Auth** email-OTP plugin + Resend. Chosen over Auth.js because Auth.js is now maintained by the Better Auth team, who recommend Better Auth for new projects. | ✅ in place |
| CI/CD | GitHub Actions (lint, type-check, tests, puzzle generation job) + Vercel | phase 2 |
| Offline | PWA via Serwist | stretch |

## 4. Architecture

```
src/
  app/                  Next.js routes (layout sets the theme attribute + background)
  components/           GameScreen, Header, ZoomableBoard, Board, Controls, SettingsDialog
  store/                game.ts (puzzle + history), settings.ts (persisted), zoom.ts
  lib/
    themes.ts           theme metadata + photographer credits
    engine/             framework-free TypeScript, no React imports
      sizes.ts          supported sizes, box shapes
      symbols.ts        1–9/A–P, key-code mapping
      geometry.ts       row/col/box helpers, cached peer lists
      random.ts         seeded PRNG (mulberry32), shuffles
      generate.ts       complete-grid generator (+ temporary display puzzle)
      solver.ts         [phase 3] fast uniqueness solver
      techniques/       [phase 3] one file per human technique
      grader.ts         [phase 3] human-style solver → rating
```

The engine has no React dependencies, so the same code runs in the browser, in a Web Worker and in a Node generation script.

## 5. Puzzle generation

### 5.1 Complete grid

Start from a pattern that is valid by construction, `value(r, c) = (C·(r mod R) + ⌊r/R⌋ + c) mod N`. Then shuffle it in ways that keep it valid:
- relabel the symbols
- shuffle rows within each band, and shuffle the bands
- shuffle columns within each stack, and shuffle the stacks
- transpose (square boxes only)

This is instant even at 25×25. ✅ Done and tested for every supported size.

### 5.2 Removing cells while keeping one solution

```
cells = shuffled(all cells)
for cell in cells:
    remove cell
    if solver.countSolutions(grid, limit = 2) != 1:
        put cell back
```

**Uniqueness solver:** bitmask candidates per row, column and box. At each step it fills the cell with the fewest possible values first, and it stops as soon as it finds a second solution. If 25×25 turns out too slow, switch to Dancing Links (DLX). Runs in a Web Worker in the browser.

### 5.3 Difficulty grading (human-style solver)

```
candidates = all possible values for every cell
loop:
  for technique in TECHNIQUES (easiest first):
    step = technique.find(state)          // cells filled and/or values ruled out
    if step: apply it, record it, restart from the easiest technique
  if no technique found anything: break
rating = hardest technique used, with frequency as a tie-breaker
unsolved ⇒ "Beyond" (save it separately or throw it away)
```

Techniques work on generic groups of cells (rows, columns, boxes), so one implementation covers every size. Each technique is a pure function with its own unit tests.

| Level | Techniques |
|---|---|
| Easy | Naked single, hidden single |
| Medium | Naked/hidden pairs, pointing pairs, box/line reduction |
| Hard | Naked/hidden triples and quads, X-Wing, Swordfish |
| Expert | XY-Wing, XYZ-Wing, Jellyfish, Simple Coloring, Unique Rectangle |

References: [Conceptis — sudoku techniques](https://www.conceptispuzzles.com/index.aspx?uri=puzzle/sudoku/techniques), [Conceptis — difficulty article](https://www.conceptispuzzles.com/index.aspx?uri=info/article/2).

The technique catalogue is calibrated for 9×9. For **16×16 and up**, start with difficulty based on how many cells are removed (still unique), and add technique grading once it's fast enough.

### 5.4 Two removal strategies

1. **Random removal.** Harder levels try to remove more cells. This is the baseline.
2. **Technique-driven removal.** Bias which cells get removed toward ones whose deduction needs harder techniques. The **grader decides the final rating**, not the removal strategy.

### 5.5 Puzzle bank

Generation is "generate, grade, file under the rating it actually got". A puzzle that misses its target difficulty isn't wasted: it is stored under its real rating.

- `puzzles(id, size, givens, solution, rating, technique_counts, seed, created_at)`
- `user_puzzles(user_id, puzzle_id, state, elapsed_seconds, hints_used, completed_at)`
- Serve a puzzle the player hasn't played yet for the requested (size, difficulty).
- **Top-up:** when a (size, difficulty) group drops below about 50 unplayed puzzles, a background job generates more.
- **25×25 (and 20×20)** are generated ahead of time by a Node script in a scheduled GitHub Actions job and loaded into the database. Never on request: they would exceed serverless time limits.
- **Offline / empty group fallback:** generate in a Web Worker on the device.
- Puzzle IDs in the URL (`/play/9x9/<id>`) make puzzles shareable and bugs reproducible.

## 6. Themes

Three photographic themes. Each uses its photo as the background and a palette based on it. The grid sits on an opaque board inside a **frosted-glass** panel (`backdrop-filter: blur`), so numbers stay readable over the photo.

| Theme | Tone | Photo | Photographer |
|---|---|---|---|
| Summit | bright: blue sky, white cloud, golden meadow | [Mountain landscape with a winding road at sunset](https://unsplash.com/photos/majestic-mountain-landscape-with-a-winding-road-at-sunset-cjAI-0kMDC0) | [Rafael Peier](https://unsplash.com/@rafaelpeier) |
| Pass | in-between: steel-blue sky, burnt-orange slope | [Rocky mountain peak in golden light](https://unsplash.com/photos/rocky-mountain-peak-in-golden-light-cG4_rUVyW7c) | [Sarmat Batagov](https://unsplash.com/@batag_) |
| Dusk | dark: slate sky, sienna light, near-black shadow | [A mountain with a road going through it](https://unsplash.com/photos/a-mountain-with-a-road-going-through-it-tj2uU85m_q4) | [Filip Zrnzević](https://unsplash.com/@filipz) |

Credits appear in the footer (for the active theme) and in Settings (for all three), with Unsplash referral links.

- The dark theme gets its depth from a gradient overlay, not from the photo alone, so contrast stays under control whatever the image.
- Palettes are sampled from each photo. Every text/background pair on the board meets WCAG AA: ≥ 4.5:1 for values, ≥ 3:1 for note digits.
- **Image pipeline** (`npm run themes`, `scripts/optimize-themes.mjs`): the originals (`assets/themes/*.jpg`, about 19 MB, git-ignored) become
  - a 1200 px AVIF for phones (about 140–180 KB)
  - a 2400 px AVIF for screens ≥ 768 px wide (about 0.4–0.7 MB)
  - a 1200 px JPEG for browsers without AVIF
  - a ~150-byte blurred placeholder inlined in CSS, so something paints instantly

  Each theme also has a matching gradient as a last-resort fallback, and a focal point (`--bg-position`) that keeps the peak in frame when desktop crops the portrait photos.
- The saved theme is applied by an inline script before first paint, so the default photo never flashes.

## 7. Phases

### Phase 1 — Display ✅ (current)
- [x] Next.js + TS + Tailwind + Zustand + Vitest scaffold
- [x] Engine: sizes, symbols, geometry, seeded RNG, complete-grid generator, with tests for all sizes
- [x] Board rendering for every size (boxes made with CSS gaps, so thick/thin lines draw cleanly)
- [x] Highlights: selected cell, same row/column/box, same value, mistakes, givens vs entries vs hints
- [x] Notes in a box-shaped mini-grid, with the selected value emphasised
- [x] Number pad: phone layout (≤9 per row) and desktop keypad (box-shaped)
- [x] Toolbar: undo (with remaining count), redo, erase, notes mode, hint
- [x] Pinch / drag / wheel zoom, header zoom buttons, auto-pan to the selected cell
- [x] Keyboard controls
- [x] Timer (seconds, `m:ss`)
- [x] Settings: auto-clean notes, mistake highlighting, undo limit; persisted locally
- [x] Three themes with frosted panels and credits (palettes provisional)
- ⚠️ Puzzles are placeholders: random removal with **no uniqueness check**

### Phase 2 — Polish and saving locally
- [x] Add the photos; finalise the palettes; contrast pass; responsive image pipeline
- [x] Save games in progress to IndexedDB (`idb-keyval`); one per grid size, so switching sizes resumes each game; reopen the last played size on load
  - Saved: board, notes, hints, undo/redo history, timer, selection. Saves at most every 1.5 s while playing, immediately on new game, size switch or solve, and when the tab is hidden or closed
  - Versioned format; everything read back is validated (`lib/save/serialize.ts`, unit-tested) and a bad save is discarded rather than crashing the board
  - The size picker marks sizes with a game in progress; **New** asks "Sure?" before replacing a game with progress
  - Finished games are recorded (size, time, hints) for stats
- [x] **History**: every game is saved under its own id (`<size>-<seed>`), so starting a new puzzle keeps the old one. The History panel lists games with size, status, progress, time and hints; filters for all, in progress and solved; tap to reopen; remove with a confirming second tap. Keeps the 50 most recent, never pruning a size's current game. Saves from the old one-per-size format are upgraded automatically on load
- [x] Prevent the theme flashing on first paint (inline script that sets `data-theme` before hydration)
- [ ] Double-tap a box to zoom into it
- [ ] Notes on big grids: show notes only when zoomed in enough to read them (show a dot otherwise)
- [ ] "Fill all candidates" action
- [ ] Solved screen; per-size/difficulty stats (best and average time, solves without hints)
- [ ] Playwright e2e on iPhone/Pixel emulation; GitHub Actions CI

### Phase 3 — Real puzzles
- [ ] Uniqueness solver + uniqueness-preserving removal (all sizes)
- [ ] Technique library + grader (Easy and Medium first, then Hard and Expert)
- [ ] Generation in a Web Worker; difficulty picker in the UI

### Phase 4 — Puzzle bank
- [ ] Postgres + Prisma schema; API route to fetch an unplayed puzzle
- [ ] Generation script + scheduled top-up job; pre-generated 20×20 and 25×25 sets
- [ ] Puzzle IDs in the URL

### Phase 5 — Accounts and sync
- [x] Better Auth email-code sign-in (Resend; console fallback in dev); codes hashed, 10-minute expiry, 5 attempts; rate limits stored in the DB; 30-day sessions
- [ ] Set up Resend with a verified sending domain for production
- [ ] Sync settings, games in progress and stats; merge local data on first sign-in

## 8. Open questions

- Is the dark theme dark enough once the real photo is in? Adjust the overlay strength per theme if not.
- Should hints count toward the undo limit? (Currently yes: a hint is an undoable move.)
- Show the timer during play, or only on completion, as a setting?
