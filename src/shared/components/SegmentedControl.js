"use client";

import { cn } from "@/shared/utils/cn";

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = "md",
  className,
}) {
  const sizes = {
    sm: "h-7 text-[12px] px-2.5 sm:px-3",
    md: "h-8 text-[13px] px-3 sm:px-4",
    lg: "h-10 text-[14px] px-4 sm:px-5",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center p-0.5 rounded border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] overflow-x-auto scroll-thin-x font-mono",
        className
      )}
      style={{ borderRadius: "4px" }}
    >
      {options.map((option) => {
        const isSelected = value === option.value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "shrink-0 font-medium transition-colors cursor-pointer flex items-center justify-center whitespace-nowrap",
              sizes[size],
              isSelected
                ? "bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold shadow-none"
                : "text-[var(--color-mute)] hover:text-[var(--color-ink)] bg-transparent"
            )}
            style={{ borderRadius: "3px" }}
          >
            {option.icon && (
              <span className="material-symbols-outlined text-[14px] mr-1.5">
                {option.icon}
              </span>
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
