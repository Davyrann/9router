"use client";

import { useState, useEffect } from "react";
import { AI_PROVIDERS, getProviderAlias } from "@/shared/constants/providers";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import { TTS_PROVIDER_CONFIG } from "@/shared/constants/ttsProviders";
import { translate } from "@/i18n/runtime";
import { getTtsVoicesForModel } from "open-sse/config/ttsModels.js";
import { GOOGLE_TTS_LANGUAGES } from "open-sse/config/googleTtsLanguages.js";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { Row } from "./exampleShared";

const getTimestamp = () => Date.now();

const DEFAULT_TTS_RESPONSE_EXAMPLE = `// Binary MP3 audio stream returned.
// When response_format=json:
{
  "format": "mp3",
  "audio": "<base64 encoded audio string>"
}`;

function pcmToWavBlob(pcmArrayBuffer, sampleRate = 24000, numChannels = 1) {
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmArrayBuffer.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  new Uint8Array(buffer, 44).set(new Uint8Array(pcmArrayBuffer));
  return new Blob([buffer], { type: "audio/wav" });
}

export function TtsExampleCard({ providerId }) {
  const provider = AI_PROVIDERS[providerId] || {};
  const providerAlias = getProviderAlias(providerId);
  const config = provider.ttsConfig || TTS_PROVIDER_CONFIG[providerId] || TTS_PROVIDER_CONFIG["edge-tts"] || {};
  const formatOptions = config.formatOptions || [
    { value: "mp3", label: "MP3 (Binary Audio)" },
    { value: "json", label: "JSON (Base64)" },
  ];

  const getInitialVoices = () => {
    if (config.voiceSource === "hardcoded") {
      const defaultModel = config.hasModelSelector && config.modelKey
        ? (getModelsByProviderId(config.modelKey)?.[0]?.id || "")
        : "";
      const voices = (config.voicesPerModel && defaultModel)
        ? (getTtsVoicesForModel(providerId, defaultModel) || [])
        : getModelsByProviderId(config.voiceKey || providerId).filter((m) => getModelKind(m) === "tts");
      if (voices.length) {
        if (config.hasBrowseButton) {
          const defaultVoice = voices.find((v) => v.id === "en") || voices[0];
          return {
            voices: [{ id: defaultVoice.id, name: defaultVoice.name }],
            voice: defaultVoice.id,
            voiceName: defaultVoice.name,
            lang: defaultVoice.id,
          };
        }
        return {
          voices,
          voice: voices[0].id,
          voiceName: voices[0].name || voices[0].id,
          lang: "",
        };
      }
    }
    return { voices: [], voice: "", voiceName: "", lang: "" };
  };

  const initialVoicesData = getInitialVoices();

  const [countryVoices, setCountryVoices] = useState(initialVoicesData.voices);
  const [selectedLang, setSelectedLang] = useState(initialVoicesData.lang);
  const [selectedModel, setSelectedModel] = useState(() => {
    const cfgModels = AI_PROVIDERS[providerId]?.ttsConfig?.models;
    if (cfgModels?.length) return cfgModels[0].id;
    const voiceKey = config.modelKey || providerId;
    const models = getModelsByProviderId(voiceKey).filter((m) => getModelKind(m) === "tts");
    return models[0]?.id || "";
  });
  const [selectedVoice, setSelectedVoice] = useState(initialVoicesData.voice);
  const [selectedVoiceName, setSelectedVoiceName] = useState(initialVoicesData.voiceName);
  const [voiceId, setVoiceId] = useState("");
  const [input, setInput] = useState("Today is a wonderful day to build something great!");
  const [style, setStyle] = useState("");
  const [responseFormat, setResponseFormat] = useState(() => config.defaultFormat || config.formatOptions?.[0]?.value || "mp3");
  const [apiKey, setApiKey] = useState("");
  const [useTunnel, setUseTunnel] = useState(false);
  const [localEndpoint, setLocalEndpoint] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : ""
  );
  const [tunnelEndpoint, setTunnelEndpoint] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [jsonResponse, setJsonResponse] = useState(null);
  const [latency, setLatency] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const { copied: copiedCurl, copy: copyCurl } = useCopyToClipboard();

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [languages, setLanguages] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSearch, setModalSearch] = useState("");
  const [modalError, setModalError] = useState("");
  const [byLang, setByLang] = useState({});
  const [languageHint, setLanguageHint] = useState("");
  const [connectionCount, setConnectionCount] = useState(0);

  useEffect(() => {
    fetch("/api/keys")
      .then((r) => r.json())
      .then((d) => { setApiKey((d.keys || []).find((k) => k.isActive !== false)?.key || ""); })
      .catch(() => {});
    fetch("/api/providers", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setConnectionCount((d.connections || []).filter((c) => c.provider === providerId && c.isActive !== false).length);
      })
      .catch(() => {});
    fetch("/api/tunnel/status")
      .then((r) => r.json())
      .then((d) => { if (d.publicUrl) setTunnelEndpoint(d.publicUrl); })
      .catch(() => {});

    // Re-initialize model and voice state when providerId changes
    const initialModel = (() => {
      const cfgModels = AI_PROVIDERS[providerId]?.ttsConfig?.models;
      if (cfgModels?.length) return cfgModels[0].id;
      if (config.hasModelSelector && config.modelKey) {
        const models = getModelsByProviderId(config.modelKey);
        return models?.[0]?.id || "";
      }
      return "";
    })();
    setSelectedModel(initialModel);
    setVoiceId(config.defaultVoiceId || "");
    setSelectedVoice(config.defaultVoiceId || "");
    setSelectedVoiceName("");
    setCountryVoices([]);
    setSelectedLang("");
    setResponseFormat(config.defaultFormat || config.formatOptions?.[0]?.value || "mp3");
    setAudioUrl("");
    setDownloadUrl("");

    // Pre-select default voice based on provider config
    if (config.voiceSource === "hardcoded") {
      const defaultModel = initialModel;
      // Use per-model voices if available, else flat list
      const voices = (config.voicesPerModel && defaultModel)
        ? (getTtsVoicesForModel(providerId, defaultModel) || [])
        : getModelsByProviderId(config.voiceKey || providerId).filter((m) => getModelKind(m) === "tts");
      if (voices.length) {
        if (config.hasBrowseButton) {
          // Google TTS: pre-select "en" (English) as default, show as single voice chip
          const defaultVoice = voices.find((v) => v.id === "en") || voices[0];
          setSelectedLang(defaultVoice.id);
          setSelectedVoice(defaultVoice.id);
          setSelectedVoiceName(defaultVoice.name);
          setCountryVoices([{ id: defaultVoice.id, name: defaultVoice.name }]);
        } else {
          // OpenAI/OpenRouter: set voice chips directly (no language picker)
          setCountryVoices(voices);
          setSelectedVoice(voices[0].id);
          setSelectedVoiceName(voices[0].name || voices[0].id);
          if (config.hasVoiceIdInput) setVoiceId(voices[0].id);
        }
      }
    }
    // api-language (edge-tts, local-device, elevenlabs): NO default load, wait for user to pick language
    // config (nvidia, hyperbolic, deepgram, huggingface, cartesia, playht, coqui, tortoise, inworld, qwen):
    // use ttsConfig.models for model selector; voice is empty by default (backend uses provider default)
  }, [providerId]);

  const handleModelChange = (newModel) => {
    setSelectedModel(newModel);
    if (config.voicesPerModel) {
      const voices = newModel ? (getTtsVoicesForModel(providerId, newModel) || []) : [];
      setCountryVoices(voices);
      if (voices.length) {
        setSelectedVoice(voices[0].id);
        setSelectedVoiceName(voices[0].name || voices[0].id);
      } else {
        setSelectedVoice("");
        setSelectedVoiceName("");
      }
    }
  };

  // Open modal — load language list
  const openModal = async () => {
    setModalOpen(true);
    setModalSearch("");
    setModalError("");
    if (languages.length) return;
    setModalLoading(true);
    try {
      if (config.voiceSource === "hardcoded") {
        const voiceKey = config.voiceKey || providerId;
        const voices = getModelsByProviderId(voiceKey).filter((m) => getModelKind(m) === "tts");
        const langMap = {};
        voices.forEach((v) => {
          langMap[v.id] = [{ id: v.id, name: v.name }];
        });
        setByLang(langMap);
        setLanguages(voices.map((v) => ({ code: v.id, name: v.name, voices: [{ id: v.id, name: v.name }] })));
      } else {
        const res = await fetch(config.voicesEndpoint || `/api/media-providers/tts/${providerId}/voices`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setByLang(data.byLanguage || {});
        setLanguages(data.languages || []);
      }
    } catch (e) {
      setModalError(e.message || "Failed to load voices");
    } finally {
      setModalLoading(false);
    }
  };

  const handlePickLanguage = (langObj) => {
    setSelectedLang(langObj.code);
    const voices = byLang[langObj.code] || langObj.voices || [];
    setCountryVoices(voices);
    if (voices.length) {
      setSelectedVoice(voices[0].id);
      setSelectedVoiceName(voices[0].name || voices[0].id);
      if (config.hasVoiceIdInput) setVoiceId(voices[0].id);
    }
    setModalOpen(false);
  };

  const endpoint = useTunnel ? tunnelEndpoint : localEndpoint;
  // For ElevenLabs/config-driven: prefer manual voiceId (if any), else fall back to selectedVoice
  const activeVoiceId = config.hasVoiceIdInput ? (voiceId || selectedVoice) : selectedVoice;
  const modelFull = (() => {
    if (providerId === "selfhosted-tts") {
      const model = selectedModel.trim();
      const voice = activeVoiceId.trim();
      return model ? `${providerAlias}/${model}${voice ? `/${voice}` : ""}` : "";
    }
    if (providerId === "ollama-local") {
      const model = (selectedModel || "phonon:multilingual").trim();
      const voice = activeVoiceId.trim();
      return `${providerAlias}/${model}${voice && voice !== "default" ? `/${voice}` : ""}`;
    }
    if (config.hasModelSelector && selectedModel && activeVoiceId) return `${providerAlias}/${selectedModel}/${activeVoiceId}`;
    if (config.hasModelSelector && selectedModel) return `${providerAlias}/${selectedModel}`;
    if (activeVoiceId) return `${providerAlias}/${activeVoiceId}`;
    return "";
  })();

  const ttsBody = (() => {
    const b = { model: modelFull };
    if (selectedVoice) b.voice = selectedVoice;
    if (config.hasStyleInput && style.trim()) b.style = style.trim();
    if (config.hasLanguageHint && languageHint) b.language = languageHint;
    if (responseFormat && responseFormat !== "json" && responseFormat !== "mp3") {
      b.response_format = responseFormat;
    }
    return b;
  })();

  const outputExt = responseFormat === "pcm" ? "pcm" : (responseFormat === "wav" || providerId === "ollama-local") ? "wav" : "mp3";
  const curlSnippet = `curl -X POST ${endpoint}/v1/audio/speech${responseFormat === "json" ? "?response_format=json" : ""} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey || "YOUR_KEY"}" \\
  -d '${JSON.stringify(ttsBody)}' \\
  ${responseFormat === "json" ? "" : `--output speech.${outputExt}`}`;

  const handleRun = async () => {
    if (!input.trim() || !modelFull) return;
    setRunning(true);
    setError("");
    setAudioUrl("");
    setDownloadUrl("");
    setJsonResponse(null);
    const start = getTimestamp();
    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const url = `/api/v1/audio/speech${responseFormat === "json" ? "?response_format=json" : ""}`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...ttsBody, input: input.trim() }),
      });
      setLatency(getTimestamp() - start);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error?.message || d?.error || `HTTP ${res.status}`);
        return;
      }

      if (responseFormat === "json") {
        const data = await res.json();
        setJsonResponse(data);
        const format = data.format || "mp3";
        const audioBlob = await fetch(`data:audio/${format};base64,${data.audio}`).then(r => r.blob());
        const objUrl = URL.createObjectURL(audioBlob);
        setAudioUrl(objUrl);
        setDownloadUrl(objUrl);
      } else if (responseFormat === "pcm") {
        const pcmBuffer = await res.arrayBuffer();
        const pcmBlob = new Blob([pcmBuffer], { type: "audio/pcm" });
        setDownloadUrl(URL.createObjectURL(pcmBlob));
        // Wrap raw PCM buffer with WAV header so browser <audio> tag can play it
        const wavBlob = pcmToWavBlob(pcmBuffer, 24000, 1);
        setAudioUrl(URL.createObjectURL(wavBlob));
      } else {
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        setAudioUrl(objUrl);
        setDownloadUrl(objUrl);
      }
    } catch (e) {
      setError(e.message || "Network error");
    } finally {
      setRunning(false);
    }
  };

  const filteredLanguages = languages.filter((l) =>
    l.name.toLowerCase().includes(modalSearch.toLowerCase()) ||
    l.code.toLowerCase().includes(modalSearch.toLowerCase())
  );

  return (
    <>
      <div className="border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 rounded-none font-mono">
        <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-[var(--color-hairline)]">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-mute)]">[test]</span>
            <h2 className="text-sm sm:text-base font-bold text-[var(--color-ink)]">
              TTS Audio Speech Example
            </h2>
          </div>
          {latency && (
            <span className="text-xs text-[var(--color-success)] font-medium">
              [{latency}ms]
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {/* Endpoint */}
          <Row label="Endpoint">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
              <span className="w-full min-w-0 flex-1 px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] truncate min-h-[38px] flex items-center">
                {endpoint}/v1/audio/speech
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
              {apiKey
                ? `${apiKey.slice(0, 8)}${"\u2022".repeat(Math.min(20, Math.max(0, apiKey.length - 8)))}`
                : connectionCount > 0
                  ? <span className="text-[var(--color-mute)]">[stored key: {connectionCount} conns]</span>
                  : <span className="text-[var(--color-ash)]">[-] No key configured</span>}
            </span>
          </Row>

          {/* Model selector */}
          {providerId === "selfhosted-tts" && (
            <Row label="Model">
              <input
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                placeholder="e.g. kokoro or Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16"
                className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
              />
            </Row>
          )}

          {providerId !== "selfhosted-tts" && config.hasModelSelector && (config.modelKey || getModelsByProviderId(providerId).some((m) => getModelKind(m) === "tts")) && (
            <Row label="Model">
              <select
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
              >
                {(() => {
                  const ttsModels = getModelsByProviderId(providerId).filter((m) => getModelKind(m) === "tts");
                  return (ttsModels.length ? ttsModels : getModelsByProviderId(config.modelKey) || []).map((m) => (
                    <option key={m.id} value={m.id}>{m.name || m.id}</option>
                  ));
                })()}
              </select>
            </Row>
          )}

          {/* Language hint */}
          {config.hasLanguageHint && (
            <Row label="Language">
              <select
                value={languageHint}
                onChange={(e) => setLanguageHint(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
              >
                <option value="">Auto-detect</option>
                {(config.languageOptions || GOOGLE_TTS_LANGUAGES).map((l) =>
                  typeof l === "string"
                    ? <option key={l} value={l}>{l}</option>
                    : <option key={l.id} value={l.name}>{l.name}</option>
                )}
              </select>
            </Row>
          )}

          {/* Language browse */}
          {config.hasBrowseButton && (
            <Row label="Language">
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={openModal}
                  className="w-full min-w-0 flex-1 px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-left hover:border-[var(--color-hairline-strong)] transition-colors min-h-[38px] flex items-center"
                >
                  {selectedLang
                    ? <span className="text-[var(--color-ink)]">{languages.find((l) => l.code === selectedLang)?.name || selectedLang}</span>
                    : <span className="text-[var(--color-mute)]">[-] No language selected</span>}
                </button>
                <button
                  type="button"
                  onClick={openModal}
                  className="flex items-center justify-center gap-1 text-xs border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] hover:bg-[var(--color-surface-card)] px-3 py-2 min-h-[38px] text-[var(--color-ink)] transition-colors sm:shrink-0"
                >
                  [select language]
                </button>
              </div>
            </Row>
          )}

          {/* Voice chips */}
          {countryVoices.length > 0 && (
            <Row label="Voice">
              <div className="flex flex-wrap gap-1.5 w-full">
                {countryVoices.map((v) => {
                  const isSelected = selectedVoice === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setSelectedVoice(v.id);
                        setSelectedVoiceName(v.name);
                        if (config.hasVoiceIdInput) setVoiceId(v.id);
                      }}
                      className={`px-2.5 py-1.5 rounded-[4px] text-xs font-mono border transition-colors ${
                        isSelected
                          ? "border-[var(--color-ink)] bg-[var(--color-surface-card)] text-[var(--color-ink)] font-bold"
                          : "border-[var(--color-hairline)] bg-[var(--color-surface-soft)] text-[var(--color-mute)] hover:border-[var(--color-hairline-strong)]"
                      }`}
                    >
                      {v.name}
                      {v.language ? ` · ${v.language}` : ""}
                      {v.gender ? ` · ${v.gender[0].toUpperCase()}` : ""}
                      {v.free_users_allowed === true && (
                        <span className="ml-1 text-[10px] text-[var(--color-success)]">[free]</span>
                      )}
                      {v.free_users_allowed === false && (
                        <span className="ml-1 text-[10px] text-[var(--color-warning)]">[paid]</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Row>
          )}

          {/* Voice ID input */}
          {config.hasVoiceIdInput && (
            <Row label="Voice ID">
              <div className="relative w-full">
                <input
                  value={voiceId}
                  onChange={(e) => {
                    setVoiceId(e.target.value);
                    setSelectedVoice(e.target.value);
                  }}
                  placeholder={providerId === "selfhosted-tts" || providerId === "ollama-local" ? "e.g. Zoey, Easton, Freya, or default" : "e.g. CwhRBWXzGAHq8TQ4Fs17"}
                  className="w-full px-3 py-2 pr-8 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
                />
                {voiceId && (
                  <button
                    type="button"
                    onClick={() => { setVoiceId(""); setSelectedVoice(""); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-mute)] hover:text-[var(--color-ink)] text-xs p-1"
                  >
                    [x]
                  </button>
                )}
              </div>
            </Row>
          )}

          {/* Google TTS language dropdown */}
          {config.hasLanguageDropdown && (
            <Row label="Language">
              <select
                value={selectedVoice}
                onChange={(e) => {
                  const m = getModelsByProviderId(providerId).filter((item) => getModelKind(item) === "tts").find((item) => item.id === e.target.value);
                  setSelectedVoice(e.target.value);
                  setSelectedVoiceName(m?.name || e.target.value);
                }}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
              >
                {getModelsByProviderId(providerId).filter((m) => getModelKind(m) === "tts").map((m) => (
                  <option key={m.id} value={m.id}>{m.name || m.id}</option>
                ))}
              </select>
            </Row>
          )}

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

          {/* Style */}
          {config.hasStyleInput && (
            <Row label={translate("Style")}>
              <div className="relative w-full">
                <textarea
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  placeholder={translate("e.g. a warm, gentle voice, speaking slowly with a British accent")}
                  rows={2}
                  className="w-full px-3 py-2 pr-8 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none transition-colors resize-none"
                />
                {style && (
                  <button
                    type="button"
                    onClick={() => setStyle("")}
                    className="absolute right-2 top-2 text-[var(--color-mute)] hover:text-[var(--color-ink)] text-xs p-1"
                  >
                    [x]
                  </button>
                )}
              </div>
            </Row>
          )}

          {/* Output Format */}
          <Row label="Format">
            <select
              value={responseFormat}
              onChange={(e) => setResponseFormat(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px] transition-colors"
            >
              {formatOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Row>

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
                  {running ? "[generating...]" : "[generate]"}
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

          {/* Audio player & Response */}
          {audioUrl ? (
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--color-mute)] uppercase tracking-wider">
                  &gt; Audio Result {selectedVoiceName ? `[${selectedVoiceName}]` : ""}
                </span>
                <a
                  href={downloadUrl || audioUrl}
                  download={`speech.${responseFormat === "pcm" ? "pcm" : (responseFormat === "wav" || providerId === "ollama-local") ? "wav" : "mp3"}`}
                  className="inline-flex items-center gap-1 text-xs border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] hover:bg-[var(--color-surface-card)] px-3 py-1.5 text-[var(--color-ink)] transition-colors min-h-[32px]"
                >
                  [download]
                </a>
              </div>
              <audio controls src={audioUrl} className="w-full rounded-[4px] min-h-[44px]" />

              {jsonResponse && (
                <div className="flex flex-col gap-1.5 mt-2">
                  <span className="text-xs text-[var(--color-mute)] uppercase tracking-wider">
                    &gt; JSON Response
                  </span>
                  <pre className="bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-[4px] p-3 text-xs text-[var(--color-ink)] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                    {JSON.stringify({
                      format: jsonResponse.format,
                      audio: jsonResponse.audio ? `${jsonResponse.audio.substring(0, 100)}...` : "",
                    }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-[var(--color-mute)] uppercase tracking-wider">
                &gt; Response
              </span>
              <pre className="bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-[4px] p-3 text-xs text-[var(--color-ink)] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed opacity-70">
                {DEFAULT_TTS_RESPONSE_EXAMPLE}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Language Picker Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/60 font-mono"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="border border-[var(--color-hairline-strong)] bg-[var(--color-canvas)] w-full max-w-md flex flex-col max-h-[85vh] rounded-none shadow-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-hairline)] shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-mute)]">[modal]</span>
                <h3 className="text-sm font-bold text-[var(--color-ink)]">Select Language</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-xs text-[var(--color-mute)] hover:text-[var(--color-ink)] p-1"
              >
                [x]
              </button>
            </div>

            {/* Modal Search */}
            <div className="p-3 border-b border-[var(--color-hairline)] shrink-0">
              <input
                autoFocus
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                placeholder="Search language..."
                className="w-full px-3 py-2 text-xs sm:text-sm border border-[var(--color-hairline)] rounded-[4px] bg-[var(--color-surface-soft)] text-[var(--color-ink)] focus:bg-[var(--color-canvas)] focus:border-[var(--color-ink)] focus:outline-none min-h-[38px]"
              />
            </div>

            {/* Language List */}
            <div className="overflow-y-auto flex-1 p-2">
              {modalError && (
                <div className="border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)] p-2 rounded-[4px] text-xs mb-2">
                  {modalError}
                </div>
              )}
              {modalLoading ? (
                <p className="text-xs text-[var(--color-mute)] p-3 text-center">Loading languages...</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {filteredLanguages.map((c) => {
                    const isSelected = selectedLang === c.code;
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => handlePickLanguage(c)}
                        className={`flex items-center justify-between w-full px-3 py-2 text-left rounded-[4px] transition-colors min-h-[36px] ${
                          isSelected
                            ? "bg-[var(--color-surface-card)] text-[var(--color-ink)] font-bold border border-[var(--color-hairline)]"
                            : "text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)]"
                        }`}
                      >
                        <span className="text-xs sm:text-sm">{c.name}</span>
                        <div className="flex items-center gap-2 shrink-0 text-xs text-[var(--color-mute)]">
                          <span>[{c.voices.length} voices]</span>
                          {isSelected && <span className="text-[var(--color-success)]">[selected]</span>}
                        </div>
                      </button>
                    );
                  })}
                  {filteredLanguages.length === 0 && (
                    <p className="text-xs text-[var(--color-mute)] p-3 text-center">[-] No languages found.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
