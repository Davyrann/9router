"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/utils/cn";
import useThemeStore from "@/store/themeStore";

const MODES = [
  { id: "dark", icon: "dark_mode", label: "Dark" },
  { id: "glass", icon: "blur_on", label: "Glass" },
];

/**
 * Header button that switches the display theme.
 *
 * Sits next to the grid menu because theme is a preference people flip often,
 * unlike the account actions buried in that menu. The icon shows the current
 * mode, and the choice survives a reload (persisted by the store and re-applied
 * by the pre-paint script).
 */
export default function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onEscape = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const active = MODES.find((m) => m.id === theme) || MODES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center p-2 rounded-[10px] text-text-muted hover:text-text-main hover:bg-surface-2 transition-all"
        title="Theme"
        aria-label="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="material-symbols-outlined">{active.icon}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-44 bg-surface border border-border-subtle rounded-xl shadow-[var(--shadow-elev)] z-50 slide-in-top overflow-hidden py-1"
        >
          <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-subtle">
            Theme
          </p>
          {MODES.map((m) => {
            const isActive = m.id === theme;
            return (
              <button
                key={m.id}
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  setTheme(m.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors",
                  isActive
                    ? "text-primary bg-primary/10 font-medium"
                    : "text-text-main hover:bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "material-symbols-outlined text-[20px]",
                    isActive ? "" : "text-text-muted",
                  )}
                >
                  {m.icon}
                </span>
                <span className="flex-1 text-left">{m.label}</span>
                {isActive && (
                  <span className="material-symbols-outlined text-[18px]">check</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
