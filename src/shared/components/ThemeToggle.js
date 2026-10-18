"use client";

import { useTheme } from "@/shared/hooks/useTheme";
import { cn } from "@/shared/utils/cn";

export default function ThemeToggle({ className }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "flex items-center justify-center h-8 w-8 border border-[var(--color-hairline)] bg-transparent",
        "text-[var(--color-mute)] hover:text-[var(--color-ink)] hover:border-[var(--color-hairline-strong)]",
        "transition-colors text-[13px] font-medium",
        className
      )}
      style={{ borderRadius: "4px", fontFamily: "var(--font-mono)" }}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      <span className="material-symbols-outlined text-[16px]">
        {isDark ? "light_mode" : "dark_mode"}
      </span>
    </button>
  );
}
