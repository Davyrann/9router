"use client";

import { useParams, notFound, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, Badge, Button, Toggle, AddCustomEmbeddingModal, CardSkeleton } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS, getProvidersByKind } from "@/shared/constants/providers";

// Kinds that support combos (currently disabled for image/tts — temporarily hidden).
// webSearch/webFetch handled by /web page.
const COMBO_KINDS = new Set([]);
const COMBO_BASE_NAMES = { image: "image-combo", tts: "tts-combo" };

function getEffectiveStatus(conn) {
  const isCooldown = Object.entries(conn).some(
    ([k, v]) => k.startsWith("modelLock_") && v && new Date(v).getTime() > Date.now()
  );
  return conn.testStatus === "unavailable" && !isCooldown ? "active" : conn.testStatus;
}

function MediaProviderCard({ provider, kind, connections, isCustom, onToggle }) {
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
              <div className="flex items-center gap-2">
                <h3 className="font-mono font-bold text-sm text-[var(--color-ink)] truncate leading-tight">
                  {provider.name}
                </h3>
                {isCustom && (
                  <span className="font-mono text-[11px] text-[var(--color-mute)] border border-[var(--color-hairline)] px-1 rounded-[4px]">
                    [custom]
                  </span>
                )}
              </div>
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
  if (combos.length === 0) return null;
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

export default function MediaProviderKindPage() {
  const { kind } = useParams();
  const router = useRouter();
  const [connections, setConnections] = useState([]);
  const [customNodes, setCustomNodes] = useState([]);
  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddCustomEmbedding, setShowAddCustomEmbedding] = useState(false);

  // webSearch/webFetch listing pages are merged into /web
  useEffect(() => {
    if (kind === "webSearch" || kind === "webFetch") {
      router.replace("/dashboard/media-providers/web");
    }
  }, [kind, router]);

  const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kind);
  const isEmbedding = kind === "embedding";
  const supportsCombo = COMBO_KINDS.has(kind);

  useEffect(() => {
    if (!kindConfig) return;
    const p1 = fetch("/api/providers", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setConnections(d.connections || []))
      .catch(() => {});
    const p2 = isEmbedding
      ? fetch("/api/provider-nodes", { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => setCustomNodes((d.nodes || []).filter((n) => n.type === "custom-embedding")))
          .catch(() => {})
      : Promise.resolve();
    const p3 = supportsCombo
      ? fetch("/api/combos", { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => setCombos(d.combos || []))
          .catch(() => {})
      : Promise.resolve();

    Promise.allSettled([p1, p2, p3]).finally(() => setLoading(false));
  }, [isEmbedding, supportsCombo, kindConfig]);

  if (!kindConfig) return notFound();

  const providers = getProvidersByKind(kind);
  const kindCombos = combos.filter((c) => c.kind === kind);

  // Map custom nodes to MediaProviderCard shape
  const customProviders = customNodes.map((n) => ({
    id: n.id,
    name: n.name || "Custom Embedding",
    color: "#6366F1",
    textIcon: "CE",
  }));

  const allProviders = [...providers, ...customProviders];

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

  const handleCreateCombo = async () => {
    const base = COMBO_BASE_NAMES[kind] || `${kind}-combo`;
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
    <div className="flex flex-col gap-5 sm:gap-6 font-mono">
      {/* Mobile-first Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-[var(--color-hairline)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-mute)]">[kind]</span>
            <h1 className="text-lg sm:text-xl font-bold text-[var(--color-ink)] tracking-tight">
              {kindConfig.label}
            </h1>
          </div>
          <p className="text-xs text-[var(--color-mute)] mt-1">
            {kindConfig.description || `Upstream providers supporting ${kindConfig.label.toLowerCase()} APIs.`}
          </p>
        </div>

        {(isEmbedding || supportsCombo) && (
          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            {supportsCombo && (
              <Button size="sm" icon="add" onClick={handleCreateCombo}>
                Create Combo
              </Button>
            )}
            {isEmbedding && (
              <Button size="sm" icon="add" onClick={() => setShowAddCustomEmbedding(true)}>
                Add Custom Embedding
              </Button>
            )}
          </div>
        )}
      </div>

      {supportsCombo && kindCombos.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-[var(--color-mute)]">
            <span>[combos]</span>
            <span>{kindCombos.length} configured</span>
          </div>
          <ComboList combos={kindCombos} />
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : allProviders.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-[var(--color-hairline)] rounded-none text-[var(--color-mute)] text-xs">
          No providers support <strong>{kindConfig.label}</strong> yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {providers.map((provider) => (
            <MediaProviderCard
              key={provider.id}
              provider={provider}
              kind={kind}
              connections={connections}
              onToggle={handleToggleProvider}
            />
          ))}
          {customProviders.map((provider) => (
            <MediaProviderCard
              key={provider.id}
              provider={provider}
              kind={kind}
              connections={connections}
              isCustom
              onToggle={handleToggleProvider}
            />
          ))}
        </div>
      )}

      {isEmbedding && (
        <AddCustomEmbeddingModal
          isOpen={showAddCustomEmbedding}
          onClose={() => setShowAddCustomEmbedding(false)}
          onCreated={(node) => {
            setCustomNodes((prev) => [...prev, node]);
            setShowAddCustomEmbedding(false);
          }}
        />
      )}
    </div>
  );
}
