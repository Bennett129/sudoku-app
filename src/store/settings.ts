import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";

export { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";

interface SettingsStore extends Settings {
  /** When the player last changed a setting (ms); 0 = never. Used for sync. */
  updatedAt: number;
  update: (patch: Partial<Settings>) => void;
  /** Take settings from the account (sync) without counting it as a local change. */
  applyRemote: (settings: Settings, updatedAt: number) => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      updatedAt: 0,
      update: (patch) => set({ ...patch, updatedAt: Date.now() }),
      applyRemote: (settings, updatedAt) => set({ ...settings, updatedAt }),
    }),
    {
      name: "sudoku-settings",
      version: 1,
      // Rehydrated on the client after mount (see <ClientBoot>) to avoid
      // server/client markup mismatches.
      skipHydration: true,
    },
  ),
);
