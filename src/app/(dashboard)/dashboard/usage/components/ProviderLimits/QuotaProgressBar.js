"use client";

import { cn } from "@/shared/utils/cn";
import { formatResetTime } from "./utils";

// Calculate color based on remaining percentage
const getColorClasses = (remainingPercentage) => {
  if (remainingPercentage > 70) {
    return {
      text: "text-[var(--color-success)]",
      bg: "bg-[var(--color-success)]",
      bgLight: "bg-[rgba(16,185,129,0.12)]",
      border: "border-[rgba(16,185,129,0.25)]",
      dot: "bg-[var(--color-success)]",
    };
  }
  
  if (remainingPercentage >= 30) {
    return {
      text: "text-[var(--color-warning,#f59e0b)]",
      bg: "bg-[var(--color-warning,#f59e0b)]",
      bgLight: "bg-[rgba(245,158,11,0.12)]",
      border: "border-[rgba(245,158,11,0.25)]",
      dot: "bg-[var(--color-warning,#f59e0b)]",
    };
  }
  
  // 0-29% including 0% (out of quota) - show red
  return {
    text: "text-[var(--color-danger)]",
    bg: "bg-[var(--color-danger)]",
    bgLight: "bg-[rgba(239,68,68,0.12)]",
    border: "border-[rgba(239,68,68,0.25)]",
    dot: "bg-[var(--color-danger)]",
  };
};

// Format reset time display
const formatResetTimeDisplay = (resetTime) => {
  if (!resetTime) return null;
  
  try {
    const resetDate = new Date(resetTime);
    const now = new Date();
    const isToday = resetDate.toDateString() === now.toDateString();
    const isTomorrow = resetDate.toDateString() === new Date(now.getTime() + 86400000).toDateString();
    
    const timeStr = resetDate.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    
    if (isToday) return `Today, ${timeStr}`;
    if (isTomorrow) return `Tomorrow, ${timeStr}`;
    
    return resetDate.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return null;
  }
};

export default function QuotaProgressBar({
  percentage = 0,
  label = "",
  used = 0,
  total = 0,
  unlimited = false,
  resetTime = null,
  recurring = true,
}) {
  const colors = getColorClasses(percentage);
  const countdown = formatResetTime(resetTime);
  const resetDisplay = formatResetTimeDisplay(resetTime);

  // recurring defaults true. One-shot packs (e.g. CodeBuddy CN bonus packs)
  // set recurring:false: resetTime is a hard expiry, so word it as "expires".
  const resetWord = recurring ? "Reset" : "Expires";

  // percentage is already remaining percentage (from ProviderLimitCard)
  const remaining = percentage;
  
  return (
    <div className="space-y-2 font-mono">
      {/* Label and percentage */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-[var(--color-ink)]">
          {label}
        </span>
        <div className="inline-flex items-center gap-1.5 px-1.5 py-0.5 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)]">
          <span className={cn("inline-block h-1.5 w-1.5", colors.dot)} />
          <span className={cn("font-bold tabular-nums text-[11px]", colors.text)}>
            {remaining}%
          </span>
        </div>
      </div>

      {/* Progress bar — full width prominent bar */}
      {!unlimited && (
        <div className="w-full h-2.5 bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] overflow-hidden">
          <div
            className={cn("h-full transition-all duration-300", colors.bg)}
            style={{ width: `${Math.max(0, Math.min(remaining, 100))}%` }}
          />
        </div>
      )}

      {/* Usage details and countdown */}
      <div className="flex items-center justify-between text-[11px] text-[var(--color-mute)] tabular-nums">
        <span>
          {used.toLocaleString()} / {total.toLocaleString()} reqs
        </span>
        {countdown !== "-" && (
          <div className="inline-flex items-center gap-1 text-[var(--color-ash)]">
            <span className="font-medium text-[var(--color-ink)]">{resetWord} in {countdown}</span>
          </div>
        )}
      </div>

      {/* Reset time display */}
      {resetDisplay && (
        <div className="text-[11px] text-[var(--color-ash)]">
          {resetWord} at {resetDisplay}
        </div>
      )}
    </div>
  );
}
