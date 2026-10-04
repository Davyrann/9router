"use client";

import { useEffect, useState } from "react";
import { cn } from "@/shared/utils/cn";
import LongTaskBanner from "./LongTaskBanner";

// Spinner loading
export function Spinner({ size = "md", className }) {
  const sizes = {
    sm: "size-4",
    md: "size-6",
    lg: "size-8",
    xl: "size-12",
  };

  return (
    <span
      className={cn(
        "material-symbols-outlined animate-spin text-brand-500",
        sizes[size],
        className
      )}
    >
      progress_activity
    </span>
  );
}

// Full page loading
export function PageLoading({ message = "Loading..." }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg">
      <Spinner size="xl" />
      <p className="mt-4 text-text-muted">{message}</p>
    </div>
  );
}

// Centered busy overlay for long operations (e.g. backup export/import).
// Same contract as before — message, progress, fixed/absolute — now rendered by
// LongTaskBanner so every banner in the app shares one look. Pass onCancel to
// also offer Cancel and the minimize-to-corner control; without it the overlay
// is purely informational, exactly as callers have always used it.
export function CenterLoading({ message, progress = null, fixed = true, className, onCancel }) {
  return (
    <LongTaskBanner
      title={message || "Working"}
      message={null}
      progress={typeof progress === "number" ? progress : null}
      fixed={fixed}
      className={className}
      onCancel={onCancel}
      canExpand={false}
    />
  );
}

export const BusyOverlay = CenterLoading;

// Blocking progress card for long operations (backup export/import, bulk
// imports, bulk adds). Callers keep passing { title, message, section, progress };
// the presentation lives in LongTaskBanner so every banner shares the same
// framed, theme-aware look.
//
// A caller that passes onCancel also gets Cancel (Esc works too) and a
// minimize control that shrinks the card to a corner chip without losing it —
// both are advisory: the card hides itself at once and the caller decides what
// actually stops. Callers without onCancel see the same informational card they
// always had, so no existing flow changed behaviour by upgrading.
export function ProgressCard({ title, message, section, progress = null, fixed = true, className, onCancel, onBackground }) {
  const [minimized, setMinimized] = useState(false);
  const canCancel = typeof onCancel === "function";

  // A new task (different title) starts un-minimized; reusing one card for a
  // second operation must not inherit the first one's collapsed state.
  useEffect(() => {
    setMinimized(false);
  }, [title]);

  if (!canCancel) {
    return (
      <LongTaskBanner
        title={title}
        message={message}
        section={section}
        progress={progress ?? null}
        fixed={fixed}
        className={className}
      />
    );
  }

  if (minimized) {
    return (
      <div className="pointer-events-none fixed bottom-4 right-4 z-[65]">
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-border-subtle bg-surface/90 px-3 py-2 shadow-[var(--shadow-elev)] backdrop-blur-md">
          <Spinner size="sm" />
          <span className="max-w-[40vw] truncate text-xs text-text-main">{title || "Working"}</span>
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="text-text-muted hover:text-text-main"
            title="Show banner"
            aria-label="Show banner"
          >
            <span className="material-symbols-outlined text-[16px]">expand_less</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMinimized(false);
              onCancel();
            }}
            className="text-red-500 hover:text-red-400"
            title="Cancel"
            aria-label="Cancel"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <LongTaskBanner
      title={title}
      message={message}
      section={section}
      progress={progress ?? null}
      fixed={fixed}
      className={className}
      onCancel={() => {
        setMinimized(true);
        onCancel();
      }}
      onBackground={typeof onBackground === "function" ? onBackground : () => setMinimized(true)}
      canExpand
    />
  );
}

// Skeleton loading
export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[10px] bg-surface-2",
        className
      )}
      {...props}
    />
  );
}

// Card skeleton
export function CardSkeleton() {
  return (
    <div className="p-6 rounded-[14px] border border-border-subtle bg-surface shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="size-10 rounded-[10px]" />
      </div>
      <Skeleton className="h-8 w-16 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export default function Loading({ type = "spinner", ...props }) {
  switch (type) {
    case "page":
      return <PageLoading {...props} />;
    case "skeleton":
      return <Skeleton {...props} />;
    case "card":
      return <CardSkeleton {...props} />;
    default:
      return <Spinner {...props} />;
  }
}
