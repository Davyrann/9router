"use client";

import { useState, useEffect } from "react";
import { Button, Modal, Input, ModelSelectModal } from "@/shared/components";
import Image from "next/image";

export default function AntigravityToolCard({
  tool,
  isExpanded,
  onToggle,
  baseUrl,
  apiKeys,
  activeProviders,
  hasActiveProviders,
  cloudEnabled,
  initialStatus,
}) {
  const [status, setStatus] = useState(initialStatus || null);
  const [loading, setLoading] = useState(false);
  const [startingStep, setStartingStep] = useState(null); // "cert" | "server" | "dns" | null
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [sudoPassword, setSudoPassword] = useState("");
  const [selectedApiKey, setSelectedApiKey] = useState("");
  const [message, setMessage] = useState(null);
  const [modelMappings, setModelMappings] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [currentEditingAlias, setCurrentEditingAlias] = useState(null);
  const [modelAliases, setModelAliases] = useState({});

  useEffect(() => {
    if (apiKeys?.length > 0 && !selectedApiKey) {
      setSelectedApiKey(apiKeys[0].key);
    }
  }, [apiKeys, selectedApiKey]);

  useEffect(() => {
    if (initialStatus) setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (!isExpanded) return;
    if (!status) fetchStatus();
    loadSavedMappings();
    fetchModelAliases();
  }, [isExpanded]);

  const loadSavedMappings = async () => {
    try {
      const res = await fetch("/api/cli-tools/antigravity-mitm/alias?tool=antigravity");
      if (res.ok) {
        const data = await res.json();
        const aliases = data.aliases || {};

        if (Object.keys(aliases).length > 0) {
          setModelMappings(aliases);
        }
      }
    } catch (error) {
      console.log("Error loading saved mappings:", error);
    }
  };

  const fetchModelAliases = async () => {
    try {
      const res = await fetch("/api/models/alias");
      const data = await res.json();
      if (res.ok) setModelAliases(data.aliases || {});
    } catch (error) {
      console.log("Error fetching model aliases:", error);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/cli-tools/antigravity-mitm");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (error) {
      console.log("Error fetching status:", error);
      setStatus({ running: false });
    }
  };

  // MITM elevation is decided by the server OS, not by this browser's OS.
  const serverIsWindows = status?.isWin === true;
  const canRunWithoutPassword = serverIsWindows || status?.hasCachedPassword || status?.needsSudoPassword === false;

  const handleStart = () => {
    if (canRunWithoutPassword) {
      doStart("");
    } else {
      setShowPasswordModal(true);
      setMessage(null);
    }
  };

  const handleStop = () => {
    if (canRunWithoutPassword) {
      doStop("");
    } else {
      setShowPasswordModal(true);
      setMessage(null);
    }
  };

  const doStart = async (password) => {
    setLoading(true);
    setMessage(null);
    // Show steps progressing in order
    setStartingStep("cert");
    try {
      const keyToUse = selectedApiKey?.trim()
        || (apiKeys?.length > 0 ? apiKeys[0].key : null)
        || (!cloudEnabled ? "sk_9router" : null);

      const res = await fetch("/api/cli-tools/antigravity-mitm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: keyToUse, sudoPassword: password }),
      });

      const data = await res.json();
      if (res.ok) {
        setStartingStep(null);
        setMessage({ type: "success", text: "MITM started" });
        setShowPasswordModal(false);
        setSudoPassword("");
        fetchStatus();
      } else {
        setStartingStep(null);
        setMessage({ type: "error", text: data.error || "Failed to start" });
      }
    } catch (error) {
      setStartingStep(null);
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const doStop = async (password) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cli-tools/antigravity-mitm", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sudoPassword: password }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "MITM stopped" });
        setShowPasswordModal(false);
        setSudoPassword("");
        fetchStatus();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to stop" });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPassword = () => {
    if (!sudoPassword.trim()) {
      setMessage({ type: "error", text: "Sudo password is required" });
      return;
    }
    if (status?.running) {
      doStop(sudoPassword);
    } else {
      doStart(sudoPassword);
    }
  };

  const openModelSelector = (alias) => {
    setCurrentEditingAlias(alias);
    setModalOpen(true);
  };

  const handleModelSelect = (model) => {
    if (currentEditingAlias) {
      setModelMappings(prev => ({
        ...prev,
        [currentEditingAlias]: model.value,
      }));
    }
  };

  const handleModelMappingChange = (alias, value) => {
    setModelMappings(prev => ({
      ...prev,
      [alias]: value,
    }));
  };

  const handleSaveMappings = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/cli-tools/antigravity-mitm/alias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "antigravity", mappings: modelMappings }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save mappings");
      }

      setMessage({ type: "success", text: "Mappings saved!" });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const isRunning = status?.running;

  return (
    <div className="rounded-none border border-[var(--color-hairline)] bg-[var(--color-surface)] font-mono overflow-hidden p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-3 hover:cursor-pointer sm:items-center" onClick={onToggle}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="size-9 rounded-[4px] flex items-center justify-center p-1.5 bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)] shrink-0">
            <Image
              src="/providers/antigravity.png"
              alt={tool.name}
              width={32}
              height={32}
              className="size-7 object-contain rounded-[2px]"
              sizes="32px"
              onError={(e) => { e.target.style.display = "none"; }}
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="font-bold text-sm text-[var(--color-ink)]">{tool.name}</h3>
              {isRunning ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-bold bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.25)] text-[var(--color-success)]">
                  <span className="h-1.5 w-1.5 bg-[var(--color-success)] animate-pulse" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-medium bg-[var(--color-canvas)] border border-[var(--color-hairline)] text-[var(--color-mute)]">
                  <span className="h-1.5 w-1.5 bg-[var(--color-ash)]" />
                  Inactive
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--color-mute)] truncate">{tool.description}</p>
          </div>
        </div>
        <span className={`material-symbols-outlined text-[var(--color-mute)] text-[20px] transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>expand_more</span>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-[var(--color-hairline)] flex flex-col gap-4">
          {/* Status indicators — ordered: Cert → Server → DNS */}
          <div className="inline-flex flex-wrap items-center gap-2 p-1.5 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-canvas)] w-fit">
            {[
              { key: "cert", label: "SSL Cert", ok: status?.certExists },
              { key: "server", label: "MITM Server", ok: status?.running },
              { key: "dns", label: "DNS Redirect", ok: status?.dnsConfigured },
            ].map(({ key, label, ok }, i) => {
              const isLoading = startingStep === key;
              return (
                <div key={key} className="flex items-center gap-1.5">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-xs font-medium border ${
                    isLoading
                      ? "bg-[rgba(99,102,241,0.1)] border-[var(--color-primary)] text-[var(--color-primary)]"
                      : ok
                      ? "bg-[rgba(16,185,129,0.08)] border-[rgba(16,185,129,0.25)] text-[var(--color-success)]"
                      : "bg-[var(--color-surface)] border-[var(--color-hairline)] text-[var(--color-mute)]"
                  }`}>
                    {isLoading ? (
                      <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[14px]">
                        {ok ? "check_circle" : "radio_button_unchecked"}
                      </span>
                    )}
                    <span>{label}</span>
                  </div>
                  {i < 2 && <span className="material-symbols-outlined text-[12px] text-[var(--color-ash)]">arrow_forward</span>}
                </div>
              );
            })}
          </div>

          {/* Start/Stop Button */}
          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                onClick={handleStop}
                disabled={loading}
                className="px-4 py-2 rounded-[4px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[var(--color-danger)] font-bold text-xs flex items-center gap-2 hover:bg-[rgba(239,68,68,0.2)] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">stop_circle</span>
                Stop MITM
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={loading || !hasActiveProviders}
                className="px-4 py-2 rounded-[4px] bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-xs flex items-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px]">play_circle</span>
                Start MITM
              </button>
            )}
          </div>

          {message?.type === "error" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs bg-[rgba(239,68,68,0.1)] text-[var(--color-danger)] border border-[rgba(239,68,68,0.2)]">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{message.text}</span>
            </div>
          )}

          {/* When running: API Key + Model Mappings */}
          {isRunning && (
            <div className="rounded-none border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-4 flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[10rem_auto_1fr] sm:items-center sm:gap-2 pb-3 border-b border-[var(--color-hairline)]">
                <span className="text-xs font-bold text-[var(--color-ink)]">Active API Key</span>
                <span className="material-symbols-outlined hidden text-[var(--color-ash)] text-[14px] sm:inline">arrow_forward</span>
                {apiKeys?.length > 0 ? (
                  <select
                    value={selectedApiKey}
                    onChange={(e) => setSelectedApiKey(e.target.value)}
                    className="w-full min-w-0 px-2.5 py-1.5 bg-[var(--color-surface)] rounded-[4px] text-xs border border-[var(--color-hairline)] text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-primary)] font-mono"
                  >
                    {apiKeys.map((key) => <option key={key.id} value={key.key}>{key.key}</option>)}
                  </select>
                ) : (
                  <span className="min-w-0 rounded-[4px] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-mute)] border border-[var(--color-hairline)]">
                    {cloudEnabled ? "No API keys — create one in Keys page" : "sk_9router (default)"}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <span className="text-xs font-bold text-[var(--color-ink)] uppercase tracking-wider mb-1">Model Rerouting Rules</span>
                {tool.defaultModels.map((model) => (
                  <div key={model.alias} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[10rem_auto_1fr_auto] sm:items-center sm:gap-2">
                    <span className="text-xs font-medium text-[var(--color-ink)] truncate px-2 py-1 rounded-[4px] bg-[var(--color-surface)] border border-[var(--color-hairline)]">
                      {model.name}
                    </span>
                    <span className="material-symbols-outlined hidden text-[var(--color-ash)] text-[14px] sm:inline">arrow_forward</span>
                    <div className="relative w-full min-w-0">
                      <input
                        type="text"
                        value={modelMappings[model.alias] || ""}
                        onChange={(e) => handleModelMappingChange(model.alias, e.target.value)}
                        placeholder="provider/model-id"
                        className="w-full min-w-0 pl-2.5 pr-7 py-1.5 bg-[var(--color-surface)] rounded-[4px] border border-[var(--color-hairline)] text-xs text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-primary)] font-mono"
                      />
                      {modelMappings[model.alias] && (
                        <button
                          onClick={() => handleModelMappingChange(model.alias, "")}
                          className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-[var(--color-mute)] hover:text-[var(--color-danger)] rounded-[2px] transition-colors cursor-pointer"
                          title="Clear"
                        >
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => openModelSelector(model.alias)}
                      disabled={!hasActiveProviders}
                      className={`w-full sm:w-auto rounded-[4px] border px-3 py-1.5 text-xs transition-all whitespace-nowrap sm:shrink-0 font-medium ${
                        hasActiveProviders
                          ? "bg-[var(--color-surface)] border-[var(--color-hairline)] text-[var(--color-ink)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] cursor-pointer"
                          : "opacity-40 cursor-not-allowed border-[var(--color-hairline)] text-[var(--color-mute)]"
                      }`}
                    >
                      Select
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveMappings}
                  disabled={loading || Object.keys(modelMappings).length === 0}
                  className="h-8 rounded-[4px] text-xs font-bold cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px] mr-1">save</span>
                  Save Mappings
                </Button>
              </div>
            </div>
          )}

          {/* Windows admin warning */}
          {!isRunning && serverIsWindows && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-[4px] text-xs bg-[rgba(245,158,11,0.08)] text-[var(--color-warning,#f59e0b)] border border-[rgba(245,158,11,0.25)]">
              <span className="material-symbols-outlined text-[16px]">warning</span>
              <span>Windows: Run terminal (9Router) as Administrator to enable MITM</span>
            </div>
          )}

          {/* When stopped: how it works */}
          {!isRunning && (
            <div className="rounded-none border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3 sm:p-4 flex flex-col gap-2">
              <p className="text-xs text-[var(--color-ink)] font-semibold">
                How Antigravity MITM works:
              </p>
              <div className="flex flex-col gap-1.5 text-[11px] text-[var(--color-mute)]">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-4 items-center justify-center rounded-[2px] bg-[var(--color-surface)] border border-[var(--color-hairline)] text-[10px] font-bold text-[var(--color-ink)]">1</span>
                  <span>Generates trusted local SSL certificate for IDE proxying</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-4 items-center justify-center rounded-[2px] bg-[var(--color-surface)] border border-[var(--color-hairline)] text-[10px] font-bold text-[var(--color-ink)]">2</span>
                  <span>Redirects <code className="text-[10px] bg-[var(--color-surface)] border border-[var(--color-hairline)] px-1.5 py-0.5 rounded-[2px]">daily-cloudcode-pa.googleapis.com</code> → 9Router gateway</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-4 items-center justify-center rounded-[2px] bg-[var(--color-surface)] border border-[var(--color-hairline)] text-[10px] font-bold text-[var(--color-ink)]">3</span>
                  <span>Routes all Antigravity Claude & Gemini requests through your configured upstream providers</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Password Modal */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setSudoPassword("");
          setMessage(null);
        }}
        title="Sudo Password Required"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <span className="material-symbols-outlined text-yellow-500 text-[20px]">warning</span>
            <p className="text-xs text-text-muted">Required for SSL certificate and DNS configuration</p>
          </div>

          <Input
            type="password"
            placeholder="Enter sudo password"
            value={sudoPassword}
            onChange={(e) => setSudoPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) handleConfirmPassword();
            }}
          />

          {message && (
            <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${message.type === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
              <span className="material-symbols-outlined text-[14px]">{message.type === "success" ? "check_circle" : "error"}</span>
              <span>{message.text}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowPasswordModal(false); setSudoPassword(""); setMessage(null); }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmPassword}
              loading={loading}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>

      {/* Model Select Modal */}
      {modalOpen && (
        <ModelSelectModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSelect={handleModelSelect}
          selectedModel={currentEditingAlias ? modelMappings[currentEditingAlias] : null}
          activeProviders={activeProviders}
          modelAliases={modelAliases}
          title={`Select model for ${currentEditingAlias}`}
        />
      )}
    </div>
  );
}
