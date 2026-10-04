/** Long-operation banner with cancel / keep-running controls, restyled per theme.
 *
 * Three ways out of a long operation, because a centred modal that only says
 * "please wait" strands the operator on a dead page:
 *
 *   cancel   stop waiting; the operation is told to abandon its work
 *   (×)
 *   background  shrink to a small fixed chip in the corner and let the operator
 *            keep navigating — a 10 000-proxy import is not a reason to lose
 *            the dashboard
 *   minimize (–)
 *   close      the chip expands again without cancelling anything
 *
 * All three are optional props; a caller that passes none gets the previous
 * look-and-feel with the same layout. `onCancel` and `onBackground` are
 * advisory: the card hides its own overlay immediately so the UI never waits on
 * a slow abort handler, and the caller decides what actually stops.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

/** Small spinning glyph; kept local so the card has no icon-font dependency. */
function Ring({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("animate-spin shrink-0", className)}
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Square-cornered chip sitting over content: reads as a tool, not a dialog. */
function IconButton({ label, glyph, onClick, tone = "default", className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex size-7 items-center justify-center rounded-md transition-colors",
        tone === "danger"
          ? "text-red-500 hover:bg-red-500/15"
          : "text-text-muted hover:bg-surface-2 hover:text-text-main",
        className
      )}
    >
      <span className="material-symbols-outlined text-[16px]">{glyph}</span>
    </button>
  );
}

/** The collapsed chip: title + percent + expand + cancel. Never blocks the page. */
function BackgroundChip({ title, message, percent, onExpand, onCancel, canCancel, canBackground }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[65]">
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "pointer-events-auto flex items-center gap-2.5 rounded-xl border px-3 py-2",
          // panel + hairline + drop shadow, on the glass tokens when it is active
          "border-white/10 bg-surface/90 shadow-[var(--shadow-elev)] backdrop-blur-md",
          "dark:border-white/10"
        )}
      >
        <Ring className="size-4 text-primary" />
        <div className="min-w-0 max-w-[46vw]">
          <p className="truncate text-xs font-medium text-text-main">{title || "Working"}</p>
          {message ? <p className="truncate text-[11px] text-text-muted">{message}</p> : null}
        </div>
        {percent !== null ? (
          <span className="shrink-0 font-mono text-[11px] text-text-muted">{percent}%</span>
        ) : null}
        {canBackground ? (
          <IconButton label="Keep running in background" glyph="expand_less" onClick={onExpand} />
        ) : null}
        {canCancel ? <IconButton label="Cancel" glyph="close" onClick={onCancel} tone="danger" /> : null}
      </div>
    </div>
  );
}

/** Framed card: accent rail on the left that sweeps with the percent. */
function Panel({ title, message, section, percent }) {
  return (
    <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-[var(--shadow-elev)] mx-4">
      {/* Accent rail: a full-height strip on the left that fills with progress. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary/70 via-primary/45 to-primary/20",
          percent !== null && "transition-opacity"
        )}
      />
      <div className="pl-5 pr-4 py-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Ring className="size-5" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate text-sm font-semibold text-text-main">{title || "Working"}</p>
            {message ? (
              <p className="mt-0.5 truncate text-xs text-text-muted">{message}</p>
            ) : null}
          </div>
          {percent !== null ? (
            <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
              {percent}%
            </span>
          ) : null}
        </div>

        {section ? (
          <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-text-muted">
            <span className="material-symbols-outlined text-[13px] shrink-0">info</span>
            <span className="truncate">{section}</span>
          </p>
        ) : null}

        {percent !== null ? (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Two control buttons under the panel; only rendered when either is offered. */
function Controls({ canCancel, canBackground, onCancel, onBackground }) {
  if (!canCancel && !canBackground) return null;
  return (
    <div className="mt-3 flex items-center justify-center gap-2">
      {canCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/20"
        >
          <span className="material-symbols-outlined text-[15px]">close</span>
          Cancel
        </button>
      ) : null}
      {canBackground ? (
        <button
          type="button"
          onClick={onBackground}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-text-main transition-colors hover:bg-surface-2"
        >
          <span className="material-symbols-outlined text-[15px]">vertical_align_bottom</span>
          Run in background
        </button>
      ) : null}
    </div>
  );
}

export default function LongTaskBanner({
  title,
  message,
  section,
  progress = null,
  fixed = true,
  className,
  onCancel = null,
  onBackground = null,
  canExpand = false,
  // Renders only the collapsed corner chip. The TaskDock uses this for every
  // task already waiting behind the newest one.
  chipOnly = false,
  // Collapsed-chip reopen hook: the dock owns that state, so it flips back
  // itself instead of expanding inside this component.
  onExpand = null,
}) {
  const percent =
    typeof progress === "number" && Number.isFinite(progress)
      ? Math.min(100, Math.max(0, Math.round(progress <= 1 ? progress * 100 : progress)))
      : null;
  const [backgrounded, setBackgrounded] = useState(false);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  // Escape cancels, but only while the banner still covers the page: a chip in the
  // corner must not swallow a keystroke meant for the form underneath.
  useEffect(() => {
    if (backgrounded || !onCancel) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") cancelRef.current?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [backgrounded, onCancel]);

  const handleCancel = () => {
    setBackgrounded(false);
    onCancel?.();
  };
  // A chip rendered without the rest of the banner has nothing to expand back
  // to, so cancelling there only forwards the caller's own onCancel.
  const handleChipCancel = () => {
    onCancel?.();
  };
  const handleBackground = () => {
    setBackgrounded(true);
    onBackground?.();
  };

  const canCancel = typeof onCancel === "function";
  const canBackground = typeof onBackground === "function";

  if (chipOnly) {
    return (
      <BackgroundChip
        title={title}
        message={message}
        percent={percent}
        canCancel={canCancel}
        canBackground={canExpand && typeof onExpand === "function"}
        onExpand={onExpand || undefined}
        onCancel={handleChipCancel}
      />
    );
  }

  if (backgrounded) {
    return (
      <BackgroundChip
        title={title}
        message={message}
        percent={percent}
        canCancel={canCancel}
        canBackground={canExpand && canBackground}
        onExpand={() => setBackgrounded(false)}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center bg-black/55 backdrop-blur-[3px]",
        fixed ? "fixed inset-0 z-[70]" : "absolute inset-0 z-10 rounded-[10px]",
        className
      )}
    >
      <div className="flex w-full max-w-sm flex-col items-center">
        <Panel title={title} message={message} section={section} percent={percent} />
        <Controls
          canCancel={canCancel}
          canBackground={canBackground}
          onCancel={handleCancel}
          onBackground={handleBackground}
        />
      </div>
    </div>
  );
}

LongTaskBanner.propTypes = {
  title: PropTypes.string,
  message: PropTypes.string,
  section: PropTypes.string,
  progress: PropTypes.number,
  fixed: PropTypes.bool,
  className: PropTypes.string,
  onCancel: PropTypes.func,
  onBackground: PropTypes.func,
  /** Lets the collapsed chip reopen the full banner. */
  canExpand: PropTypes.bool,
  /** Render only the collapsed corner chip. */
  chipOnly: PropTypes.bool,
  /** Collapsed-chip reopen hook (chip mode). */
  onExpand: PropTypes.func,
};

export { LongTaskBanner };