"use client";

import { useState, useEffect } from "react";
import { getProviderAlias, isCustomEmbeddingProvider } from "@/shared/constants/providers";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { Row } from "./exampleShared";

const getTimestamp = () => Date.now();

const DEFAULT_RESPONSE_EXAMPLE = `{
  "object": "list",
  "data": [{
    "object": "embedding",
    "index": 0,
    "embedding": [0.002301, -0.019212, 0.004815, -0.031249, ...]
  }],
  "model": "...",
  "usage": { "prompt_tokens": 9, "total_tokens": 9 }
}`;

export function EmbeddingExampleCard({ providerId, customAlias }) {
  const isCustom = isCustomEmbeddingProvider(providerId);
  const providerAlias = isCustom ? (customAlias || providerId) : getProviderAlias(providerId);
  const embeddingModels = isCustom ? [] : getModelsByProviderId(providerId).filter((m) => getModelKind(m) === "embedding");

  const [selectedModel, setSelectedModel] = useState(embeddingModels[0]?.id ?? "");
  const [input, setInput] = useState("The quick brown fox jumps over the lazy dog");
  const [dimensions, setDimensions] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [useTunnel, setUseTunnel] = useState(false);
  const [localEndpoint, setLocalEndpoint] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : ""
  );
  const [tunnelEndpoint, setTunnelEndpoint] = useState("");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const { copied: copiedCurl, copy: copyCurl } = useCopyToClipboard();
  const { copied: copiedRes, copy: copyRes } = useCopyToClipboard();

  useEffect(() => {
    fetch("/api/keys")
      .then((r) => r.json())
      .then((d) => { setApiKey((d.keys || []).find((k) => k.isActive !== false)?.key || ""); })
      .catch(() => {});
    fetch("/api/tunnel/status")
      .then((r) => r.json())
      .then((d) => { if (d.publicUrl) setTunnelEndpoint(d.publicUrl); })
      .catch(() => {});
  }, []);

  const endpoint = useTunnel ? tunnelEndpoint : localEndpoint;
  const modelFull = selectedModel ? `${providerAlias}/${selectedModel}` : "";

  // Build request body — include dimensions only if user provided a positive number
  const buildBody = () => {
    const body = { model: modelFull, input: input.trim() };
    const dim = Number(dimensions);
    if (dimensions && Number.isFinite(dim) && dim > 0) body.dimensions = dim;
    return body;
  };

  const curlSnippet = `curl -X POST ${endpoint}/v1/embeddings \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey || "YOUR_KEY"}" \\
  -d '${JSON.stringify(buildBody())}'`;

  const handleRun = async () => {
    if (!input.trim() || !modelFull) return;
    setRunning(true);
    setError("");
    setResult(null);
    const start = getTimestamp();
    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const res = await fetch("/api/v1/embeddings", {
        method: "POST",
        headers,
        body: JSON.stringify(buildBody()),
      });
      const latencyMs = getTimestamp() - start;
      const data = await res.json();
      if (!res.ok) { setError(data?.error?.message || data?.error || `HTTP ${res.status}`); return; }
      setResult({ data, latencyMs });
    } catch (e) {
      setError(e.message || "Network error");
    } finally {
      setRunning(false);
    }
  };

  // Compact embedding array: first 4 values + count
  const formatResultJson = (data) => {
    if (!data) return DEFAULT_RESPONSE_EXAMPLE;
    const clone = JSON.parse(JSON.stringify(data));
    (clone.data || []).forEach((item) => {
      if (Array.isArray(item.embedding) && item.embedding.length > 4) {
        item.embedding = [...item.embedding.slice(0, 4).map((v) => parseFloat(v.toFixed(6))), `... (${item.embedding.length} dims)`];
      }
    });
    return JSON.stringify(clone, null, 2);
  };

  const resultJson = result ? JSON.stringify(result.data, null, 2) : "";

  return (
    <div className="border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 rounded-none font-mono">
      <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-[var(--color-hairline)]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-mute)]">[test]</span>
          <h2 className="text-sm sm:text-base font-bold text-[var(--color-ink)]">
            Embedding Example
          </h2>
        </div>
        {result && (
          <span className="text-xs text-[var(--color-success)] font-medium">
            [{result.latencyMs}ms]
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {/* Model */}
        <Row label="Model">
          {isCustom ? (
            <input
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              placeholder="e.g. voyage-3, embed-english-v3.0, text-embedding-3-small"
              className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
            />
          ) : (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
            >
              {embeddingModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.id}</option>
              ))}
            </select>
          )}
        </Row>

        {/* Endpoint */}
        <Row label="Endpoint">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={endpoint}
              onChange={(e) => useTunnel ? setTunnelEndpoint(e.target.value) : setLocalEndpoint(e.target.value)}
              className="w-full min-w-0 flex-1 px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
              placeholder="http://localhost:20128"
            />
            {tunnelEndpoint && (
              <button
                type="button"
                onClick={() => setUseTunnel((v) => !v)}
                title={useTunnel ? "Using tunnel" : "Using local"}
                className={`flex items-center justify-center gap-1 text-xs px-3 py-2 rounded-[4px] border shrink-0 transition-colors min-h-[38px] ${
                  useTunnel
                    ? "border-[var(--color-ink)] bg-[var(--color-surface-card)] text-[var(--color-ink)] font-bold"
                    : "border-[var(--color-hairline)] text-[var(--color-mute)] hover:text-[var(--color-ink)]"
                }`}
              >
                [tunnel]
              </button>
            )}
          </div>
        </Row>

        {/* API Key */}
        <Row label="API Key">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
          />
        </Row>

        {/* Input */}
        <Row label="Input">
          <div className="relative w-full">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full px-3 py-2 pr-8 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
            />
            {input && (
              <button
                type="button"
                onClick={() => setInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-mute)] hover:text-[var(--color-ink)] text-xs p-1"
              >
                [x]
              </button>
            )}
          </div>
        </Row>

        {/* Dimensions */}
        <Row label="Dimensions">
          <input
            type="number"
            min="1"
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
            placeholder="optional, e.g. 512, 1024 (leave empty for default)"
            className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
          />
        </Row>

        {/* Request snippet & Run CTA */}
        <div className="mt-1 flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span className="text-xs text-[var(--color-mute)] uppercase tracking-wider">
              &gt; Request (cURL)
            </span>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => copyCurl(curlSnippet)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 text-xs border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] hover:bg-[var(--color-surface-card)] px-3 py-1.5 min-h-[36px] text-[var(--color-ink)] transition-colors"
              >
                {copiedCurl ? "[copied]" : "[copy]"}
              </button>
              <button
                type="button"
                onClick={handleRun}
                disabled={running || !input.trim() || !modelFull}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 text-xs rounded-[4px] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-on-primary)] px-4 py-1.5 min-h-[36px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
              >
                {running ? "[running...]" : "[run]"}
              </button>
            </div>
          </div>
          <pre className="bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-[4px] p-3 text-xs text-[var(--color-ink)] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
            {curlSnippet}
          </pre>
        </div>

        {/* Error */}
        {error && (
          <div className="border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)] p-3 rounded-[4px] text-xs break-words">
            {error}
          </div>
        )}

        {/* Response */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-mute)] uppercase tracking-wider">
              &gt; Response
            </span>
            {result && (
              <button
                type="button"
                onClick={() => copyRes(resultJson)}
                className="inline-flex items-center gap-1 text-xs border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] hover:bg-[var(--color-surface-card)] px-2.5 py-1 text-[var(--color-ink)] transition-colors"
              >
                {copiedRes ? "[copied]" : "[copy]"}
              </button>
            )}
          </div>
          <pre className="bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-[4px] p-3 text-xs text-[var(--color-ink)] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed opacity-90">
            {formatResultJson(result?.data)}
          </pre>
        </div>
      </div>
    </div>
  );
}
