"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { THEME_CONFIG } from "@/shared/constants/config";

// Two modes, both dark-based: the current solid theme, and a glassmorphism
// variant that keeps the exact same palette while surfaces turn translucent.
export const THEME_IDS = ["dark", "glass"];

const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: "dark",

      setTheme: (theme) => {
        const id = THEME_IDS.includes(theme) ? theme : "dark";
        set({ theme: id });
        applyTheme(id);
      },

      toggleTheme: () => {
        const next = get().theme === "glass" ? "dark" : "glass";
        set({ theme: next });
        applyTheme(next);
      },

      initTheme: () => {
        applyTheme(get().theme || "dark");
      },
    }),
    {
      name: THEME_CONFIG.storageKey,
    },
  ),
);

// Apply theme to document. "dark" always stays on (both modes are dark);
// "glass" adds the frosted-token overrides in globals.css.
function applyTheme(theme) {
  if (typeof window === "undefined") return;

  const root = document.documentElement;
  root.classList.add("dark");
  root.classList.toggle("glass", theme === "glass");
}

export default useThemeStore;
