"use client";

import { cn } from "@/shared/utils/cn";

export default function Input({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  hint,
  icon,
  disabled = false,
  required = false,
  className,
  inputClassName,
  ...props
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label className="text-[14px] font-bold text-[var(--color-ink)]" style={{ fontFamily: "var(--font-mono)" }}>
          {label}
          {required && <span className="text-[var(--color-danger)] ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[var(--color-ash)]">
            <span className="material-symbols-outlined text-[16px]">{icon}</span>
          </div>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={cn(
            "w-full py-2 px-3 text-[16px] text-[var(--color-ink)] bg-[var(--color-surface-soft)]",
            "border border-[var(--color-hairline)] placeholder-[var(--color-ash)]",
            "focus:outline-none focus:border-[var(--color-hairline-strong)]",
            "transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed",
            icon && "pl-9",
            error && "border-[var(--color-danger)]",
            inputClassName
          )}
          style={{
            borderRadius: "4px",
            fontFamily: "var(--font-mono)",
            ...(inputClassName?.includes("h-") ? {} : { height: "40px" }),
          }}
          {...props}
        />
      </div>
      {error && (
        <p className="text-[13px] text-[var(--color-danger)]" style={{ fontFamily: "var(--font-mono)" }}>
          [x] {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-[13px] text-[var(--color-mute)]" style={{ fontFamily: "var(--font-mono)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
