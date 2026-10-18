"use client";

import { cn } from "@/shared/utils/cn";

export default function Card({
  children,
  title,
  subtitle,
  icon,
  action,
  padding = "md",
  hover = false,
  elev = false,
  className,
  ...props
}) {
  const paddings = {
    none: "",
    xs:   "p-2.5 sm:p-3",
    sm:   "p-3.5 sm:p-4",
    md:   "p-4 sm:p-6",
    lg:   "p-5 sm:p-8",
  };

  return (
    <div
      className={cn(
        "bg-[var(--color-canvas)] border border-[var(--color-hairline)]",
        "rounded-none",
        hover && "hover:border-[var(--color-hairline-strong)] hover:bg-[var(--color-surface-soft)] transition-colors cursor-pointer",
        paddings[padding],
        className
      )}
      {...props}
    >
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {icon && (
              <span className="material-symbols-outlined text-[18px] text-[var(--color-mute)]">{icon}</span>
            )}
            <div>
              {title && (
                <h3 className="text-[16px] font-bold text-[var(--color-ink)] leading-tight">{title}</h3>
              )}
              {subtitle && (
                <p className="text-[14px] text-[var(--color-mute)] leading-snug mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

Card.Section = function CardSection({ children, className, ...props }) {
  return (
    <div
      className={cn(
        "p-4 border border-[var(--color-hairline)]",
        "bg-[var(--color-surface-soft)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

Card.Row = function CardRow({ children, className, ...props }) {
  return (
    <div
      className={cn(
        "py-2 px-0",
        "border-b border-[var(--color-hairline)] last:border-b-0",
        "hover:bg-[var(--color-surface-soft)] transition-colors",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

Card.ListItem = function CardListItem({ children, actions, className, ...props }) {
  return (
    <div
      className={cn(
        "group flex items-center justify-between py-2",
        "border-b border-[var(--color-hairline)] last:border-b-0",
        "hover:bg-[var(--color-surface-soft)] transition-colors",
        className
      )}
      {...props}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {actions && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {actions}
        </div>
      )}
    </div>
  );
};
