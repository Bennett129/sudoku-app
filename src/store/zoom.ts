import { create } from "zustand";

/**
 * Bridge so zoom buttons can live outside the board (they used to overlay
 * and cover cells). <ZoomableBoard> registers the real handlers on mount.
 */
interface ZoomStore {
  scale: number;
  maxScale: number;
  zoomBy: (factor: number) => void;
  reset: () => void;
}

export const useZoom = create<ZoomStore>()(() => ({
  scale: 1,
  maxScale: 2.5,
  zoomBy: () => {},
  reset: () => {},
}));
