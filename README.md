# Sudoku

A mobile-friendly sudoku app supporting grids from 4×4 to 25×25, built with Next.js, TypeScript, Tailwind CSS and Zustand.

See [PLAN.md](./PLAN.md) for goals, decisions and the roadmap.

## Getting started

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL and BETTER_AUTH_SECRET
npm run db:migrate     # creates the database tables
npm run dev            # http://localhost:3000
npm test           # engine unit tests (Vitest)
npm run typecheck
npm run lint
```

## Sign-in

Email only: enter your email, then the 6-digit code you're sent. In development, without
`RESEND_API_KEY`, the code is printed to the dev server console instead of emailed.

## Controls

| Key | Action |
|---|---|
| `1`–`9`, `A`–`P` | Enter value |
| `Shift` + key | Toggle note |
| Arrow keys | Move selection |
| `Backspace` / `Delete` | Erase |
| `Space` | Toggle notes mode |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |

On touch screens: pinch to zoom the grid, drag to pan.

## Photography

Background photos from Unsplash:
[Rafael Peier](https://unsplash.com/@rafaelpeier) (Summit),
[Sarmat Batagov](https://unsplash.com/@batag_) (Pass),
[Filip Zrnzević](https://unsplash.com/@filipz) (Dusk).

Originals go in `assets/themes/` (git-ignored); `npm run themes` generates the optimised versions in `public/themes/`.
