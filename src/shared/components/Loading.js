"use client";

import { cn } from "@/shared/utils/cn";

export function Spinner({ size = "md", className }) {
  const sizes = {
    sm: "text-[16px]",
    md: "text-[20px]",
    lg: "text-[24px]",
    xl: "text-[32px]",
  };

  return (
    <span
      className={cn(
        "material-symbols-outlined animate-spin text-[var(--color-ink)]",
        sizes[size],
        className
      )}
    >
      progress_activity
    </span>
  );
}

export function PageLoading({ message = "Loading..." }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--color-canvas)]">
      <Spinner size="xl" />
      <p className="mt-4 text-[14px] text-[var(--color-mute)]" style={{ fontFamily: "var(--font-mono)" }}>
        {message}
      </p>
    </div>
  );
}

export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn(
        "animate-pulse bg-[var(--color-surface-card)]",
        className
      )}
      style={{ borderRadius: "0" }}
      {...props}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="p-6 border border-[var(--color-hairline)] bg-[var(--color-canvas)]">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8" />
      </div>
      <Skeleton className="h-8 w-16 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export default function Loading({ type = "spinner", ...props }) {
  switch (type) {
    case "page":     return <PageLoading {...props} />;
    case "skeleton": return <Skeleton {...props} />;
    case "card":     return <CardSkeleton {...props} />;
    default:         return <Spinner {...props} />;
  }
}
