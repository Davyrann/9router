"use client";

import { useState, useMemo } from "react";
import PropTypes from "prop-types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const COLORS = ["#6366f1", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6"];

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};

const truncate = (s, max = 22) => (s && s.length > max ? s.slice(0, max) + "…" : s || "");

export default function TopModelsChart({ byModel }) {
  const [viewMode, setViewMode] = useState("tokens");

  const chartData = useMemo(() => {
    if (!byModel) return [];
    return Object.values(byModel)
      .map((data) => ({
        fullName: data.rawModel || "Unknown",
        name: truncate(data.rawModel || "Unknown"),
        tokens: (data.promptTokens || 0) + (data.completionTokens || 0),
        requests: data.requests || 0,
      }))
      .filter((d) => d[viewMode] > 0)
      .sort((a, b) => b[viewMode] - a[viewMode])
      .slice(0, 5);
  }, [byModel, viewMode]);

  const fmt = viewMode === "tokens" ? fmtTokens : String;
  const label = viewMode === "tokens" ? "Tokens" : "Requests";

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-none border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3.5 sm:p-4 font-mono">
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-[var(--color-hairline)]">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-[var(--color-accent,#8b5cf6)]">neurology</span>
          <span className="text-xs font-bold text-[var(--color-ink)] uppercase tracking-wider">Top Models</span>
        </div>
        <div className="inline-flex items-center gap-1 border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-0.5">
          <button
            onClick={() => setViewMode("tokens")}
            className={`px-2.5 py-0.5 rounded-[4px] text-[11px] font-medium transition-all duration-150 cursor-pointer ${
              viewMode === "tokens"
                ? "bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold"
                : "text-[var(--color-mute)] hover:text-[var(--color-ink)]"
            }`}
          >
            Tokens
          </button>
          <button
            onClick={() => setViewMode("requests")}
            className={`px-2.5 py-0.5 rounded-[4px] text-[11px] font-medium transition-all duration-150 cursor-pointer ${
              viewMode === "requests"
                ? "bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold"
                : "text-[var(--color-mute)] hover:text-[var(--color-ink)]"
            }`}
          >
            Requests
          </button>
        </div>
      </div>

      {!chartData.length ? (
        <div className="h-44 flex items-center justify-center text-[var(--color-mute)] text-xs">No model usage recorded</div>
      ) : (
        <div className="w-full pt-1">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 6, right: 40, left: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hairline)" strokeOpacity={0.6} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: "var(--color-mute)", fontFamily: "monospace" }}
                tickLine={false}
                axisLine={{ stroke: "var(--color-hairline)" }}
                tickFormatter={fmt}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 10, fill: "var(--color-ink)", fontFamily: "monospace" }}
                tickLine={false}
                axisLine={false}
                width={100}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0];
                  return (
                    <div className="rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-3 py-2 font-mono text-xs">
                      <div className="font-bold text-[var(--color-ink)] mb-0.5 break-all">{item.payload?.fullName || item.payload?.name}</div>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-[var(--color-mute)]">{label}:</span>
                        <span className="font-bold text-[var(--color-primary)]">{fmt(item.value)}</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey={viewMode} radius={[0, 4, 4, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.88} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

TopModelsChart.propTypes = {
  byModel: PropTypes.object,
};
