"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FREE_PROVIDERS, AI_PROVIDERS } from "@/shared/constants/providers";

// Keep providers without serviceKinds (default LLM) or with "llm" in serviceKinds
function isLLMProvider(id) {
  const p = AI_PROVIDERS[id];
  if (!p?.serviceKinds) return true;
  return p.serviceKinds.includes("llm");
}
import Badge from "./Badge";
import { cn } from "@/shared/utils/cn";
import OverviewCards from "@/app/(dashboard)/dashboard/usage/components/OverviewCards";
import UsageTable, { fmt, fmtTime } from "@/app/(dashboard)/dashboard/usage/components/UsageTable";
import dynamic from "next/dynamic";
// Lazy-load: keeps @xyflow/react and recharts out of the initial bundle
const ProviderTopology = dynamic(() => import("@/app/(dashboard)/dashboard/usage/components/ProviderTopology"), { ssr: false });
const UsageChart = dynamic(() => import("@/app/(dashboard)/dashboard/usage/components/UsageChart"), { ssr: false });
const ProviderBarChart = dynamic(() => import("@/app/(dashboard)/dashboard/usage/components/ProviderBarChart"), { ssr: false });
const TopModelsChart = dynamic(() => import("@/app/(dashboard)/dashboard/usage/components/TopModelsChart"), { ssr: false });

function timeAgo(timestamp) {
  const diff = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Auto-update time display every second without re-rendering parent
function TimeAgo({ timestamp }) {
  const [, setTick] = useState(0);
  
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  
  return <>{timeAgo(timestamp)}</>;
}

function RecentRequests({ requests = [] }) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-none border border-[var(--color-hairline)] bg-[var(--color-surface)] font-mono h-[340px] sm:h-[480px]">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-[var(--color-hairline)] shrink-0 bg-[var(--color-canvas)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-[var(--color-success)] opacity-75" />
            <span className="relative inline-flex h-2 w-2 bg-[var(--color-success)]" />
          </span>
          <span className="text-[12px] font-bold text-[var(--color-ink)] uppercase tracking-wider">Live Requests</span>
        </div>
        <span className="px-2 py-0.5 rounded-[4px] text-[11px] bg-[var(--color-surface-soft)] text-[var(--color-mute)] border border-[var(--color-hairline)]">
          {requests.length} logged
        </span>
      </div>

      {!requests.length ? (
        <div className="flex-1 flex items-center justify-center text-[var(--color-mute)] text-xs">
          No live requests recorded yet
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <table className="w-full min-w-[340px] border-collapse text-xs">
            <thead className="sticky top-0 bg-[var(--color-surface)]/95 backdrop-blur-sm z-10">
              <tr className="border-b border-[var(--color-hairline)] text-[var(--color-ash)] text-[11px]">
                <th className="py-2 px-2.5 text-left w-3"></th>
                <th className="py-2 px-2 text-left font-medium">Model</th>
                <th className="py-2 px-2 text-right font-medium whitespace-nowrap">In / Out</th>
                <th className="py-2 px-2 text-right font-medium whitespace-nowrap">Cache</th>
                <th className="py-2 px-2.5 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-hairline)]">
              {requests.map((r, i) => {
                const ok = !r.status || r.status === "ok" || r.status === "success";
                return (
                  <tr key={i} className="hover:bg-[var(--color-canvas)]/70 transition-colors">
                    <td className="py-2 px-2.5">
                      <span className={`block w-1.5 h-1.5 rounded-full ${ok ? "bg-[var(--color-success)] shadow-[0_0_6px_var(--color-success)]" : "bg-[var(--color-danger)] shadow-[0_0_6px_var(--color-danger)]"}`} />
                    </td>
                    <td className="py-2 px-2 font-mono truncate max-w-[130px] text-[var(--color-ink)] font-medium" title={r.model}>
                      {r.model}
                    </td>
                    <td className="py-2 px-2 text-right whitespace-nowrap tabular-nums">
                      <span className="text-[var(--color-primary)] font-medium">{fmt(r.promptTokens)}↑</span>
                      {" "}
                      <span className="text-[var(--color-success)] font-medium">{fmt(r.completionTokens)}↓</span>
                    </td>
                    <td className="py-2 px-2 text-right whitespace-nowrap tabular-nums">
                      {r.cachedTokens > 0 ? (
                        <span className="text-[var(--color-accent,#8b5cf6)] font-semibold" title={`${r.cachedTokens.toLocaleString()} cached tokens`}>
                          {fmt(r.cachedTokens)}
                        </span>
                      ) : (
                        <span className="text-[var(--color-ash)]">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2.5 text-right text-[var(--color-mute)] whitespace-nowrap tabular-nums text-[11px]">
                      <TimeAgo timestamp={r.timestamp} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function sortData(dataMap, pendingMap = {}, sortBy, sortOrder) {
  return Object.entries(dataMap || {})
    .map(([key, data]) => {
      const totalTokens = (data.promptTokens || 0) + (data.completionTokens || 0);
      const totalCost = data.cost || 0;
      // ponytail: cost split is a token-share allocation of the (rate-accurate)
      // server total, not a per-rate recompute. cached is a subset of prompt, so
      // peel it out of the input share. Upgrade to a stored per-component cost
      // breakdown if exact cached-rate cost display is needed.
      const cachedTokens = data.cachedTokens || 0;
      const nonCachedInput = Math.max(0, (data.promptTokens || 0) - cachedTokens);
      const inputCost = totalTokens > 0 ? nonCachedInput * (totalCost / totalTokens) : 0;
      const cachedCost = totalTokens > 0 ? cachedTokens * (totalCost / totalTokens) : 0;
      const outputCost = totalTokens > 0 ? (data.completionTokens || 0) * (totalCost / totalTokens) : 0;
      return { ...data, key, totalTokens, totalCost, inputCost, cachedCost, outputCost, pending: pendingMap[key] || 0 };
    })
    .sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
}

function getGroupKey(item, keyField) {
  switch (keyField) {
    case "rawModel": return item.rawModel || "Unknown Model";
    case "accountName": return item.accountName || `Account ${item.connectionId?.slice(0, 8)}...` || "Unknown Account";
    case "keyName": return item.apiKeyMasked ? `${item.keyName} (${item.apiKeyMasked})` : item.keyName || "Unknown Key";
    case "endpoint": return item.endpoint || "Unknown Endpoint";
    default: return item[keyField] || "Unknown";
  }
}

function groupDataByKey(data, keyField) {
  if (!Array.isArray(data)) return [];
  const groups = {};
  data.forEach((item) => {
    const gk = getGroupKey(item, keyField);
    if (!groups[gk]) {
      groups[gk] = {
        groupKey: gk,
        summary: { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0, cost: 0, inputCost: 0, cachedCost: 0, outputCost: 0, lastUsed: null, pending: 0 },
        items: [],
      };
    }
    const s = groups[gk].summary;
    s.requests += item.requests || 0;
    s.promptTokens += item.promptTokens || 0;
    s.completionTokens += item.completionTokens || 0;
    s.cachedTokens += item.cachedTokens || 0;
    s.totalTokens += item.totalTokens || 0;
    s.cost += item.cost || 0;
    s.inputCost += item.inputCost || 0;
    s.cachedCost += item.cachedCost || 0;
    s.outputCost += item.outputCost || 0;
    s.pending += item.pending || 0;
    if (item.lastUsed && (!s.lastUsed || new Date(item.lastUsed) > new Date(s.lastUsed))) {
      s.lastUsed = item.lastUsed;
    }
    groups[gk].items.push(item);
  });
  return Object.values(groups);
}

const MODEL_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const ACCOUNT_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "accountName", label: "Account" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const API_KEY_COLUMNS = [
  { field: "keyName", label: "API Key Name" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const ENDPOINT_COLUMNS = [
  { field: "endpoint", label: "Endpoint" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const TABLE_OPTIONS = [
  { value: "model", label: "Usage by Model" },
  { value: "account", label: "Usage by Account" },
  { value: "apiKey", label: "Usage by API Key" },
  { value: "endpoint", label: "Usage by Endpoint" },
];

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
  { value: "all", label: "All" },
];

export default function UsageStats({ period: periodProp, setPeriod: setPeriodProp, hidePeriodSelector = false } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sortBy = searchParams.get("sortBy") || "rawModel";
  const sortOrder = searchParams.get("sortOrder") || "asc";

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [tableView, setTableView] = useState("model");
  const [viewMode, setViewMode] = useState("costs");
  const [providers, setProviders] = useState([]);
  const [periodLocal, setPeriodLocal] = useState("today");
  const isInitialLoad = useRef(true);
  const hasLoadedStats = useRef(false);
  const period = periodProp ?? periodLocal;
  const setPeriod = setPeriodProp ?? setPeriodLocal;

  // Fetch connected providers once, deduplicate by provider type
  // Always include noAuth free providers (e.g. opencode) regardless of connections
  useEffect(() => {
    Promise.all([
      fetch("/api/providers").then((r) => r.ok ? r.json() : null),
      fetch("/api/provider-nodes").then((r) => r.ok ? r.json() : null),
    ])
      .then(([d, nodesData]) => {
        // Build node name lookup for custom providers
        const nodeNameMap = {};
        for (const node of (nodesData?.nodes || [])) {
          nodeNameMap[node.id] = node.name;
        }
        const seen = new Set();
        const unique = (d?.connections || []).filter((c) => {
          if (c.isActive === false) return false;
          if (!isLLMProvider(c.provider)) return false;
          if (AI_PROVIDERS[c.provider]?.hidden) return false;
          if (seen.has(c.provider)) return false;
          seen.add(c.provider);
          return true;
        }).map((c) => ({
          ...c,
          nodeName: nodeNameMap[c.provider] || null,
        }));
        const noAuthProviders = Object.values(FREE_PROVIDERS)
          .filter((p) => p.noAuth && !p.hidden && !seen.has(p.id) && isLLMProvider(p.id))
          .map((p) => ({ provider: p.id, name: p.name }));
        setProviders([...unique, ...noAuthProviders]);
      })
      .catch(() => {});
  }, []);

  // Fetch filtered stats via REST when period changes
  useEffect(() => {
    // First load: show full spinner; subsequent: show subtle fetching indicator
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      setLoading(true);
    } else {
      setFetching(true);
    }

    fetch(`/api/usage/stats?period=${period}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          hasLoadedStats.current = true;
          setStats((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setFetching(false);
      });
  }, [period]);

  // SSE connection - real-time updates for activeRequests + recentRequests only
  useEffect(() => {
    const es = new EventSource("/api/usage/stream");

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        // Always merge only real-time fields, never overwrite full stats from REST
        setStats((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            activeRequests: data.activeRequests,
            recentRequests: data.recentRequests,
            errorProvider: data.errorProvider,
            pending: data.pending,
          };
        });
        if (hasLoadedStats.current) setLoading(false);
      } catch (err) {
        console.error("[SSE CLIENT] parse error:", err);
      }
    };

    es.onerror = () => setLoading(false);

    return () => es.close();
  }, []);

  const toggleSort = useCallback((tableType, field) => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("sortBy") === field) {
      params.set("sortOrder", params.get("sortOrder") === "asc" ? "desc" : "asc");
    } else {
      params.set("sortBy", field);
      params.set("sortOrder", "asc");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // Compute active table data
  const activeTableConfig = useMemo(() => {
    if (!stats) return null;
    switch (tableView) {
      case "model": {
        const pendingMap = stats.pending?.byModel || {};
        return {
          columns: MODEL_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byModel, pendingMap, sortBy, sortOrder), "rawModel"),
          storageKey: "usage-stats:expanded-models",
          emptyMessage: "No usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-4 py-2.5 text-text-muted">—</td>
              <td className="px-4 py-2.5 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-4 py-2.5 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`px-4 py-2.5 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.rawModel}</td>
              <td className="px-4 py-2.5"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>
              <td className="px-4 py-2.5 text-right">{fmt(item.requests)}</td>
              <td className="px-4 py-2.5 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "account": {
        const pendingMap = {};
        if (stats?.pending?.byAccount) {
          Object.entries(stats.byAccount || {}).forEach(([accountKey, data]) => {
            const connPending = stats.pending.byAccount[data.connectionId];
            if (connPending) {
              const modelKey = data.provider ? `${data.rawModel} (${data.provider})` : data.rawModel;
              pendingMap[accountKey] = connPending[modelKey] || 0;
            }
          });
        }
        return {
          columns: ACCOUNT_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byAccount, pendingMap, sortBy, sortOrder), "accountName"),
          storageKey: "usage-stats:expanded-accounts",
          emptyMessage: "No account-specific usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-4 py-2.5 text-text-muted">—</td>
              <td className="px-4 py-2.5 text-text-muted">—</td>
              <td className="px-4 py-2.5 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-4 py-2.5 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`px-4 py-2.5 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.accountName || `Account ${item.connectionId?.slice(0, 8)}...`}</td>
              <td className={`px-4 py-2.5 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.rawModel}</td>
              <td className="px-4 py-2.5"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>
              <td className="px-4 py-2.5 text-right">{fmt(item.requests)}</td>
              <td className="px-4 py-2.5 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "apiKey": {
        return {
          columns: API_KEY_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byApiKey, {}, sortBy, sortOrder), "keyName"),
          storageKey: "usage-stats:expanded-apikeys",
          emptyMessage: "No API key usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-4 py-2.5 text-text-muted">—</td>
              <td className="px-4 py-2.5 text-text-muted">—</td>
              <td className="px-4 py-2.5 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-4 py-2.5 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-4 py-2.5 font-medium font-mono text-xs">{item.apiKeyMasked || item.keyName}</td>
              <td className="px-4 py-2.5">{item.rawModel}</td>
              <td className="px-4 py-2.5"><Badge variant="neutral" size="sm">{item.provider}</Badge></td>
              <td className="px-4 py-2.5 text-right">{fmt(item.requests)}</td>
              <td className="px-4 py-2.5 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "endpoint":
      default: {
        return {
          columns: ENDPOINT_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byEndpoint, {}, sortBy, sortOrder), "endpoint"),
          storageKey: "usage-stats:expanded-endpoints",
          emptyMessage: "No endpoint usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-4 py-2.5 text-text-muted">—</td>
              <td className="px-4 py-2.5 text-text-muted">—</td>
              <td className="px-4 py-2.5 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-4 py-2.5 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-4 py-2.5 font-medium font-mono text-sm">{item.endpoint}</td>
              <td className="px-4 py-2.5">{item.rawModel}</td>
              <td className="px-4 py-2.5"><Badge variant="neutral" size="sm">{item.provider}</Badge></td>
              <td className="px-4 py-2.5 text-right">{fmt(item.requests)}</td>
              <td className="px-4 py-2.5 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
    }
  }, [stats, tableView, sortBy, sortOrder]);

  if (!stats && !loading) return <div className="text-text-muted">Failed to load usage statistics.</div>;

  const spinner = (
    <div className="flex items-center justify-center py-12 text-text-muted">
      <span className="material-symbols-outlined text-[32px] animate-spin">progress_activity</span>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* Period selector (hidden when controlled by parent) */}
      {!hidePeriodSelector && (
        <div className="flex w-full items-center gap-2 sm:w-auto sm:self-end">
          <div className="grid flex-1 grid-cols-6 items-center gap-1 rounded-lg border border-border bg-bg-subtle p-1 sm:flex sm:flex-none">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                disabled={fetching}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${period === p.value ? "bg-primary text-white shadow-sm" : "text-text-muted hover:bg-bg-hover hover:text-text"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {fetching && (
            <span className="material-symbols-outlined text-[16px] text-text-muted animate-spin">progress_activity</span>
          )}
        </div>
      )}

      {/* 1. Metrics & Comparison Overview */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between pb-1.5 border-b border-[var(--color-hairline)] font-mono">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[var(--color-ink)]">insights</span>
            <h2 className="text-[14px] sm:text-[15px] font-bold text-[var(--color-ink)]">
              Overview & Comparisons
            </h2>
          </div>
          {fetching && (
            <span className="text-[12px] font-mono text-[var(--color-mute)] flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
              updating…
            </span>
          )}
        </div>
        {loading ? spinner : <OverviewCards stats={stats} />}
      </div>

      {/* 2. Activity Timeline & Analytics */}
      <div className="flex flex-col gap-2.5 pt-2 border-t border-[var(--color-hairline)] font-mono">
        <div className="flex items-center gap-2 pb-1">
          <span className="material-symbols-outlined text-[18px] text-[var(--color-ink)]">timeline</span>
          <h2 className="text-[14px] sm:text-[15px] font-bold text-[var(--color-ink)]">
            Activity Timeline
          </h2>
        </div>
        {loading ? spinner : <UsageChart period={period} />}
        {!loading && (stats.byProvider || stats.byModel) && (
          <div className="grid min-w-0 grid-cols-1 gap-2.5 lg:grid-cols-2 mt-1">
            <ProviderBarChart byProvider={stats.byProvider} />
            <TopModelsChart byModel={stats.byModel} />
          </div>
        )}
      </div>

      {/* 3. Live Topology & Recent Stream */}
      <div className="flex flex-col gap-2.5 pt-2 border-t border-[var(--color-hairline)] font-mono">
        <div className="flex items-center gap-2 pb-1">
          <span className="material-symbols-outlined text-[18px] text-[var(--color-ink)]">hub</span>
          <h2 className="text-[14px] sm:text-[15px] font-bold text-[var(--color-ink)]">
            Routing Topology & Live Stream
          </h2>
        </div>
        {loading ? spinner : (
          <div className="grid min-w-0 grid-cols-1 items-stretch gap-2.5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <ProviderTopology
              providers={providers}
              activeRequests={stats.activeRequests || []}
              lastProvider={stats.recentRequests?.[0]?.provider || ""}
              errorProvider={stats.errorProvider || ""}
            />
            <RecentRequests requests={stats.recentRequests || []} />
          </div>
        )}
      </div>

      {/* 4. Granular Breakdown Table */}
      <div className="flex flex-col gap-2.5 pt-2 border-t border-[var(--color-hairline)] font-mono">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[var(--color-ink)]">table_chart</span>
            <h2 className="text-[14px] sm:text-[15px] font-bold text-[var(--color-ink)]">
              Breakdown Details
            </h2>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <select
              value={tableView}
              onChange={(e) => setTableView(e.target.value)}
              className="h-8 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2.5 text-[12px] font-mono text-[var(--color-ink)] outline-none cursor-pointer hover:border-[var(--color-primary)] transition-colors"
            >
              {TABLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="inline-flex items-center gap-1 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-0.5">
              <button
                onClick={() => setViewMode("costs")}
                className={cn(
                  "h-7 px-3 rounded-[4px] text-[12px] font-mono transition-all duration-150 cursor-pointer",
                  viewMode === "costs"
                    ? "bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold"
                    : "text-[var(--color-mute)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)]"
                )}
              >
                Costs
              </button>
              <button
                onClick={() => setViewMode("tokens")}
                className={cn(
                  "h-7 px-3 rounded-[4px] text-[12px] font-mono transition-all duration-150 cursor-pointer",
                  viewMode === "tokens"
                    ? "bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold"
                    : "text-[var(--color-mute)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)]"
                )}
              >
                Tokens
              </button>
            </div>
          </div>
        </div>
        {loading ? spinner : activeTableConfig && (
          <UsageTable
            title=""
            columns={activeTableConfig.columns}
            groupedData={activeTableConfig.groupedData}
            tableType={tableView}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onToggleSort={toggleSort}
            viewMode={viewMode}
            storageKey={activeTableConfig.storageKey}
            renderSummaryCells={activeTableConfig.renderSummaryCells}
            renderDetailCells={activeTableConfig.renderDetailCells}
            emptyMessage={activeTableConfig.emptyMessage}
          />
        )}
      </div>
    </div>
  );
}
