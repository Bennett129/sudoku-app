"use client";

import { boxOf, colOf, rowOf, symbolFor, range } from "@/lib/engine";
import { useGame } from "@/store/game";
import { useSettings } from "@/store/settings";

/**
 * Renders the grid as boxes of cells so thick/thin lines come from grid gaps.
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
  if (values.length !== n * n) return <div className="board aspect-square w-full" aria-busy="true" />;

  const selValue = selected !== null ? values[selected] : 0;
  const selRow = selected !== null ? rowOf(spec, selected) : -1;
  const selCol = selected !== null ? colOf(spec, selected) : -1;
  const selBox = selected !== null ? boxOf(spec, selected) : -1;
  const boxesAcross = n / box.cols;
  const boxesDown = n / box.rows;

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
          gridTemplateColumns: `repeat(${boxesAcross}, 1fr)`,
          gridTemplateRows: `repeat(${boxesDown}, 1fr)`,
        } as React.CSSProperties
      }
    >
      {range(boxesDown * boxesAcross).map((b) => {
        const top = Math.floor(b / boxesAcross) * box.rows;
        const left = (b % boxesAcross) * box.cols;
        return (
          <div
            key={b}
            className="box"
            style={{
              gridTemplateColumns: `repeat(${box.cols}, 1fr)`,
              gridTemplateRows: `repeat(${box.rows}, 1fr)`,
            }}
          >
            {range(box.rows * box.cols).map((k) => {
              const r = top + Math.floor(k / box.cols);
              const c = left + (k % box.cols);
              const i = r * n + c;
              const v = values[i];
              const isSelected = i === selected;
              const isPeer = !isSelected && (r === selRow || c === selCol || b === selBox);
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
          </div>
        );
      })}
    </div>
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
