"use client";

import { useState, useEffect } from "react";
import { MEDIA_PROVIDER_KINDS, getProviderAlias, resolveProviderId } from "@/shared/constants/providers";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { Row, KIND_EXAMPLE_CONFIG } from "./exampleShared";

const getTimestamp = () => Date.now();

const CLOUDFLARE_TEST_IMAGE_URL = "https://pub-1fb693cb11cc46b2b2f656f51e015a2c.r2.dev/dog.png";
const CLOUDFLARE_TEST_MASK_URL = "https://pub-1fb693cb11cc46b2b2f656f51e015a2c.r2.dev/dog-mask.png";
// HuggingFace router edit models need a source image; reuse the public dog sample so
// the card is runnable as-is. The router derives it from inputs, not from the Hub host.
const HUGGINGFACE_TEST_IMAGE_URL = CLOUDFLARE_TEST_IMAGE_URL;

function getImageEditDefaults(providerId, modelId) {
  if (providerId === "huggingface") {
    return { image: HUGGINGFACE_TEST_IMAGE_URL };
  }
  if (providerId !== "cloudflare-ai") return {};
  if (modelId === "@cf/runwayml/stable-diffusion-v1-5-img2img") {
    return { image: CLOUDFLARE_TEST_IMAGE_URL };
  }
  if (modelId === "@cf/runwayml/stable-diffusion-v1-5-inpainting") {
    return { image: CLOUDFLARE_TEST_IMAGE_URL, mask_image: CLOUDFLARE_TEST_MASK_URL };
  }
  return {};
}

function toImagePreviewSrc(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return "";
  if (/^(data:image\/|https?:\/\/)/i.test(trimmed)) return trimmed;
  return `data:image/png;base64,${trimmed}`;
}

export function GenericExampleCard({ providerId, kind }) {
  const providerAlias = getProviderAlias(providerId);
  const resolvedId = resolveProviderId(providerAlias);
  const safeProviderAlias = resolvedId === providerId ? providerAlias : providerId;
  const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kind);
  const exConfig = KIND_EXAMPLE_CONFIG[kind];
  const safeExConfig = exConfig || {};

  // Get models for this kind (e.g., type="image")
  const kindModels = getModelsByProviderId(providerId).filter((m) => getModelKind(m) === kind);
  // Kinds that need a model identifier in the request (image/video/music/systemone)
  const KIND_NEEDS_MODEL = new Set(["image", "video", "music", "imageToText", "systemone"]);
  const needsModel = KIND_NEEDS_MODEL.has(kind);
  const allowManualModel = needsModel && kindModels.length === 0;
  const [selectedModel, setSelectedModel] = useState(kindModels[0]?.id ?? "");
  const selectedModelObj = kindModels.find((m) => m.id === selectedModel);
  const supportsEdit = !!selectedModelObj?.capabilities?.includes("edit");
  const supportsMask = !!selectedModelObj?.capabilities?.includes("mask");

  const [input, setInput] = useState(safeExConfig.defaultInput || "");
  const [question, setQuestion] = useState("Does this request require urgent attention?");
  const [refImage, setRefImage] = useState("");
  const [maskImage, setMaskImage] = useState("");
  const [extraValues, setExtraValues] = useState(() =>
    (safeExConfig.extraFields || []).reduce((acc, f) => { acc[f.key] = f.default ?? ""; return acc; }, {})
  );
  const [apiKey, setApiKey] = useState("");
  const [useTunnel, setUseTunnel] = useState(false);
  const [localEndpoint, setLocalEndpoint] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : ""
  );
  const [tunnelEndpoint, setTunnelEndpoint] = useState("");
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null); // { stage, bytesReceived }
  const [partialImage, setPartialImage] = useState(null);
  const [imageOutputFormat, setImageOutputFormat] = useState("json"); // json | binary
  const [binaryImageUrl, setBinaryImageUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [connections, setConnections] = useState([]);
  const [pinnedConnectionId, setPinnedConnectionId] = useState("");
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
    // Load active connections of this provider for pinning
    fetch("/api/providers/client")
      .then((r) => r.json())
      .then((d) => {
        const conns = (d.connections || []).filter((c) => c.provider === providerId && c.isActive !== false);
        setConnections(conns);
      })
      .catch(() => {});
  }, [providerId]);

  if (!kindConfig || !exConfig) return null;

  const endpoint = useTunnel ? tunnelEndpoint : localEndpoint;
  const apiPath = kindConfig.endpoint.path;
  const modelFull = !needsModel
    ? safeProviderAlias
    : (selectedModel ? `${safeProviderAlias}/${selectedModel}` : (allowManualModel ? "" : safeProviderAlias));
  const imageEditDefaults = getImageEditDefaults(providerId, selectedModel);
  const effectiveRefImage = refImage.trim() || imageEditDefaults.image || "";
  const effectiveMaskImage = maskImage.trim() || imageEditDefaults.mask_image || "";
  const refImagePreviewSrc = toImagePreviewSrc(effectiveRefImage);
  const maskImagePreviewSrc = toImagePreviewSrc(effectiveMaskImage);

  // Build JSON body for cURL and test run
  const requestBody = (() => {
    if (kind === "systemone") {
      const qKey = "is_urgent";
      return {
        state: input.trim(),
        questions: {
          [qKey]: {
            type: "noul",
            instructions: question.trim() || "Does this request require urgent attention?",
          },
        },
      };
    }
    const b = { [exConfig.bodyKey]: input.trim() };
    if (kind === "image" && supportsEdit && effectiveRefImage) {
      b.image = effectiveRefImage;
    }
    if (kind === "image" && supportsMask && effectiveMaskImage) {
      b.mask_image = effectiveMaskImage;
    }
    for (const [k, v] of Object.entries(extraValues)) {
      if (v !== "" && v !== null && v !== undefined) b[k] = v;
    }
    return b;
  })();

  const useStreaming = kind === "image" && (selectedModelObj?.capabilities || []).includes("stream");
  const apiPathWithQuery = kind === "image" && imageOutputFormat === "binary"
    ? `${apiPath}?response_format=binary`
    : apiPath;

  const curlSnippet = `curl -X POST ${endpoint}${apiPathWithQuery} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey || "YOUR_KEY"}" \\${pinnedConnectionId ? `\n  -H "x-connection-id: ${pinnedConnectionId}" \\` : ""}${useStreaming ? '\n  -H "Accept: text/event-stream" \\' : ""}
  -d '${JSON.stringify({ ...requestBody, model: modelFull })}'`;

  const handleRun = async () => {
    if (!input.trim() || !modelFull) return;
    setRunning(true);
    setError("");
    setResult(null);
    setProgress(null);
    setPartialImage(null);
    if (binaryImageUrl) { try { URL.revokeObjectURL(binaryImageUrl); } catch {} setBinaryImageUrl(""); }
    const start = getTimestamp();
    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      if (pinnedConnectionId) headers["x-connection-id"] = pinnedConnectionId;
      if (useStreaming) headers["Accept"] = "text/event-stream";
      const body = { ...requestBody, model: modelFull };
      const res = await fetch(`/api${apiPathWithQuery}`, {
        method: kindConfig.endpoint.method,
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message || data?.error || `HTTP ${res.status}`);
        return;
      }
      const ctype = res.headers.get("content-type") || "";
      // Binary image response — convert to blob URL
      if (ctype.startsWith("image/")) {
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        setBinaryImageUrl(objUrl);
        setResult({ data: { binary: true, mime: ctype, size: blob.size }, latencyMs: getTimestamp() - start });
        return;
      }
      const isSse = ctype.includes("text/event-stream");
      if (isSse && res.body) {
        // Parse SSE: progress / partial_image / done / error
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let finalData = null;
        let streamErr = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let sep;
          while ((sep = buf.indexOf("\n\n")) !== -1) {
            const block = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            let evt = null, dataStr = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) evt = line.slice(6).trim();
              else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
            }
            if (!evt) continue;
            try {
              const payload = dataStr ? JSON.parse(dataStr) : {};
              if (evt === "progress") setProgress(payload);
              else if (evt === "partial_image") setPartialImage(payload);
              else if (evt === "done") finalData = payload;
              else if (evt === "error") streamErr = payload?.message || "Stream error";
            } catch {}
          }
        }
        const latencyMs = getTimestamp() - start;
        if (streamErr) { setError(streamErr); return; }
        if (finalData) setResult({ data: finalData, latencyMs });
      } else {
        const data = await res.json();
        const latencyMs = getTimestamp() - start;
        setResult({ data, latencyMs });
      }
    } catch (e) {
      setError(e.message || "Network error");
    } finally {
      setRunning(false);
    }
  };

  // Mask large b64_json strings in JSON view to keep it readable
  const maskB64 = (obj) => {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(maskB64);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = (k === "b64_json" && typeof v === "string" && v.length > 100)
        ? `<${v.length} chars base64>`
        : maskB64(v);
    }
    return out;
  };
  const resultJson = result ? JSON.stringify(maskB64(result.data), null, 2) : "";

  return (
    <div className="border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 rounded-none font-mono">
      <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-[var(--color-hairline)]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-mute)]">[test]</span>
          <h2 className="text-sm sm:text-base font-bold text-[var(--color-ink)]">
            {kindConfig.label} Example
          </h2>
        </div>
        {result && (
          <span className="text-xs text-[var(--color-success)] font-medium">
            [{result.latencyMs}ms]
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {/* Model selector */}
        {kindModels.length > 0 ? (
          <Row label="Model">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
            >
              {kindModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.id}</option>
              ))}
            </select>
          </Row>
        ) : allowManualModel ? (
          <Row label="Model">
            <input
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              placeholder="Enter model id (provider-specific)"
              className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
            />
          </Row>
        ) : null}

        {/* Endpoint */}
        <Row label="Endpoint">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <span className="w-full min-w-0 flex-1 px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] truncate min-h-[38px] flex items-center">
              {endpoint}{apiPath}
            </span>
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
          <span className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] truncate block min-h-[38px] flex items-center">
            {apiKey ? `${apiKey.slice(0, 8)}${"\u2022".repeat(Math.min(20, Math.max(0, apiKey.length - 8)))}` : <span className="text-[var(--color-ash)]">[-] No key configured</span>}
          </span>
        </Row>

        {/* Connection picker */}
        {connections.length > 0 && (
          <Row label="Connection">
            <select
              value={pinnedConnectionId}
              onChange={(e) => setPinnedConnectionId(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
            >
              <option value="">Auto (by priority)</option>
              {connections.map((c) => {
                const plan = c.providerSpecificData?.chatgptPlanType;
                const label = c.email || c.name || c.id.slice(0, 8);
                return (
                  <option key={c.id} value={c.id}>
                    {label}{plan ? ` [${plan}]` : ""}
                  </option>
                );
              })}
            </select>
          </Row>
        )}

        {/* Input */}
        <Row label={exConfig.inputLabel}>
          <div className="relative w-full">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={exConfig.inputPlaceholder}
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

        {/* Question for System One */}
        {kind === "systemone" && (
          <Row label="Question">
            <div className="relative w-full">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Enter evaluation question or criteria"
                className="w-full px-3 py-2 pr-8 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
              />
              {question && (
                <button
                  type="button"
                  onClick={() => setQuestion("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-mute)] hover:text-[var(--color-ink)] text-xs p-1"
                >
                  [x]
                </button>
              )}
            </div>
          </Row>
        )}

        {/* Reference image (only for edit-capable image models) */}
        {supportsEdit && (
          <Row label="Ref Image">
            <div className="flex flex-col gap-2 w-full">
              <div className="relative w-full">
                <input
                  value={refImage}
                  onChange={(e) => setRefImage(e.target.value)}
                  placeholder={imageEditDefaults.image || "https://example.com/source.png"}
                  className="w-full px-3 py-2 pr-8 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
                />
                {refImage && (
                  <button
                    type="button"
                    onClick={() => setRefImage("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-mute)] hover:text-[var(--color-ink)] text-xs p-1"
                  >
                    [x]
                  </button>
                )}
              </div>
              {refImagePreviewSrc && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={refImagePreviewSrc}
                  alt="Reference"
                  className="max-h-40 rounded-[4px] border border-[var(--color-hairline)] object-contain bg-[var(--color-surface-soft)]"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                  onLoad={(e) => { e.currentTarget.style.display = "block"; }}
                  loading="lazy"
                  decoding="async"
                />
              )}
            </div>
          </Row>
        )}

        {supportsMask && (
          <Row label="Mask">
            <div className="flex flex-col gap-2 w-full">
              <div className="relative w-full">
                <input
                  value={maskImage}
                  onChange={(e) => setMaskImage(e.target.value)}
                  placeholder={imageEditDefaults.mask_image || "https://example.com/mask.png"}
                  className="w-full px-3 py-2 pr-8 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
                />
                {maskImage && (
                  <button
                    type="button"
                    onClick={() => setMaskImage("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-mute)] hover:text-[var(--color-ink)] text-xs p-1"
                  >
                    [x]
                  </button>
                )}
              </div>
              {maskImagePreviewSrc && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={maskImagePreviewSrc}
                  alt="Mask"
                  className="max-h-40 rounded-[4px] border border-[var(--color-hairline)] object-contain bg-[var(--color-surface-soft)]"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                  onLoad={(e) => { e.currentTarget.style.display = "block"; }}
                  loading="lazy"
                  decoding="async"
                />
              )}
            </div>
          </Row>
        )}

        {/* Extra fields */}
        {(exConfig.extraFields || [])
          .filter((f) => kindModels.length === 0 || (Array.isArray(selectedModelObj?.params) && selectedModelObj.params.includes(f.key)))
          .map((f) => (
          <Row key={f.key} label={f.label}>
            {f.type === "select" ? (
              <select
                value={extraValues[f.key] ?? ""}
                onChange={(e) => setExtraValues((s) => ({ ...s, [f.key]: e.target.value }))}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
              >
                {(f.options || []).map((opt) => (
                  <option key={opt} value={opt}>{opt === "" ? "(default)" : opt}</option>
                ))}
              </select>
            ) : f.type === "text" ? (
              <input
                type="text"
                value={extraValues[f.key] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => setExtraValues((s) => ({ ...s, [f.key]: e.target.value }))}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
              />
            ) : (
              <input
                type="number"
                value={extraValues[f.key] ?? ""}
                min={f.min}
                max={f.max}
                onChange={(e) => setExtraValues((s) => ({ ...s, [f.key]: e.target.value === "" ? "" : Number(e.target.value) }))}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
              />
            )}
          </Row>
        ))}

        {/* Output Format toggle (image only) */}
        {kind === "image" && (
          <Row label="Output Format">
            <select
              value={imageOutputFormat}
              onChange={(e) => setImageOutputFormat(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
            >
              <option value="json">JSON (Base64)</option>
              <option value="binary">Binary File</option>
            </select>
          </Row>
        )}

        {/* Request snippet & Run */}
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

        {/* Streaming progress */}
        {(running || progress) && useStreaming && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-[4px] bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] text-xs text-[var(--color-ink)]">
            <span className="text-[var(--color-mute)]">[stream]</span>
            <span>
              {progress?.stage || "processing"}
              {!running && progress?.bytesReceived ? ` · ${(progress.bytesReceived / 1024).toFixed(1)} KB` : ""}
            </span>
          </div>
        )}

        {/* Partial image preview */}
        {partialImage?.b64_json && !result && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--color-mute)] uppercase tracking-wider">
              &gt; Partial preview
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/png;base64,${partialImage.b64_json}`}
              alt="Partial"
              className="max-w-full rounded-[4px] border border-[var(--color-hairline)] opacity-85"
              loading="lazy"
              decoding="async"
            />
          </div>
        )}

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
            {result ? resultJson : exConfig.defaultResponse}
          </pre>
          {kind === "image" && (binaryImageUrl || result?.data?.data?.[0]) && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-center justify-end">
                <a
                  href={binaryImageUrl || (result?.data?.data?.[0]?.b64_json ? `data:image/png;base64,${result.data.data[0].b64_json}` : result?.data?.data?.[0]?.url || "")}
                  download="image.png"
                  className="inline-flex items-center gap-1 text-xs border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] hover:bg-[var(--color-surface-card)] px-3 py-1.5 text-[var(--color-ink)] transition-colors min-h-[32px]"
                >
                  [download]
                </a>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={binaryImageUrl || (result?.data?.data?.[0]?.b64_json ? `data:image/png;base64,${result.data.data[0].b64_json}` : result?.data?.data?.[0]?.url)}
                alt="Generated"
                className="max-w-full rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-surface-soft)]"
                loading="lazy"
                decoding="async"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
