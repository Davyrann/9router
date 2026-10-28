"use client";

import { useState, useEffect } from "react";
import { getProviderAlias } from "@/shared/constants/providers";
import { getModelKind, getModelsByProviderId } from "@/shared/constants/models";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { Row } from "./exampleShared";

const getTimestamp = () => Date.now();

export function SttExampleCard({ providerId }) {
  const providerAlias = getProviderAlias(providerId);
  const builtinSttModels = getModelsByProviderId(providerId).filter((m) => getModelKind(m) === "stt");
  const [customSttModels, setCustomSttModels] = useState([]);
  const sttModels = [...builtinSttModels, ...customSttModels];

  const [selectedModel, setSelectedModel] = useState(builtinSttModels[0]?.id ?? "");
  const selectedModelObj = sttModels.find((m) => m.id === selectedModel);
  const allowedParams = Array.isArray(selectedModelObj?.params) ? selectedModelObj.params : [];
  const responseFormats = selectedModelObj?.responseFormats || ["json", "text", "srt", "verbose_json", "vtt"];

  const [audioFile, setAudioFile] = useState(null);
  const [language, setLanguage] = useState("");
  const [prompt, setPrompt] = useState("");
  const [responseFormat, setResponseFormat] = useState("json");
  const [temperature, setTemperature] = useState("");
  const [granularity, setGranularity] = useState("");
  const [tagAudioEvents, setTagAudioEvents] = useState(false);
  const [diarize, setDiarize] = useState(false);
  const [numSpeakers, setNumSpeakers] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [useTunnel, setUseTunnel] = useState(false);
  const [localEndpoint, setLocalEndpoint] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : ""
  );
  const [tunnelEndpoint, setTunnelEndpoint] = useState("");
  const [result, setResult] = useState(null);
  const [latency, setLatency] = useState(null);
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
    const loadCustom = () => {
      fetch("/api/models/custom", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          const list = (d.models || []).filter((m) => getModelKind(m) === "stt" && m.providerAlias === providerAlias);
          setCustomSttModels(list);
        })
        .catch(() => {});
    };
    loadCustom();
    window.addEventListener("focus", loadCustom);
    window.addEventListener("customModelChanged", loadCustom);
    return () => {
      window.removeEventListener("focus", loadCustom);
      window.removeEventListener("customModelChanged", loadCustom);
    };
  }, [providerAlias]);

  const endpoint = useTunnel ? tunnelEndpoint : localEndpoint;
  const modelFull = selectedModel ? `${providerAlias}/${selectedModel}` : "";

  const curlSnippet = `curl -X POST ${endpoint}/v1/audio/transcriptions \\
  -H "Authorization: Bearer ${apiKey || "YOUR_KEY"}" \\
  -F "file=@${audioFile?.name || "audio.mp3"}" \\
  -F "model=${modelFull}"${allowedParams.includes("language") && language ? ` \\\n  -F "language=${language}"` : ""}${allowedParams.includes("response_format") ? ` \\\n  -F "response_format=${responseFormat}"` : ""}${allowedParams.includes("temperature") && temperature ? ` \\\n  -F "temperature=${temperature}"` : ""}${allowedParams.includes("prompt") && prompt ? ` \\\n  -F "prompt=${prompt}"` : ""}${allowedParams.includes("timestamps_granularity") && granularity ? ` \\\n  -F "timestamps_granularity=${granularity}"` : ""}${allowedParams.includes("tag_audio_events") && tagAudioEvents ? ` \\\n  -F "tag_audio_events=true"` : ""}${allowedParams.includes("diarize") && diarize ? ` \\\n  -F "diarize=true"` : ""}${allowedParams.includes("num_speakers") && !diarize && numSpeakers ? ` \\\n  -F "num_speakers=${numSpeakers}"` : ""}`;

  const handleRun = async () => {
    if (!audioFile || !modelFull) return;
    setRunning(true);
    setError("");
    setResult(null);
    const start = getTimestamp();
    try {
      const fd = new FormData();
      fd.append("file", audioFile);
      fd.append("model", modelFull);
      if (allowedParams.includes("language") && language) fd.append("language", language);
      if (allowedParams.includes("response_format")) fd.append("response_format", responseFormat);
      if (allowedParams.includes("temperature") && temperature) fd.append("temperature", temperature);
      if (allowedParams.includes("prompt") && prompt) fd.append("prompt", prompt);
      if (allowedParams.includes("timestamps_granularity") && granularity) {
        fd.append("timestamps_granularity", granularity);
      }
      if (allowedParams.includes("tag_audio_events") && tagAudioEvents) {
        fd.append("tag_audio_events", "true");
      }
      // diarize and num_speakers are mutually exclusive upstream — only one goes out.
      if (allowedParams.includes("diarize") && diarize) {
        fd.append("diarize", "true");
      } else if (allowedParams.includes("num_speakers") && numSpeakers) {
        fd.append("num_speakers", numSpeakers);
      }

      const headers = {};
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const res = await fetch("/api/v1/audio/transcriptions", { method: "POST", headers, body: fd });
      setLatency(getTimestamp() - start);
      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json() : await res.text();
      if (!res.ok) {
        setError(data?.error?.message || data?.error || data || `HTTP ${res.status}`);
        return;
      }
      setResult(data);
    } catch (e) {
      setError(e.message || "Network error");
    } finally {
      setRunning(false);
    }
  };

  const resultStr = typeof result === "string" ? result : (result ? JSON.stringify(result, null, 2) : `{\n  "text": "Hello world..."\n}`);

  return (
    <div className="border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 rounded-none font-mono">
      <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-[var(--color-hairline)]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-mute)]">[test]</span>
          <h2 className="text-sm sm:text-base font-bold text-[var(--color-ink)]">
            STT Transcription Example
          </h2>
        </div>
        {result && latency && (
          <span className="text-xs text-[var(--color-success)] font-medium">
            [{latency}ms]
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {/* Model */}
        {sttModels.length > 0 ? (
          <Row label="Model">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
            >
              {sttModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.id}</option>
              ))}
            </select>
          </Row>
        ) : (
          <Row label="Model">
            <input
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              placeholder="Enter model id"
              className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
            />
          </Row>
        )}

        {/* Endpoint */}
        <Row label="Endpoint">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <span className="w-full min-w-0 flex-1 px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] truncate min-h-[38px] flex items-center">
              {endpoint}/v1/audio/transcriptions
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

        {/* Audio file */}
        <Row label="Audio File">
          <div className="flex flex-col gap-2 w-full">
            <input
              type="file"
              accept="audio/*,video/mp4,.m4a,.mp3,.wav,.ogg,.flac,.webm,.opus"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-[var(--color-mute)] file:mr-3 file:py-1.5 file:px-3 file:rounded-[4px] file:border file:border-[var(--color-hairline)] file:bg-[var(--color-surface-soft)] file:text-[var(--color-ink)] file:font-mono hover:file:bg-[var(--color-surface-card)] file:cursor-pointer min-h-[38px]"
            />
            {audioFile && (
              <span className="text-xs text-[var(--color-mute)] font-mono">
                [file] {audioFile.name} · {(audioFile.size / 1024).toFixed(1)} KB
              </span>
            )}
          </div>
        </Row>

        {/* Language (if model supports) */}
        {allowedParams.includes("language") && (
          <Row label="Language">
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="e.g. en, vi, ja (auto-detect if empty)"
              className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
            />
          </Row>
        )}

        {/* Prompt (if model supports) */}
        {allowedParams.includes("prompt") && (
          <Row label="Prompt">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="optional context to improve accuracy"
              className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
            />
          </Row>
        )}

        {/* Temperature (if model supports) */}
        {allowedParams.includes("temperature") && (
          <Row label="Temperature">
            <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="0 - 1 (default 0)"
              className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
            />
          </Row>
        )}

        {/* Response format (if model supports) */}
        {allowedParams.includes("response_format") && (
          <Row label="Format">
            <select
              value={responseFormat}
              onChange={(e) => setResponseFormat(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
            >
              {responseFormats.map((format) => <option key={format} value={format}>{format}</option>)}
            </select>
          </Row>
        )}

        {/* Timestamps */}
        {allowedParams.includes("timestamps_granularity") && (
          <Row label="Timestamps">
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
            >
              <option value="">provider default</option>
              <option value="word">word</option>
              <option value="character">character</option>
              <option value="none">none</option>
            </select>
          </Row>
        )}

        {/* Tag audio events */}
        {allowedParams.includes("tag_audio_events") && (
          <Row label="Audio events">
            <label className="flex items-center gap-2 text-xs sm:text-sm text-[var(--color-ink)] cursor-pointer">
              <input
                type="checkbox"
                checked={tagAudioEvents}
                onChange={(e) => setTagAudioEvents(e.target.checked)}
                className="rounded-[4px] accent-[var(--color-ink)]"
              />
              <span>[+] Non-speech sounds ([laughter], [applause])</span>
            </label>
          </Row>
        )}

        {/* Speaker labels */}
        {allowedParams.includes("diarize") && (
          <Row label="Diarize">
            <label className="flex items-center gap-2 text-xs sm:text-sm text-[var(--color-ink)] cursor-pointer">
              <input
                type="checkbox"
                checked={diarize}
                onChange={(e) => setDiarize(e.target.checked)}
                className="rounded-[4px] accent-[var(--color-ink)]"
              />
              <span>[+] Auto-detect speakers (overrides count)</span>
            </label>
          </Row>
        )}

        {/* Speaker count */}
        {allowedParams.includes("num_speakers") && (
          <Row label="Speakers">
            <input
              type="number"
              step="1"
              min="1"
              max="32"
              value={numSpeakers}
              onChange={(e) => setNumSpeakers(e.target.value)}
              disabled={diarize}
              placeholder="auto-detect"
              className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors disabled:opacity-50"
            />
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
                disabled={running || !audioFile || !modelFull}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 text-xs rounded-[4px] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-on-primary)] px-4 py-1.5 min-h-[36px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
              >
                {running ? "[transcribing...]" : "[transcribe]"}
              </button>
            </div>
          </div>
          <pre className="bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-[4px] p-3 text-xs text-[var(--color-ink)] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
            {curlSnippet}
          </pre>
        </div>

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
                onClick={() => copyRes(resultStr)}
                className="inline-flex items-center gap-1 text-xs border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] hover:bg-[var(--color-surface-card)] px-2.5 py-1 text-[var(--color-ink)] transition-colors"
              >
                {copiedRes ? "[copied]" : "[copy]"}
              </button>
            )}
          </div>
          <pre className="bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-[4px] p-3 text-xs text-[var(--color-ink)] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed opacity-90">
            {resultStr}
          </pre>
        </div>
      </div>
    </div>
  );
}
