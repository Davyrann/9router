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

export function PageSkeleton() {
  return (
    <div className="w-full flex flex-col gap-4 font-mono animate-pulse">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--color-hairline)]">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-5 w-32 sm:w-48" />
        </div>
        <Skeleton className="h-8 w-24" style={{ borderRadius: "4px" }} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}

export default function Loading({ type = "spinner", ...props }) {
  switch (type) {
    case "page":     return <PageLoading {...props} />;
    case "skeleton": return <Skeleton {...props} />;
    case "card":     return <CardSkeleton {...props} />;
    case "page-skeleton": return <PageSkeleton {...props} />;
    default:         return <Spinner {...props} />;
  }
}
