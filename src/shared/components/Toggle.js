"use client";

import { cn } from "@/shared/utils/cn";

export default function Toggle({
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  size = "md",
  className,
}) {
  const sizes = {
    sm: { track: "w-8 h-4.5", thumb: "w-3.5 h-3.5", translate: "translate-x-3.5" },
    md: { track: "w-10 h-5",  thumb: "w-4 h-4",     translate: "translate-x-5" },
    lg: { track: "w-12 h-6",  thumb: "w-5 h-5",     translate: "translate-x-6" },
  };

  const handleClick = () => {
    if (!disabled && onChange) onChange(!checked);
  };

  const toggleBtn = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        "relative inline-flex items-center shrink-0 cursor-pointer",
        "transition-colors duration-150 ease-in-out",
        "focus:outline-none",
        sizes[size].track,
        disabled && "cursor-not-allowed",
        !label && !description && className
      )}
      style={{
        background: checked ? "var(--color-primary)" : "var(--color-surface-card)",
        border: `1px solid ${checked ? "var(--color-primary)" : "var(--color-hairline-strong)"}`,
        borderRadius: "9999px",
      }}
    >
      <span
        className={cn(
          "pointer-events-none inline-block",
          "transform transition duration-150 ease-in-out",
          checked ? sizes[size].translate : "translate-x-0.5",
          sizes[size].thumb
        )}
        style={{
          background: "#ffffff",
          borderRadius: "9999px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
        }}
      />
    </button>
  );

  if (!label && !description) {
    return toggleBtn;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {toggleBtn}
      <div className="flex flex-col">
        {label && (
          <span className="text-[14px] font-medium" style={{ color: "var(--color-ink)", fontFamily: "var(--font-mono)" }}>
            {label}
          </span>
        )}
        {description && (
          <span className="text-[13px]" style={{ color: "var(--color-mute)", fontFamily: "var(--font-mono)", lineHeight: 1.5 }}>
            {description}
          </span>
        )}
      </div>
    </div>
  );
}
