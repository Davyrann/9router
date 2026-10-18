"use client";

import { cn } from "@/shared/utils/cn";

// ASCII marker for each variant
const markers = {
  default:  "",
  primary:  "",
  success:  "[+]",
  warning:  "[!]",
  error:    "[x]",
  info:     "[i]",
};

const variantStyles = {
  default: "bg-[var(--color-surface-card)] text-[var(--color-mute)] border border-[var(--color-hairline)]",
  primary: "bg-[var(--color-ink)] text-[var(--color-on-dark)]",
  success: "bg-transparent text-[var(--color-success)] border border-[rgba(48,209,88,0.4)]",
  warning: "bg-transparent text-[var(--color-warning)] border border-[rgba(255,159,10,0.4)]",
  error:   "bg-transparent text-[var(--color-danger)] border border-[rgba(255,59,48,0.4)]",
  info:    "bg-transparent text-[var(--color-accent)] border border-[rgba(0,122,255,0.3)]",
};

const sizes = {
  sm: "px-1.5 py-0 text-[12px]",
  md: "px-2   py-0.5 text-[13px]",
  lg: "px-2.5 py-1   text-[14px]",
};

export default function Badge({
  children,
  variant = "default",
  size = "md",
  dot = false,
  icon,
  className,
}) {
  const marker = markers[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium leading-snug",
        variantStyles[variant],
        sizes[size],
        className
      )}
      style={{ borderRadius: "4px", fontFamily: "var(--font-mono)" }}
    >
      {dot && marker && <span className="shrink-0">{marker}</span>}
      {icon && <span className="material-symbols-outlined text-[13px]">{icon}</span>}
      {children}
    </span>
  );
}
