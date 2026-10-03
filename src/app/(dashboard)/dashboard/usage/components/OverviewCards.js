"use client";

import PropTypes from "prop-types";
import Card from "@/shared/components/Card";
import Badge from "@/shared/components/Badge";
import { Sparkline } from "./UsageChartsBits.js";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

/**
 * Summary cards, each with its own 7-day trend line.
 *
 * The sparkline is decorative context next to the headline number, so it never
 * replaces it: the number stays the primary read, and the line only shows which
 * way the last week went. A period with fewer than two recorded days renders
 * no line rather than a misleading flat one.
 */
function TrendCard({ label, value, title, tone = "", badge, trend = [], trendLabel }) {
  return (
    <Card className="flex min-w-0 flex-col items-center gap-1 px-3 py-3 sm:px-4">
      <span className="text-text-muted text-xs uppercase font-semibold sm:text-sm">{label}</span>
      <span className={`w-full truncate text-lg font-bold xl:text-xl ${tone}`} title={title}>{value}</span>
      {badge}
      {trend.length >= 2 && (
        <div className={`w-full ${tone || "text-text-muted"}`}>
          <Sparkline values={trend} height={22} ariaLabel={trendLabel || `${label} trend`} />
        </div>
      )}
    </Card>
  );
}

TrendCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  title: PropTypes.string,
  tone: PropTypes.string,
  badge: PropTypes.node,
  trend: PropTypes.arrayOf(PropTypes.number),
  trendLabel: PropTypes.string,
};

TrendCard.defaultProps = { title: "", tone: "", badge: null, trend: [], trendLabel: "" };

export default function OverviewCards({ stats, trends }) {
  const cacheHitRate = stats.totalPromptTokens > 0
    ? ((stats.totalCachedTokens || 0) / stats.totalPromptTokens) * 100
    : 0;

  // `trends` is the /api/usage/sparks payload — series live under `totals`.
  // It is absent while the first fetch is in flight, in which case the cards
  // render exactly as before, so this stays an additive change.
  const t = trends?.totals || {};
  const days = trends?.days || 0;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 sm:gap-4">
      <TrendCard
        label="Total Requests"
        value={fmt(stats.totalRequests)}
        title={fmt(stats.totalRequests)}
        trend={t.requests}
        trendLabel={`Requests per day over the last ${days} days`}
      />
      <TrendCard
        label="Total Input Tokens"
        value={fmt(stats.totalPromptTokens)}
        title={fmt(stats.totalPromptTokens)}
        tone="text-primary"
        trend={t.input}
        trendLabel={`Input tokens per day over the last ${days} days`}
      />
      <TrendCard
        label="Cached Tokens"
        value={fmt(stats.totalCachedTokens)}
        title={fmt(stats.totalCachedTokens)}
        tone="text-info"
        badge={cacheHitRate > 0 ? (
          <Badge variant="info" size="sm" className="mt-0.5">{cacheHitRate.toFixed(1)}% cache hit</Badge>
        ) : null}
        trend={t.cached}
        trendLabel={`Cached tokens per day over the last ${days} days`}
      />
      <TrendCard
        label="Output Tokens"
        value={fmt(stats.totalCompletionTokens)}
        title={fmt(stats.totalCompletionTokens)}
        tone="text-success"
        trend={t.output}
        trendLabel={`Output tokens per day over the last ${days} days`}
      />
      <TrendCard
        label="Est. Cost"
        value={`~${fmtCost(stats.totalCost)}`}
        title={`~${fmtCost(stats.totalCost)}`}
        tone="text-warning"
        badge={<span className="text-[10px] text-text-muted">Estimated, not actual billing</span>}
        trend={t.cost}
        trendLabel={`Estimated cost per day over the last ${days} days`}
      />
    </div>
  );
}

OverviewCards.propTypes = {
  stats: PropTypes.object.isRequired,
  trends: PropTypes.object,
};

OverviewCards.defaultProps = { trends: null };