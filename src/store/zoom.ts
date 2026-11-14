import { create } from "zustand";

/**
 * Bridge so zoom buttons can live outside the board (they used to overlay
 * and cover cells). <ZoomableBoard> registers the real handlers on mount.
 */
interface ZoomStore {
  scale: number;
  /** Unzoomed board width in CSS px (kept current by a ResizeObserver). */
  boardPx: number;
  maxScale: number;
  zoomBy: (factor: number) => void;
  reset: () => void;
}

export const useZoom = create<ZoomStore>()(() => ({
  scale: 1,
  boardPx: 0,
  maxScale: 2.5,
  zoomBy: () => {},
  reset: () => {},
}));
