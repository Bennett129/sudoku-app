"use client";

import { useEffect, useRef, useState } from "react";
import { useGesture } from "@use-gesture/react";
import { colOf, rowOf } from "@/lib/engine";
import { useGame } from "@/store/game";
import { useZoom } from "@/store/zoom";
import { Board } from "./Board";

interface View {
  s: number;
  x: number;
  y: number;
}

const IDENTITY: View = { s: 1, x: 0, y: 0 };
const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * In-app zoom for the grid only: the number pad and header stay put.
 * - Touch: pinch to zoom, drag to pan.  - Desktop: wheel / trackpad pinch, or the buttons.
 * Page-level browser zoom is left enabled for accessibility; `touch-action: none`
 * on the frame just stops the browser from claiming gestures on the grid itself.
 */
export function ZoomableBoard() {
  const frameRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>(IDENTITY);
  const suppressClick = useRef(false);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const [view, setView] = useState<View>(IDENTITY);
  const size = useGame((s) => s.spec.size);
  const box = useGame((s) => s.spec.box);

  // Bigger grids get more zoom headroom (9×9 → 2.5×, 25×25 → ~6×).
  const maxScale = Math.max(2.5, size / 4);

  const apply = (next: View) => {
    const w = frameRef.current?.clientWidth ?? 0;
    const s = clampNum(next.s, 1, maxScale);
    const min = w - w * s; // content must always cover the frame
    const v = { s, x: clampNum(next.x, min, 0), y: clampNum(next.y, min, 0) };
    viewRef.current = v;
    setView(v);
    if (useZoom.getState().scale !== s) useZoom.setState({ scale: s });
  };

  /** Zoom by a factor while keeping the point (lx, ly) — frame-local px — fixed. */
  const zoomAt = (factor: number, lx: number, ly: number) => {
    const v = viewRef.current;
    const s = clampNum(v.s * factor, 1, maxScale);
    const px = (lx - v.x) / v.s;
    const py = (ly - v.y) / v.s;
    apply({ s, x: lx - px * s, y: ly - py * s });
  };

  const zoomCenter = (factor: number) => {
    const w = frameRef.current?.clientWidth ?? 0;
    zoomAt(factor, w / 2, w / 2);
  };

  /**
   * Double-tap / double-click: zoom so the tapped box fills the board;
   * doing it again while zoomed returns to the full board.
   */
  const toggleBoxZoom = (clientX: number, clientY: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const v = viewRef.current;
    if (v.s > 1.05) return apply(IDENTITY);
    const rect = frame.getBoundingClientRect();
    const w = frame.clientWidth;
    const cell = w / size;
    const col = Math.floor((clientX - rect.left - v.x) / v.s / cell);
    const row = Math.floor((clientY - rect.top - v.y) / v.s / cell);
    const left = Math.floor(col / box.cols) * box.cols * cell;
    const top = Math.floor(row / box.rows) * box.rows * cell;
    const bw = box.cols * cell;
    const bh = box.rows * cell;
    const s = clampNum(Math.min(w / bw, w / bh) * 0.9, 1, maxScale);
    apply({ s, x: w / 2 - (left + bw / 2) * s, y: w / 2 - (top + bh / 2) * s });
  };

  useGesture(
    {
      onPinch: ({ origin: [ox, oy], first, movement: [ms], memo }) => {
        const rect = frameRef.current!.getBoundingClientRect();
        const lx = ox - rect.left;
        const ly = oy - rect.top;
        if (first) {
          const v = viewRef.current;
          memo = { s0: v.s, px: (lx - v.x) / v.s, py: (ly - v.y) / v.s };
        }
        const s = clampNum(memo.s0 * ms, 1, maxScale);
        // Keep the content point that started under the fingers under them now (also pans).
        apply({ s, x: lx - memo.px * s, y: ly - memo.py * s });
        return memo;
      },
      onDrag: ({ pinching, cancel, delta: [dx, dy], movement: [mx, my] }) => {
        if (pinching) return cancel();
        if (Math.hypot(mx, my) > 6) suppressClick.current = true;
        const v = viewRef.current;
        if (v.s > 1) apply({ ...v, x: v.x + dx, y: v.y + dy });
      },
      onWheel: ({ event, delta: [, dy] }) => {
        event.preventDefault();
        const rect = frameRef.current!.getBoundingClientRect();
        zoomAt(Math.exp(-dy * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
      },
    },
    {
      target: frameRef,
      eventOptions: { passive: false },
      drag: { filterTaps: true },
    },
  );

  // Report the board's on-screen size (used to decide whether notes are readable).
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => useZoom.setState({ boardPx: el.clientWidth }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // iOS Safari fires its own gesture events for pinch; stop it zooming the page here.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener("gesturestart", stop);
    el.addEventListener("gesturechange", stop);
    return () => {
      el.removeEventListener("gesturestart", stop);
      el.removeEventListener("gesturechange", stop);
    };
  }, []);

  // Expose zoom commands to the header's zoom buttons.
  useEffect(() => {
    useZoom.setState({ scale: 1, maxScale, zoomBy: zoomCenter, reset: () => apply(IDENTITY) });
    // Handlers only read refs + maxScale, so re-registering on maxScale is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxScale]);

  // Keep the selected cell visible when zoomed (e.g. arrow-key navigation).
  // Zoom resets on a new puzzle because the parent keys this component by seed.
  useEffect(
    () =>
      useGame.subscribe((state, prev) => {
        if (state.selected === prev.selected || state.selected === null) return;
        const v = viewRef.current;
        const w = frameRef.current?.clientWidth ?? 0;
        if (v.s <= 1 || w === 0) return;
        const n = state.spec.size;
        const cell = (w / n) * v.s;
        const margin = cell * 0.5;
        const cx = colOf(state.spec, state.selected) * cell + v.x;
        const cy = rowOf(state.spec, state.selected) * cell + v.y;
        let { x, y } = v;
        if (cx < margin) x += margin - cx;
        if (cx + cell > w - margin) x -= cx + cell - (w - margin);
        if (cy < margin) y += margin - cy;
        if (cy + cell > w - margin) y -= cy + cell - (w - margin);
        if (x !== v.x || y !== v.y) apply({ ...v, x, y });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxScale],
  );

  const zoomed = view.s !== 1 || view.x !== 0 || view.y !== 0;

  return (
    <div className="board-square aspect-square">
      <div
        ref={frameRef}
        className="h-full w-full overflow-hidden rounded-md shadow-2xl shadow-black/30"
        style={{ touchAction: "none" }}
        onPointerDownCapture={() => (suppressClick.current = false)}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.stopPropagation();
            e.preventDefault();
            return;
          }
          // Double-tap detection (works for touch and mouse; the tap still selects the cell).
          const prev = lastTap.current;
          if (prev && e.timeStamp - prev.t < 350 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 30) {
            lastTap.current = null;
            toggleBoxZoom(e.clientX, e.clientY);
          } else {
            lastTap.current = { t: e.timeStamp, x: e.clientX, y: e.clientY };
          }
        }}
      >
        {/*
          No `will-change: transform` and no transform at all when not zoomed:
          a promoted layer is rasterised once and then resampled when it sits at a
          fractional device-pixel offset (125 % / 150 % display scaling), which
          blurs 1px gridlines away until something forces a re-raster.
        */}
        <div
          className="h-full w-full origin-top-left"
          style={{ transform: zoomed ? `translate(${view.x}px, ${view.y}px) scale(${view.s})` : undefined }}
        >
          <Board />
        </div>
      </div>
    </div>
  );
}
