"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Toggle, CardSkeleton } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { AI_PROVIDERS, getProvidersByKind } from "@/shared/constants/providers";

function getEffectiveStatus(conn) {
  const isCooldown = Object.entries(conn).some(
    ([k, v]) => k.startsWith("modelLock_") && v && new Date(v).getTime() > Date.now()
  );
  return conn.testStatus === "unavailable" && !isCooldown ? "active" : conn.testStatus;
}

function ProviderCard({ provider, kind, connections, onToggle }) {
  const providerInfo = AI_PROVIDERS[provider.id];
  const isNoAuth = !!providerInfo?.noAuth;
  const providerConns = connections.filter((c) => c.provider === provider.id);
  const connected = providerConns.filter((c) => {
    const s = getEffectiveStatus(c);
    return s === "active" || s === "success";
  }).length;
  const error = providerConns.filter((c) => {
    const s = getEffectiveStatus(c);
    return s === "error" || s === "expired" || s === "unavailable";
  }).length;
  const total = providerConns.length;
  const allDisabled = total > 0 && providerConns.every((c) => c.isActive === false);

  const handleToggleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggle) onToggle(provider.id, allDisabled);
  };

  const renderStatus = () => {
    if (isNoAuth) {
      return <span className="font-mono text-xs text-[var(--color-success)] font-medium">[ready]</span>;
    }
    if (allDisabled) {
      return <span className="font-mono text-xs text-[var(--color-ash)]">[disabled]</span>;
    }
    if (total === 0) {
      return <span className="font-mono text-xs text-[var(--color-ash)]">[-] 0 conns</span>;
    }
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {connected > 0 && (
          <span className="font-mono text-xs text-[var(--color-success)] font-medium">
            [{connected} connected]
          </span>
        )}
        {error > 0 && (
          <span className="font-mono text-xs text-[var(--color-danger)] font-medium">
            [{error} err]
          </span>
        )}
        {connected === 0 && error === 0 && (
          <span className="font-mono text-xs text-[var(--color-mute)]">
            [{total} added]
          </span>
        )}
      </div>
    );
  };

  return (
    <Link href={`/dashboard/media-providers/${kind}/${provider.id}`} className="group block h-full">
      <div
        className={`h-full border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-4 rounded-none transition-colors hover:border-[var(--color-hairline-strong)] hover:bg-[var(--color-surface-soft)] ${
          allDisabled ? "opacity-60" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="size-10 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] flex items-center justify-center shrink-0">
              <ProviderIcon
                src={`/providers/${provider.id}.png`}
                alt={provider.name}
                size={28}
                className="object-contain rounded-[4px] max-w-[28px] max-h-[28px]"
                fallbackText={provider.textIcon || provider.id.slice(0, 2).toUpperCase()}
                fallbackColor={provider.color}
              />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-mono font-bold text-sm text-[var(--color-ink)] truncate leading-tight">
                {provider.name}
              </h3>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                {renderStatus()}
              </div>
            </div>
          </div>
          {total > 0 && (
            <div
              className="shrink-0 -mr-1 p-2 min-h-[40px] min-w-[40px] flex items-center justify-center touch-manipulation cursor-pointer"
              onClick={handleToggleClick}
              title={allDisabled ? "Enable provider" : "Disable provider"}
            >
              <Toggle
                size="sm"
                checked={!allDisabled}
                onChange={() => {}}
              />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function ComboList({ combos }) {
  if (combos.length === 0) {
    return <p className="text-xs text-[var(--color-mute)] font-mono">[-] No combos configured.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {combos.map((combo) => (
        <Link key={combo.id} href={`/dashboard/media-providers/combo/${combo.id}`}>
          <div className="border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3 sm:p-3.5 rounded-none transition-colors hover:border-[var(--color-hairline-strong)] hover:bg-[var(--color-surface-soft)] cursor-pointer">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="font-mono text-sm font-bold text-[var(--color-ink)]">[combo]</span>
                <code className="text-sm font-mono font-medium text-[var(--color-ink)] truncate">
                  {combo.name}
                </code>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="hidden sm:flex flex-wrap items-center gap-1">
                  {combo.models.slice(0, 6).map((entry, i) => {
                    const pid = typeof entry === "string" ? entry.split("/")[0] : "";
                    const p = AI_PROVIDERS[pid];
                    return (
                      <div
                        key={`${entry}-${i}`}
                        title={p?.name || entry}
                        className="size-5 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] flex items-center justify-center"
                      >
                        <ProviderIcon
                          src={`/providers/${pid}.png`}
                          alt={p?.name || pid}
                          size={16}
                          className="object-contain rounded-[4px] max-w-[16px] max-h-[16px]"
                          fallbackText={p?.textIcon || pid.slice(0, 2).toUpperCase()}
                          fallbackColor={p?.color}
                        />
                      </div>
                    );
                  })}
                  {combo.models.length > 6 && (
                    <span className="font-mono text-[10px] text-[var(--color-mute)] ml-1">
                      +{combo.models.length - 6}
                    </span>
                  )}
                </div>
                <span className="font-mono text-xs text-[var(--color-mute)]">
                  [{combo.models.length} models]
                </span>
                <span className="font-mono text-xs text-[var(--color-mute)]">&gt;</span>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function Section({ title, description, kind, providers, connections, combos, onCreateCombo, onToggle, loading }) {
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* Header — mobile stacked, desktop row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-[var(--color-hairline)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-mute)]">[kind]</span>
            <h2 className="text-base sm:text-lg font-bold text-[var(--color-ink)] tracking-tight">
              {title}
            </h2>
            <span className="text-xs text-[var(--color-mute)]">
              [{providers.length} providers · {combos.length} combos]
            </span>
          </div>
          <p className="text-xs text-[var(--color-mute)] mt-1">
            {description}
          </p>
        </div>
        <div className="self-start sm:self-auto">
          <Button size="sm" icon="add" onClick={onCreateCombo}>
            Create Combo
          </Button>
        </div>
      </div>

      {/* Combos list */}
      {combos.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-[var(--color-mute)]">
            <span>[combos]</span>
            <span>{combos.length} configured</span>
          </div>
          <ComboList combos={combos} />
        </div>
      )}

      {/* Providers grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : providers.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-[var(--color-hairline)] rounded-none text-[var(--color-mute)] text-xs">
          No providers available.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              kind={kind}
              connections={connections}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WebProvidersPage() {
  const router = useRouter();
  const [connections, setConnections] = useState([]);
  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/providers", { cache: "no-store" }),
      fetch("/api/combos", { cache: "no-store" }),
    ])
      .then(async ([connsRes, combosRes]) => {
        if (cancelled) return;
        if (connsRes.ok) {
          const d = await connsRes.json();
          setConnections(d.connections || []);
        }
        if (combosRes.ok) {
          const d = await combosRes.json();
          setCombos(d.combos || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const searchProviders = getProvidersByKind("webSearch");
  const fetchProviders = getProvidersByKind("webFetch");
  const searchCombos = combos.filter((c) => c.kind === "webSearch");
  const fetchCombos = combos.filter((c) => c.kind === "webFetch");

  const handleToggleProvider = async (providerId, newActive) => {
    const providerConns = connections.filter((c) => c.provider === providerId);
    setConnections((prev) =>
      prev.map((c) => (c.provider === providerId ? { ...c, isActive: newActive } : c))
    );
    await Promise.allSettled(
      providerConns.map((c) =>
        fetch(`/api/providers/${c.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: newActive }),
        })
      )
    );
  };

  const handleCreateCombo = async (kind) => {
    const base = kind === "webSearch" ? "search-combo" : "fetch-combo";
    let name = base;
    let i = 1;
    const existing = new Set(combos.map((c) => c.name));
    while (existing.has(name)) { name = `${base}-${i++}`; }
    const res = await fetch("/api/combos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, models: [], kind }),
    });
    if (res.ok) {
      const created = await res.json();
      router.push(`/dashboard/media-providers/combo/${created.id}`);
    } else {
      const err = await res.json();
      alert(err.error || "Failed to create combo");
    }
  };

  return (
    <div className="flex flex-col gap-8 font-mono">
      <Section
        title="Web Search"
        description="Search upstreams across Google, Brave, Tavily, Perplexity, and SerpApi."
        kind="webSearch"
        providers={searchProviders}
        connections={connections}
        combos={searchCombos}
        loading={loading}
        onCreateCombo={() => handleCreateCombo("webSearch")}
        onToggle={handleToggleProvider}
      />

      <div className="border-t border-[var(--color-hairline)]" />

      <Section
        title="Web Fetch"
        description="Web scraping and content extraction engines across Firecrawl, Jina, and native fetch."
        kind="webFetch"
        providers={fetchProviders}
        connections={connections}
        combos={fetchCombos}
        loading={loading}
        onCreateCombo={() => handleCreateCombo("webFetch")}
        onToggle={handleToggleProvider}
      />
    </div>
  );
}
