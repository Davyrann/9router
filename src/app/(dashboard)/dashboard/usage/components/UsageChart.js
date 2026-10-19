"use client";

import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useTimezone } from "@/shared/hooks/useTimezone";

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};

const fmtCost = (n) => `$${(n || 0).toFixed(4)}`;
const fmtRequests = (n) => String(n || 0);

const VIEW_MODES = [
  { value: "tokens", label: "Tokens" },
  { value: "requests", label: "Requests" },
  { value: "cost", label: "Cost" },
];

const VIEW_CONFIG = {
  tokens:   { dataKey: "tokens",   color: "#6366f1", gradId: "gradTokens",   formatter: fmtTokens,   label: "Tokens" },
  requests: { dataKey: "requests", color: "#14b8a6", gradId: "gradRequests", formatter: fmtRequests, label: "Requests" },
  cost:     { dataKey: "cost",     color: "#f59e0b", gradId: "gradCost",     formatter: fmtCost,     label: "Cost" },
};

export default function UsageChart({ period = "7d" }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("tokens");
  const { timeZone } = useTimezone();
  // "" means "follow browser" — resolve it to an explicit IANA id, otherwise a
  // remote server would bucket by ITS machine timezone instead.
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/usage/chart?period=${period}&tz=${encodeURIComponent(tz)}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error("Failed to fetch chart data:", e);
    } finally {
      setLoading(false);
    }
  }, [period, tz]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const cfg = VIEW_CONFIG[viewMode];
  const hasData = data.some((d) => (d[cfg.dataKey] || 0) > 0);
  const totalVal = data.reduce((acc, d) => acc + (d[cfg.dataKey] || 0), 0);

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-none border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3.5 sm:p-4 font-mono">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1 border-b border-[var(--color-hairline)]">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-0.5">
            {VIEW_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setViewMode(m.value)}
                className={`px-3 py-1 rounded-[4px] text-[12px] font-medium transition-all duration-150 cursor-pointer ${
                  viewMode === m.value
                    ? "bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold"
                    : "text-[var(--color-mute)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {hasData && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[12px]">
            <span className="text-[var(--color-ash)]">Period Total:</span>
            <span className="font-bold text-[var(--color-ink)]" style={{ color: cfg.color }}>
              {cfg.formatter(totalVal)}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-52 flex items-center justify-center text-[var(--color-mute)] text-xs gap-2">
          <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
          Loading timeline…
        </div>
      ) : !hasData ? (
        <div className="h-52 flex items-center justify-center text-[var(--color-mute)] text-xs">
          No activity recorded for this period
        </div>
      ) : (
        <div className="w-full pt-2">
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradRequests" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hairline)" strokeOpacity={0.6} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--color-mute)", fontFamily: "monospace" }}
                tickLine={false}
                axisLine={{ stroke: "var(--color-hairline)" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-mute)", fontFamily: "monospace" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={cfg.formatter}
                width={52}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0];
                  return (
                    <div className="rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-3 py-2 font-mono text-xs">
                      <div className="text-[var(--color-ash)] text-[10px] mb-1">{item.payload?.label}</div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                        <span className="text-[var(--color-mute)]">{cfg.label}:</span>
                        <span className="font-bold text-[var(--color-ink)]">{cfg.formatter(item.value)}</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey={cfg.dataKey}
                stroke={cfg.color}
                strokeWidth={2}
                fill={`url(#${cfg.gradId})`}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--color-canvas)", strokeWidth: 2, fill: cfg.color }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

UsageChart.propTypes = {
  period: PropTypes.string,
};
