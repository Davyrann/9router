"use client";

import { useParams, notFound, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Input, Toggle, ModelSelectModal, CardSkeleton } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { AI_PROVIDERS, MEDIA_PROVIDER_KINDS } from "@/shared/constants/providers";

const getTimestamp = () => Date.now();

// Parse "providerId/model" or just "providerId" → { providerId, model }
function parseModelEntry(entry) {
  if (typeof entry !== "string") return { providerId: "", model: "" };
  const idx = entry.indexOf("/");
  if (idx < 0) return { providerId: entry, model: "" };
  return { providerId: entry.slice(0, idx), model: entry.slice(idx + 1) };
}

const VALID_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;

const KIND_LABELS = {
  webSearch: "Web Search",
  webFetch: "Web Fetch",
  image: "Image",
  tts: "Text-to-Speech",
};

const EXAMPLE_PATHS = {
  webSearch: "/v1/web/search",
  webFetch: "/v1/web/fetch",
  image: "/v1/images/generations",
  tts: "/v1/audio/speech",
};

const EXAMPLE_BODIES = {
  webSearch: (name) => ({ model: name, query: "Latest AI news", search_type: "web", max_results: 3 }),
  webFetch: (name) => ({ model: name, url: "https://example.com", format: "markdown" }),
  image: (name) => ({ model: name, prompt: "A minimalist retro terminal workspace", n: 1, size: "1024x1024" }),
  tts: (name) => ({ model: name, input: "Hello, this is a combo test.", voice: "alloy" }),
};

function getListingHref(kind) {
  if (kind === "webSearch" || kind === "webFetch") return "/dashboard/media-providers/web";
  return `/dashboard/media-providers/${kind}`;
}

export default function ComboDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [combo, setCombo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [providers, setProviders] = useState([]);
  const [roundRobin, setRoundRobin] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [logs, setLogs] = useState([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connections, setConnections] = useState([]);
  const [modelAliases, setModelAliases] = useState({});

  const fetchAll = async () => {
    try {
      const [comboRes, settingsRes, logsRes, keysRes, connsRes, aliasesRes] = await Promise.all([
        fetch(`/api/combos/${id}`, { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
        fetch("/api/usage/logs", { cache: "no-store" }),
        fetch("/api/keys", { cache: "no-store" }),
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/models/alias", { cache: "no-store" }),
      ]);
      if (aliasesRes.ok) setModelAliases((await aliasesRes.json()).aliases || {});
      if (keysRes.ok) {
        const k = await keysRes.json();
        setApiKey((k.keys || []).find((x) => x.isActive !== false)?.key || "");
      }
      if (connsRes.ok) setConnections(((await connsRes.json()).connections || []).filter((x) => x.isActive !== false));
      if (!comboRes.ok) { setCombo(null); setLoading(false); return; }
      const c = await comboRes.json();
      setCombo(c);
      setName(c.name);
      setProviders(c.models || []);
      const s = settingsRes.ok ? await settingsRes.json() : {};
      setRoundRobin(s.comboStrategies?.[c.name]?.fallbackStrategy === "round-robin");
      const allLogs = logsRes.ok ? await logsRes.json() : [];
      setLogs(allLogs.filter((l) => typeof l === "string" && l.includes(c.name)).slice(0, 50));
    } catch { /* noop */ }
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAll(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const validateName = (v) => {
    if (!v.trim()) { setNameError("Name is required"); return false; }
    if (!VALID_NAME_REGEX.test(v)) { setNameError("Only letters, numbers, -, _ and ."); return false; }
    setNameError("");
    return true;
  };

  const saveCombo = async (patch) => {
    const res = await fetch(`/api/combos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { const err = await res.json(); alert(err.error || "Failed to save"); return false; }
    return true;
  };

  const handleSaveName = async () => {
    if (!validateName(name)) return;
    if (name === combo.name) return;
    const ok = await saveCombo({ name });
    if (ok) await fetchAll();
  };

  const handleAddModel = async (entry) => {
    const value = typeof entry === "string" ? entry : (entry?.value || "");
    if (!value || providers.includes(value)) return;
    const next = [...providers, value];
    setProviders(next);
    await saveCombo({ models: next });
  };

  const handleDeselectModel = async (entry) => {
    const value = typeof entry === "string" ? entry : (entry?.value || "");
    if (!value) return;
    const next = providers.filter((v) => v !== value);
    setProviders(next);
    await saveCombo({ models: next });
  };

  const handleRemoveProvider = async (idx) => {
    const next = providers.filter((_, i) => i !== idx);
    setProviders(next);
    await saveCombo({ models: next });
  };

  const handleMove = async (idx, delta) => {
    const next = [...providers];
    const swap = idx + delta;
    if (swap < 0 || swap >= next.length) return;
    const [item] = next.splice(idx, 1);
    next.splice(swap, 0, item);
    setProviders(next);
    await saveCombo({ models: next });
  };

  const handleToggleRoundRobin = async (val) => {
    setRoundRobin(val);
    const settingsRes = await fetch("/api/settings", { cache: "no-store" }).catch(() => null);
    const s = settingsRes?.ok ? await settingsRes.json() : {};
    const updated = { ...(s.comboStrategies || {}) };
    updated[combo.name] = {
      ...(updated[combo.name] || {}),
      fallbackStrategy: val ? "round-robin" : "priority",
    };
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comboStrategies: updated }),
    });
  };

  const handleDelete = async () => {
    if (!confirm(`Delete combo "${combo.name}"?`)) return;
    const res = await fetch(`/api/combos/${id}`, { method: "DELETE" });
    if (res.ok) router.push(getListingHref(combo.kind));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError("");
    if (testResult?.audioUrl) { try { URL.revokeObjectURL(testResult.audioUrl); } catch {} }
    if (testResult?.imageUrl?.startsWith("blob:")) { try { URL.revokeObjectURL(testResult.imageUrl); } catch {} }
    const start = getTimestamp();
    try {
      const path = EXAMPLE_PATHS[combo.kind];
      const body = EXAMPLE_BODIES[combo.kind](combo.name);
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const res = await fetch(`/api${path}`, { method: "POST", headers, body: JSON.stringify(body) });
      const latencyMs = getTimestamp() - start;
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setTestError(d?.error?.message || d?.error || `HTTP ${res.status}`);
        setTestResult({ json: JSON.stringify(d, null, 2), latencyMs });
        return;
      }
      const ctype = res.headers.get("content-type") || "";
      // Binary image
      if (ctype.startsWith("image/")) {
        const blob = await res.blob();
        setTestResult({ imageUrl: URL.createObjectURL(blob), latencyMs });
        return;
      }
      // Binary audio
      if (ctype.startsWith("audio/") || ctype === "application/octet-stream") {
        const blob = await res.blob();
        setTestResult({ audioUrl: URL.createObjectURL(blob), latencyMs });
        return;
      }
      // JSON
      const data = await res.json();
      const first = data?.data?.[0];
      const imageUrl = first?.b64_json
        ? `data:image/png;base64,${first.b64_json}`
        : (first?.url || "");
      setTestResult({ json: JSON.stringify(maskB64(data), null, 2), imageUrl, latencyMs });
    } catch (e) {
      setTestError(e.message || "Network error");
    } finally {
      setTesting(false);
    }
  };

  // Mask large b64_json strings to keep JSON view readable
  function maskB64(obj) {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(maskB64);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = (k === "b64_json" && typeof v === "string" && v.length > 100)
        ? `<${v.length} chars base64>`
        : maskB64(v);
    }
    return out;
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 font-mono">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }
  if (!combo) return notFound();

  const kindLabel = KIND_LABELS[combo.kind] || MEDIA_PROVIDER_KINDS.find((k) => k.id === combo.kind)?.label || "Combo";
  const examplePath = EXAMPLE_PATHS[combo.kind];
  const exampleBody = combo.kind && EXAMPLE_BODIES[combo.kind] ? EXAMPLE_BODIES[combo.kind](combo.name) : null;
  const curlExample = examplePath
    ? `curl -X POST http://localhost:20128${examplePath} \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${apiKey || "YOUR_KEY"}" \\\n  -d '${JSON.stringify(exampleBody)}'`
    : "";
  const backHref = getListingHref(combo.kind);

  return (
    <div className="flex flex-col gap-5 sm:gap-6 font-mono">
      {/* Top Bar / Navigation */}
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-mute)] hover:text-[var(--color-ink)] transition-colors mb-3"
        >
          <span>&lt;-</span>
          <span>[{kindLabel} Combos]</span>
        </Link>

        {/* Header: responsive flex layout stacking on mobile */}
        <div className="border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 rounded-none">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-10 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] flex items-center justify-center shrink-0">
                <span className="font-mono text-xs font-bold text-[var(--color-ink)]">[C]</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--color-mute)]">[{kindLabel}]</span>
                  <code className="text-base sm:text-xl font-bold font-mono text-[var(--color-ink)] truncate">
                    {combo.name}
                  </code>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-[var(--color-mute)]">
                    [{providers.length} models configured]
                  </span>
                </div>
              </div>
            </div>

            <div className="self-start sm:self-auto">
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center justify-center rounded-[4px] border border-[var(--color-danger)]/40 bg-[var(--color-canvas)] hover:bg-[var(--color-danger)]/10 text-[var(--color-danger)] text-xs px-3 py-1.5 min-h-[34px] transition-colors"
              >
                [delete combo]
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Card */}
      <div className="border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 rounded-none">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--color-hairline)]">
          <h2 className="text-sm font-bold text-[var(--color-ink)]">[settings]</h2>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <Input
              label="Combo Name"
              value={name}
              onChange={(e) => { setName(e.target.value); validateName(e.target.value); }}
              onBlur={handleSaveName}
              error={nameError}
            />
            <p className="text-[11px] text-[var(--color-mute)] mt-1 font-mono">
              Only letters, numbers, -, _ and .
            </p>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-[var(--color-hairline)]">
            <div>
              <p className="text-xs sm:text-sm font-bold text-[var(--color-ink)]">Round Robin</p>
              <p className="text-xs text-[var(--color-mute)]">
                Rotate providers across requests instead of strict priority fallback.
              </p>
            </div>
            <Toggle checked={roundRobin} onChange={handleToggleRoundRobin} />
          </div>
        </div>
      </div>

      {/* Providers Card */}
      <div className="border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 rounded-none">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4 pb-2 border-b border-[var(--color-hairline)]">
          <div>
            <h2 className="text-sm font-bold text-[var(--color-ink)]">[providers]</h2>
            <p className="text-xs text-[var(--color-mute)]">
              Tried in order (top-down) or rotated when round-robin is enabled.
            </p>
          </div>
          <div className="self-start sm:self-auto">
            <Button size="sm" icon="add" onClick={() => setShowPicker(true)}>
              Add Provider
            </Button>
          </div>
        </div>

        {providers.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-[var(--color-hairline)] rounded-none text-[var(--color-mute)] text-xs">
            [-] No providers added yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {providers.map((entry, idx) => {
              const { providerId, model } = parseModelEntry(entry);
              const p = AI_PROVIDERS[providerId];
              return (
                <div
                  key={`${entry}-${idx}`}
                  className="flex items-center gap-2.5 sm:gap-3 p-2.5 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] rounded-[4px]"
                >
                  <span className="text-xs text-[var(--color-mute)] font-mono w-6 text-center shrink-0">
                    #{idx + 1}
                  </span>
                  <div className="size-6 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-canvas)] flex items-center justify-center shrink-0">
                    <ProviderIcon
                      src={`/providers/${providerId}.png`}
                      alt={p?.name || providerId}
                      size={20}
                      className="object-contain rounded-[4px] max-w-[20px] max-h-[20px]"
                      fallbackText={p?.textIcon || providerId.slice(0, 2).toUpperCase()}
                      fallbackColor={p?.color}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-sm font-bold text-[var(--color-ink)] truncate">
                      {p?.name || providerId}
                    </div>
                    {model && (
                      <code className="text-[11px] text-[var(--color-mute)] font-mono truncate block">
                        {model}
                      </code>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMove(idx, -1)}
                      disabled={idx === 0}
                      className="px-2 py-1 text-xs border border-[var(--color-hairline)] rounded-[4px] text-[var(--color-ink)] hover:bg-[var(--color-surface-card)] disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      [^]
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 1)}
                      disabled={idx === providers.length - 1}
                      className="px-2 py-1 text-xs border border-[var(--color-hairline)] rounded-[4px] text-[var(--color-ink)] hover:bg-[var(--color-surface-card)] disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      [v]
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveProvider(idx)}
                      className="px-2 py-1 text-xs border border-[var(--color-danger)]/40 rounded-[4px] text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
                      title="Remove"
                    >
                      [x]
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Test Example Card */}
      {combo.kind && examplePath && (
        <div className="border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 rounded-none">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4 pb-2 border-b border-[var(--color-hairline)]">
            <h2 className="text-sm font-bold text-[var(--color-ink)]">[test example]</h2>
            <div className="self-start sm:self-auto">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || providers.length === 0}
                className="inline-flex items-center justify-center rounded-[4px] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-on-primary)] text-xs font-bold px-3.5 py-1.5 min-h-[36px] transition-colors disabled:opacity-50 touch-manipulation"
              >
                {testing ? "[running...]" : "[run test]"}
              </button>
            </div>
          </div>
          <pre className="bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-[4px] p-3 text-xs text-[var(--color-ink)] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
            {curlExample}
          </pre>
          {testError && (
            <div className="mt-3 border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)] p-3 rounded-[4px] text-xs break-words">
              {testError}
            </div>
          )}
          {testResult && (
            <div className="mt-3 flex flex-col gap-3">
              {testResult.latencyMs != null && (
                <span className="text-xs text-[var(--color-success)] font-medium">
                  [{testResult.latencyMs}ms]
                </span>
              )}
              {testResult.imageUrl && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-end">
                    <a
                      href={testResult.imageUrl}
                      download="image.png"
                      className="inline-flex items-center gap-1 text-xs border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] hover:bg-[var(--color-surface-card)] px-3 py-1.5 text-[var(--color-ink)] transition-colors min-h-[32px]"
                    >
                      [download]
                    </a>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={testResult.imageUrl}
                    alt="Generated"
                    className="max-w-full rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-surface-soft)]"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              )}
              {testResult.audioUrl && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-end">
                    <a
                      href={testResult.audioUrl}
                      download="speech.mp3"
                      className="inline-flex items-center gap-1 text-xs border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] hover:bg-[var(--color-surface-card)] px-3 py-1.5 text-[var(--color-ink)] transition-colors min-h-[32px]"
                    >
                      [download]
                    </a>
                  </div>
                  <audio controls src={testResult.audioUrl} className="w-full rounded-[4px] min-h-[44px]" />
                </div>
              )}
              {testResult.json && (
                <pre className="bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-[4px] p-3 text-xs text-[var(--color-ink)] overflow-auto max-h-[300px] whitespace-pre-wrap break-all leading-relaxed">
                  {testResult.json}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* Usage Logs Card */}
      <div className="border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 rounded-none">
        <h2 className="text-sm font-bold text-[var(--color-ink)] mb-3 pb-2 border-b border-[var(--color-hairline)]">
          [usage logs]
        </h2>
        {logs.length === 0 ? (
          <p className="text-xs text-[var(--color-mute)]">[-] No usage recorded yet.</p>
        ) : (
          <pre className="bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-[4px] p-3 text-xs text-[var(--color-ink)] overflow-auto max-h-[400px] whitespace-pre-wrap leading-relaxed">
            {logs.join("\n")}
          </pre>
        )}
      </div>

      {showPicker && (
        <ModelSelectModal
          isOpen={showPicker}
          onClose={() => setShowPicker(false)}
          onSelect={handleAddModel}
          onDeselect={handleDeselectModel}
          activeProviders={connections}
          modelAliases={modelAliases}
          title={`Add ${kindLabel} Model`}
          kindFilter={combo.kind}
          addedModelValues={providers}
          closeOnSelect={false}
        />
      )}
    </div>
  );
}
