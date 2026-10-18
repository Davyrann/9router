"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  primary:   "bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-surface-card)] disabled:text-[var(--color-ash)]",
  secondary: "bg-[var(--color-canvas)] text-[var(--color-ink)] border border-[var(--color-hairline-strong)] hover:bg-[var(--color-surface-soft)] disabled:opacity-50",
  outline:   "bg-[var(--color-canvas)] text-[var(--color-ink)] border border-[var(--color-hairline)] hover:bg-[var(--color-surface-soft)] hover:border-[var(--color-hairline-strong)]",
  ghost:     "bg-transparent text-[var(--color-mute)] hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-ink)]",
  danger:    "bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger-hover)] disabled:opacity-50",
  success:   "bg-[var(--color-success)] text-white hover:opacity-90 disabled:opacity-50",
};

const sizes = {
  xs: "h-6 px-2.5 text-[11px] rounded-[4px] gap-1",
  sm: "h-8 px-3.5 text-[13px] rounded-[4px] gap-1.5",
  md: "h-9 px-5   text-[15px] rounded-[4px] gap-2",
  lg: "h-11 px-6  text-[16px] rounded-[4px] gap-2",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  className,
  ...props
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors duration-100 cursor-pointer",
        "active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)] focus-visible:ring-offset-1",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className={cn("material-symbols-outlined animate-spin", size === "xs" ? "text-[14px]" : "text-[16px]")}>progress_activity</span>
      ) : icon ? (
        <span className={cn("material-symbols-outlined", size === "xs" ? "text-[14px]" : "text-[18px]")}>{icon}</span>
      ) : null}
      {children}
      {iconRight && !loading && (
        <span className={cn("material-symbols-outlined", size === "xs" ? "text-[14px]" : "text-[18px]")}>{iconRight}</span>
      )}
    </button>
  );
}
