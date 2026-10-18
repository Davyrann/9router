"use client";

import { cn } from "@/shared/utils/cn";

export default function Select({
  label,
  options = [],
  value,
  onChange,
  placeholder = "Select an option",
  error,
  hint,
  disabled = false,
  required = false,
  className,
  selectClassName,
  ...props
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label className="text-[14px] font-bold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-mono)" }}>
          {label}
          {required && <span style={{ color: "var(--color-danger)" }} className="ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={cn(
            "w-full py-2 px-3 pr-10 appearance-none",
            "text-[16px]",
            "border border-[var(--color-hairline)] bg-[var(--color-surface-soft)]",
            "focus:outline-none focus:border-[var(--color-hairline-strong)]",
            "transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed",
            error && "border-[var(--color-danger)]",
            selectClassName
          )}
          style={{
            borderRadius: "4px",
            fontFamily: "var(--font-mono)",
            height: "40px",
            color: "var(--color-ink)",
          }}
          {...props}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none" style={{ color: "var(--color-ash)" }}>
          <span className="material-symbols-outlined text-[16px]">expand_more</span>
        </div>
      </div>
      {error && (
        <p className="text-[13px]" style={{ color: "var(--color-danger)", fontFamily: "var(--font-mono)", lineHeight: 1.5 }}>
          [x] {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-[13px]" style={{ color: "var(--color-mute)", fontFamily: "var(--font-mono)", lineHeight: 1.5 }}>
          {hint}
        </p>
      )}
    </div>
  );
}
