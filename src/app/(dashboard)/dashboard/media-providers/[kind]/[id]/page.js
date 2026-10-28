"use client";

import { useParams, notFound, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Button, AddCustomEmbeddingModal, NoAuthProxyCard, ProviderInfoCard, CardSkeleton } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS, OAUTH_PROVIDERS, isCustomEmbeddingProvider } from "@/shared/constants/providers";
import ConnectionsCard from "@/app/(dashboard)/dashboard/providers/components/ConnectionsCard";
import { WEB_LOGIN_PROVIDERS } from "@/app/(dashboard)/dashboard/providers/components/WebLoginButton";
import ModelsCard from "@/app/(dashboard)/dashboard/providers/components/ModelsCard";
import { KIND_EXAMPLE_CONFIG } from "./components/exampleShared";
import { EmbeddingExampleCard } from "./components/EmbeddingExampleCard";
import { TtsExampleCard } from "./components/TtsExampleCard";
import { GenericExampleCard } from "./components/GenericExampleCard";
import { SttExampleCard } from "./components/SttExampleCard";

export default function MediaProviderDetailPage() {
  const { kind, id } = useParams();
  const router = useRouter();
  const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kind);
  const isCustom = isCustomEmbeddingProvider(id) && kind === "embedding";

  const handleDeleteCustom = async () => {
    if (!confirm("Delete this Custom Embedding node?")) return;
    try {
      const res = await fetch(`/api/provider-nodes/${id}`, { method: "DELETE" });
      if (res.ok) router.push(`/dashboard/media-providers/${kind}`);
    } catch (error) {
      console.log("Error deleting custom embedding node:", error);
    }
  };

  const [customNode, setCustomNode] = useState(null);
  const [customLoading, setCustomLoading] = useState(isCustom);
  const [showEditModal, setShowEditModal] = useState(false);

  // Fetch custom node info from API for custom embedding nodes
  useEffect(() => {
    if (!isCustom) return;
    let cancelled = false;
    fetch("/api/provider-nodes", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setCustomNode((d.nodes || []).find((n) => n.id === id) || null);
        setCustomLoading(false);
      })
      .catch(() => { if (!cancelled) setCustomLoading(false); });
    return () => { cancelled = true; };
  }, [id, isCustom]);

  if (!kindConfig) return notFound();

  const builtInProvider = AI_PROVIDERS[id];

  // For custom embedding nodes, build a synthetic provider object
  const provider = isCustom
    ? (customNode ? { id, name: customNode.name || "Custom Embedding", color: "#6366F1", textIcon: "CE" } : null)
    : builtInProvider;

  if (!isCustom && !builtInProvider) return notFound();
  if (isCustom && !customLoading && !customNode) return notFound();
  if (isCustom && customLoading) {
    return (
      <div className="flex flex-col gap-4 font-mono">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const kinds = isCustom ? ["embedding"] : (provider.serviceKinds ?? ["llm"]);
  if (!isCustom && !kinds.includes(kind)) return notFound();

  return (
    <div className="flex flex-col gap-5 sm:gap-6 font-mono">
      {/* Top Bar / Navigation */}
      <div>
        <Link
          href={`/dashboard/media-providers/${kind}`}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-mute)] hover:text-[var(--color-ink)] transition-colors mb-3"
        >
          <span>&lt;-</span>
          <span>[{kindConfig.label}]</span>
        </Link>

        {/* Header: responsive flex layout stacking on mobile */}
        <div className="border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 rounded-none">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="size-12 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] flex items-center justify-center shrink-0">
                <ProviderIcon
                  src={`/providers/${provider.id}.png`}
                  alt={provider.name}
                  size={36}
                  className="object-contain rounded-[4px] max-w-[36px] max-h-[36px]"
                  fallbackText={provider.textIcon || provider.id.slice(0, 2).toUpperCase()}
                  fallbackColor={provider.color}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg sm:text-2xl font-bold text-[var(--color-ink)] tracking-tight truncate">
                    {provider.name}
                  </h1>
                  {!isCustom && provider.notice?.apiKeyUrl && (
                    <a
                      href={provider.notice.apiKeyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--color-accent)] hover:underline inline-flex items-center gap-1"
                    >
                      [get key -&gt;]
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {isCustom && (
                    <span className="text-[11px] border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] px-1.5 py-0.5 rounded-[4px] text-[var(--color-ink)]">
                      [custom: {customNode?.prefix}]
                    </span>
                  )}
                  {kinds.map((k) => (
                    <span
                      key={k}
                      className={`text-[11px] border px-1.5 py-0.5 rounded-[4px] uppercase ${
                        k === kind
                          ? "border-[var(--color-ink)] bg-[var(--color-surface-card)] text-[var(--color-ink)] font-bold"
                          : "border-[var(--color-hairline)] text-[var(--color-mute)]"
                      }`}
                    >
                      [{k}]
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {isCustom && (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <Button size="sm" variant="secondary" icon="edit" onClick={() => setShowEditModal(true)}>
                  Edit
                </Button>
                <Button size="sm" variant="secondary" icon="delete" onClick={handleDeleteCustom}>
                  Delete
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Kind-specific notice */}
      {!isCustom && provider.kindNotice?.[kind] && (
        <div className="flex items-start gap-2.5 p-3 sm:p-3.5 border border-[var(--color-warning)]/40 bg-[var(--color-surface-soft)] text-[var(--color-ink)] rounded-none text-xs">
          <span className="text-[var(--color-warning)] font-bold shrink-0">[notice]</span>
          <p className="min-w-0 flex-1 leading-relaxed">{provider.kindNotice[kind]}</p>
        </div>
      )}

      {/* Provider notice text */}
      {!isCustom && provider.notice?.text && !provider.deprecated && (
        <div className="flex flex-col gap-2 p-3 sm:p-3.5 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] text-[var(--color-ink)] rounded-none text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
            <span className="text-[var(--color-mute)] font-bold shrink-0">[info]</span>
            <p className="min-w-0 flex-1 leading-relaxed">{provider.notice.text}</p>
          </div>
          {provider.notice.apiKeyUrl && (
            <a
              href={provider.notice.apiKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-[4px] border border-[var(--color-hairline-strong)] bg-[var(--color-canvas)] px-2.5 py-1 text-xs font-bold text-[var(--color-ink)] hover:bg-[var(--color-surface-card)] transition-colors shrink-0"
            >
              [get key -&gt;]
            </a>
          )}
        </div>
      )}

      {/* Connections Card */}
      {!isCustom && provider.noAuth ? (
        <NoAuthProxyCard providerId={id} />
      ) : kind === "stt" && OAUTH_PROVIDERS[id] ? (
        <Card>
          <p className="text-sm text-text-muted mb-3">This service shares your existing OAuth connections.</p>
          <Link href={`/dashboard/providers/${id}`} className="text-primary hover:underline">Manage OAuth connections →</Link>
        </Card>
      ) : (
        <ConnectionsCard
          providerId={id}
          isOAuth={false}
          loginProviderId={!isCustom && WEB_LOGIN_PROVIDERS.has(id) ? id : null}
        />
      )}

      {/* Models Card */}
      {kind !== "tts" && kind !== "webSearch" && kind !== "webFetch" && (
        <ModelsCard
          providerId={id}
          kindFilter={kind}
          providerAliasOverride={isCustom ? customNode?.prefix : undefined}
        />
      )}

      {/* Provider Info Card */}
      {!isCustom && (provider.searchConfig || provider.fetchConfig || provider.ttsConfig || provider.sttConfig || provider.embeddingConfig || provider.systemoneConfig || provider.searchViaChat) && (
        <ProviderInfoCard
          config={
            kind === "webFetch" ? provider.fetchConfig
              : kind === "tts" ? provider.ttsConfig
              : kind === "stt" ? provider.sttConfig
              : kind === "embedding" ? provider.embeddingConfig
              : kind === "systemone" ? provider.systemoneConfig
              : provider.searchConfig || { mode: "chat-completions", defaultModel: provider.searchViaChat?.defaultModel, pricingUrl: provider.searchViaChat?.pricingUrl, freeTier: provider.searchViaChat?.freeTier }
          }
          provider={provider}
          title={`${kindConfig.label} Config`}
        />
      )}

      {/* Example Test Card */}
      {kind === "embedding" && (
        <EmbeddingExampleCard providerId={id} customAlias={customNode?.prefix} />
      )}
      {kind === "tts" && <TtsExampleCard providerId={id} />}
      {kind === "stt" && !isCustom && <SttExampleCard providerId={id} />}
      {!isCustom && KIND_EXAMPLE_CONFIG[kind] && <GenericExampleCard providerId={id} kind={kind} />}

      {isCustom && (
        <AddCustomEmbeddingModal
          isOpen={showEditModal}
          node={customNode}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => {
            setCustomNode(updated);
            setShowEditModal(false);
          }}
        />
      )}
    </div>
  );
}
