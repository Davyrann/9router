"use client";

import PropTypes from "prop-types";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

function TrendIndicator({ trend, label, suffix = "" }) {
  if (!trend) {
    return <span className="text-[11px] font-mono text-[var(--color-ash)]">No prior data</span>;
  }

  const isUp = trend.direction === "up";
  const isDown = trend.direction === "down";

  return (
    <div className="flex items-center gap-1 text-[11px] font-mono leading-none">
      <span
        className={
          isUp
            ? "text-[var(--color-success)] font-bold"
            : isDown
              ? "text-[var(--color-danger)] font-bold"
              : "text-[var(--color-mute)]"
        }
      >
        {isUp ? "↑" : isDown ? "↓" : "·"} {isUp ? "+" : isDown ? "-" : ""}{trend.pct}%{suffix}
      </span>
      {label && <span className="text-[var(--color-ash)]">{label}</span>}
    </div>
  );
}

export default function OverviewCards({ stats }) {
  const trends = stats?.trends;
  const prevLabel = trends?.prevLabel || "";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3 font-mono">
      {/* 1. Total Requests */}
      <div className="p-3 sm:p-4 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] rounded flex flex-col justify-between gap-2">
        <span className="text-[11px] sm:text-[12px] text-[var(--color-mute)] uppercase tracking-wider font-medium">
          Total Requests
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-[20px] sm:text-[24px] font-bold text-[var(--color-ink)] leading-none truncate" title={fmt(stats.totalRequests)}>
            {fmt(stats.totalRequests)}
          </span>
          <TrendIndicator trend={trends?.requests} label={prevLabel} />
        </div>
      </div>

      {/* 2. Total Input Tokens */}
      <div className="p-3 sm:p-4 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] rounded flex flex-col justify-between gap-2">
        <span className="text-[11px] sm:text-[12px] text-[var(--color-mute)] uppercase tracking-wider font-medium">
          Input Tokens
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-[20px] sm:text-[24px] font-bold text-[var(--color-primary)] leading-none truncate" title={fmt(stats.totalPromptTokens)}>
            {fmt(stats.totalPromptTokens)}
          </span>
          <TrendIndicator trend={trends?.promptTokens} label={prevLabel} />
        </div>
      </div>

      {/* 3. Cached Tokens */}
      <div className="p-3 sm:p-4 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] rounded flex flex-col justify-between gap-2">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] sm:text-[12px] text-[var(--color-mute)] uppercase tracking-wider font-medium">
            Cached Tokens
          </span>
          {trends?.cacheRate > 0 && (
            <span className="text-[10px] text-[var(--color-accent)] font-bold">
              {trends.cacheRate}% hit
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[20px] sm:text-[24px] font-bold text-[var(--color-accent)] leading-none truncate" title={fmt(stats.totalCachedTokens)}>
            {fmt(stats.totalCachedTokens)}
          </span>
          <TrendIndicator trend={trends?.cachedTokens} label={prevLabel} />
        </div>
      </div>

      {/* 4. Output Tokens */}
      <div className="p-3 sm:p-4 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] rounded flex flex-col justify-between gap-2">
        <span className="text-[11px] sm:text-[12px] text-[var(--color-mute)] uppercase tracking-wider font-medium">
          Output Tokens
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-[20px] sm:text-[24px] font-bold text-[var(--color-success)] leading-none truncate" title={fmt(stats.totalCompletionTokens)}>
            {fmt(stats.totalCompletionTokens)}
          </span>
          <TrendIndicator trend={trends?.completionTokens} label={prevLabel} />
        </div>
      </div>

      {/* 5. Est. Cost */}
      <div className="col-span-2 sm:col-span-2 lg:col-span-1 p-3 sm:p-4 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] rounded flex flex-col justify-between gap-2">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] sm:text-[12px] text-[var(--color-mute)] uppercase tracking-wider font-medium">
            Est. Cost
          </span>
          <span className="text-[10px] text-[var(--color-ash)]">est. rate</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[20px] sm:text-[24px] font-bold text-[var(--color-warning)] leading-none truncate" title={`~${fmtCost(stats.totalCost)}`}>
            ~{fmtCost(stats.totalCost)}
          </span>
          <TrendIndicator trend={trends?.cost} label={prevLabel} />
        </div>
      </div>
    </div>
  );
}

OverviewCards.propTypes = {
  stats: PropTypes.object.isRequired,
};
