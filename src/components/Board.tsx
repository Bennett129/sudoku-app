"use client";

import { boxOf, colOf, rowOf, symbolFor, range, type BoxShape } from "@/lib/engine";
import { useGame } from "@/store/game";
import { useSettings } from "@/store/settings";

/**
 * The grid is a flat N×N CSS grid of cells with no gaps; gridlines are an
 * SVG overlay on top. Earlier versions drew lines as 1px gaps between opaque
 * cells, which could vanish at fractional device-pixel ratios (e.g. 125 %
 * Windows scaling) because cell edges snap over the gap. SVG strokes with
 * crispEdges always render at least one device pixel.
 *
 * Plain DOM (not canvas) keeps it accessible; 625 cells is comfortably fast.
 */
export function Board() {
  const spec = useGame((s) => s.spec);
  const values = useGame((s) => s.values);
  const notes = useGame((s) => s.notes);
  const givens = useGame((s) => s.givens);
  const hinted = useGame((s) => s.hinted);
  const solution = useGame((s) => s.solution);
  const selected = useGame((s) => s.selected);
  const select = useGame((s) => s.select);
  const highlightMistakes = useSettings((s) => s.highlightMistakes);

  const { size: n, box } = spec;
  if (values.length !== n * n) return <div className="board w-full" aria-busy="true" />;

  const selValue = selected !== null ? values[selected] : 0;
  const selRow = selected !== null ? rowOf(spec, selected) : -1;
  const selCol = selected !== null ? colOf(spec, selected) : -1;
  const selBox = selected !== null ? boxOf(spec, selected) : -1;

  return (
    <div
      className="board w-full"
      role="grid"
      aria-label={`${n} by ${n} sudoku`}
      style={
        {
          "--n": n,
          "--note-cols": box.cols,
          "--note-rows": box.rows,
          gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${n}, minmax(0, 1fr))`,
        } as React.CSSProperties
      }
    >
      {range(n * n).map((i) => {
        const r = Math.floor(i / n);
        const c = i % n;
        const v = values[i];
        const isSelected = i === selected;
        const isPeer = !isSelected && (r === selRow || c === selCol || boxOf(spec, i) === selBox);
        const isSame = !isSelected && v !== 0 && v === selValue;
        const isMistake = highlightMistakes && v !== 0 && v !== solution[i];
        return (
          <button
            key={i}
            type="button"
            role="gridcell"
            className="cell"
            aria-label={`Row ${r + 1}, column ${c + 1}, ${v ? symbolFor(v) : "empty"}`}
            aria-selected={isSelected}
            data-selected={isSelected || undefined}
            data-peer={isPeer || undefined}
            data-same={isSame || undefined}
            data-given={givens[i] || undefined}
            data-hinted={hinted[i] || undefined}
            data-mistake={isMistake || undefined}
            data-cell={i}
            tabIndex={-1}
            onClick={() => select(i)}
          >
            {v !== 0 ? symbolFor(v) : notes[i] !== 0 && <Notes mask={notes[i]} size={n} match={selValue} />}
          </button>
        );
      })}
      <GridLines size={n} box={box} />
    </div>
  );
}

/** Thin lines between cells, thick lines between boxes (outer edge is the board border). */
function GridLines({ size: n, box }: { size: number; box: BoxShape }) {
  const thin: string[] = [];
  const thick: string[] = [];
  for (let k = 1; k < n; k++) {
    (k % box.cols === 0 ? thick : thin).push(`M${k} 0V${n}`); // vertical line before column k
    (k % box.rows === 0 ? thick : thin).push(`M0 ${k}H${n}`); // horizontal line before row k
  }
  return (
    <svg className="gridlines" viewBox={`0 0 ${n} ${n}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="gridlines-thin" d={thin.join("")} />
      <path className="gridlines-thick" d={thick.join("")} />
    </svg>
  );
}

function Notes({ mask, size, match }: { mask: number; size: number; match: number }) {
  return (
    <span className="notes" aria-hidden="true">
      {range(size).map((k) => {
        const v = k + 1;
        const on = (mask & (1 << k)) !== 0;
        return (
          <span key={v} data-match={(on && v === match) || undefined}>
            {on ? symbolFor(v) : ""}
          </span>
        );
      })}
    </span>
  );
}
