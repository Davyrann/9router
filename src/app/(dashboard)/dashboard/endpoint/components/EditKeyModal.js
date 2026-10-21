"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Modal, Button, Input, Toggle, ModelSelectModal } from "@/shared/components";

/** Format tokens with metric suffix */
function fmtTokens(n) {
  if (!n || n <= 0) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function EditKeyForm({
  isOpen,
  apiKey,
  onClose,
  onSave,
  activeProviders = [],
  modelAliases = {},
}) {
  const [name, setName] = useState(() => apiKey.name || "");
  const [isActive, setIsActive] = useState(() => apiKey.isActive !== false);
  const [expiresAt, setExpiresAt] = useState(() => (apiKey.expiresAt ? apiKey.expiresAt.slice(0, 10) : ""));

  const initialAccess = apiKey.access || { restricted: false, allow: [] };
  const [accessRestricted, setAccessRestricted] = useState(() => Boolean(initialAccess.restricted));
  const [accessAllow, setAccessAllow] = useState(() => (Array.isArray(initialAccess.allow) ? [...initialAccess.allow] : []));

  const win = apiKey.quotaWindow;
  const initialMode = win === "onetime" ? "onetime" : (apiKey.quotaLimit || apiKey.quotaTokenLimit ? "recurring" : "unlimited");
  const [quotaMode, setQuotaMode] = useState(initialMode);
  const [onetimeTokenLimit, setOnetimeTokenLimit] = useState(() => (win === "onetime" && apiKey.quotaTokenLimit ? String(apiKey.quotaTokenLimit) : ""));
  const [quotaTokensUsed, setQuotaTokensUsed] = useState(() => apiKey.quotaTokensUsed || 0);

  const [recurringRequestLimit, setRecurringRequestLimit] = useState(() => (apiKey.quotaLimit ? String(apiKey.quotaLimit) : ""));
  const [recurringTokenLimit, setRecurringTokenLimit] = useState(() => (win !== "onetime" && apiKey.quotaTokenLimit ? String(apiKey.quotaTokenLimit) : ""));
  const [recurringWindow, setRecurringWindow] = useState(() => (win && win !== "onetime" ? win : "daily"));

  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleAddAllowedModel = (model) => {
    const value = model?.value;
    if (value && !accessAllow.some((e) => e.toLowerCase() === value.toLowerCase())) {
      setAccessAllow([...accessAllow, value]);
    }
  };

  const handleRemoveAllowedModel = (value) => {
    setAccessAllow(accessAllow.filter((e) => e.toLowerCase() !== value.toLowerCase()));
  };

  const handleQuickAddTokens = (amount) => {
    const current = Number(onetimeTokenLimit) || 0;
    setOnetimeTokenLimit(String(current + amount));
  };

  const handleResetTokensUsed = () => {
    setQuotaTokensUsed(0);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Key name cannot be empty");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = {
        name: trimmedName,
        isActive,
        expiresAt: expiresAt ? `${expiresAt}T23:59:59.999Z` : null,
        access: {
          restricted: accessRestricted,
          allow: accessRestricted ? accessAllow : [],
        },
      };

      if (quotaMode === "onetime") {
        const tokLimit = onetimeTokenLimit ? Number(onetimeTokenLimit) : null;
        if (tokLimit !== null && (!Number.isInteger(tokLimit) || tokLimit <= 0)) {
          setError("Onetime token limit must be a positive number");
          setSaving(false);
          return;
        }
        payload.quotaWindow = "onetime";
        payload.quotaTokenLimit = tokLimit;
        payload.quotaLimit = null;
        payload.quotaTokensUsed = quotaTokensUsed;
      } else if (quotaMode === "recurring") {
        const reqLimit = recurringRequestLimit ? Number(recurringRequestLimit) : null;
        const tokLimit = recurringTokenLimit ? Number(recurringTokenLimit) : null;
        if (reqLimit !== null && (!Number.isInteger(reqLimit) || reqLimit <= 0)) {
          setError("Request limit must be a positive number");
          setSaving(false);
          return;
        }
        if (tokLimit !== null && (!Number.isInteger(tokLimit) || tokLimit <= 0)) {
          setError("Token limit must be a positive number");
          setSaving(false);
          return;
        }
        payload.quotaWindow = recurringWindow;
        payload.quotaLimit = reqLimit;
        payload.quotaTokenLimit = tokLimit;
      } else {
        payload.quotaWindow = null;
        payload.quotaLimit = null;
        payload.quotaTokenLimit = null;
      }

      await onSave(payload);
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to save API key settings");
    } finally {
      setSaving(false);
    }
  };

  const limitNumber = Number(onetimeTokenLimit) || 0;
  const isOnetimeExhausted = quotaMode === "onetime" && limitNumber > 0 && quotaTokensUsed >= limitNumber;
  const onetimePercent = limitNumber > 0 ? Math.min(100, Math.round((quotaTokensUsed / limitNumber) * 100)) : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit API Key: ${apiKey.name}`}
      size="lg"
      className="w-full sm:max-w-lg font-mono text-xs"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={saving}
            className="h-9 rounded-[4px] font-mono text-xs"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={saving}
            className="h-9 rounded-[4px] font-mono text-xs font-bold"
          >
            Save Changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        {error && (
          <div className="p-2.5 rounded-[4px] bg-[rgba(239,68,68,0.08)] border border-[var(--color-danger)] text-[var(--color-danger)] font-mono text-xs">
            [!] {error}
          </div>
        )}

        {/* Section 1: Basic Info */}
        <div className="flex flex-col gap-3 pb-3 border-b border-[var(--color-hairline)]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[var(--color-ink)] uppercase tracking-wider text-[11px]">
              [+] Key Settings
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--color-mute)]">
                {isActive ? "Active" : "Paused"}
              </span>
              <Toggle
                size="sm"
                checked={isActive}
                onChange={setIsActive}
                title="Toggle active status"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--color-mute)]">Key Name:</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production Key"
              className="w-full"
              inputClassName="h-9 text-xs py-1 font-mono rounded-[4px]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--color-mute)]">Expiration Date (Optional):</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="h-9 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2.5 text-xs font-mono text-[var(--color-ink)] outline-none transition-colors hover:border-[var(--color-primary)] cursor-pointer w-full"
            />
          </div>
        </div>

        {/* Section 2: Model Access Control */}
        <div className="flex flex-col gap-2.5 pb-3 border-b border-[var(--color-hairline)]">
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <span className="font-bold text-[var(--color-ink)] uppercase tracking-wider text-[11px] block">
                [+] Allowed Models &amp; Combos
              </span>
              <span className="text-[11px] text-[var(--color-mute)] leading-tight block mt-0.5">
                Restrict key so it can only call specified models
              </span>
            </div>
            <Toggle
              size="sm"
              checked={accessRestricted}
              onChange={setAccessRestricted}
              title="Restrict model access"
            />
          </div>

          {accessRestricted && (
            <div className="mt-1 p-2.5 rounded-[4px] bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] flex flex-col gap-2">
              {accessAllow.length === 0 ? (
                <span className="text-[11px] text-[var(--color-warning)] font-mono">
                  [!] No models selected — this key will be rejected for all requests.
                </span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {accessAllow.map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center gap-1 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-ink)]"
                    >
                      {item}
                      <button
                        type="button"
                        onClick={() => handleRemoveAllowedModel(item)}
                        className="text-[var(--color-mute)] hover:text-[var(--color-danger)] ml-0.5 cursor-pointer leading-none"
                        aria-label={`Remove ${item}`}
                      >
                        <span className="material-symbols-outlined text-[13px] leading-none">close</span>
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center justify-center gap-1 h-8 px-3 rounded-[4px] border border-dashed border-[var(--color-hairline-strong,#646262)] bg-[var(--color-canvas)] text-[11px] font-mono text-[var(--color-ink)] hover:border-[var(--color-primary)] cursor-pointer mt-1 self-start"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                + Add Model or Combo
              </button>
            </div>
          )}
        </div>

        {/* Section 3: Token Quota & Limits */}
        <div className="flex flex-col gap-2.5">
          <span className="font-bold text-[var(--color-ink)] uppercase tracking-wider text-[11px]">
            [+] Quota &amp; Token Limits
          </span>

          {/* Mode Selector Tabs (Mobile First) */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-[4px] bg-[var(--color-surface-soft)] border border-[var(--color-hairline)]">
            <button
              type="button"
              onClick={() => setQuotaMode("onetime")}
              className={`h-8 rounded-[4px] text-[11px] font-mono font-medium transition-colors cursor-pointer text-center px-1 truncate ${
                quotaMode === "onetime"
                  ? "bg-[var(--color-canvas)] text-[var(--color-ink)] border border-[var(--color-hairline)] font-bold"
                  : "text-[var(--color-mute)] hover:text-[var(--color-ink)]"
              }`}
            >
              Onetime Token
            </button>
            <button
              type="button"
              onClick={() => setQuotaMode("recurring")}
              className={`h-8 rounded-[4px] text-[11px] font-mono font-medium transition-colors cursor-pointer text-center px-1 truncate ${
                quotaMode === "recurring"
                  ? "bg-[var(--color-canvas)] text-[var(--color-ink)] border border-[var(--color-hairline)] font-bold"
                  : "text-[var(--color-mute)] hover:text-[var(--color-ink)]"
              }`}
            >
              Recurring
            </button>
            <button
              type="button"
              onClick={() => setQuotaMode("unlimited")}
              className={`h-8 rounded-[4px] text-[11px] font-mono font-medium transition-colors cursor-pointer text-center px-1 truncate ${
                quotaMode === "unlimited"
                  ? "bg-[var(--color-canvas)] text-[var(--color-ink)] border border-[var(--color-hairline)] font-bold"
                  : "text-[var(--color-mute)] hover:text-[var(--color-ink)]"
              }`}
            >
              Unlimited
            </button>
          </div>

          {/* Onetime Mode Settings */}
          {quotaMode === "onetime" && (
            <div className="p-3 rounded-[4px] bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-[11px]">
                  <label className="text-[var(--color-mute)]">Total Token Limit:</label>
                  {isOnetimeExhausted && (
                    <span className="font-bold text-[var(--color-danger)] font-mono">
                      [EXHAUSTED (429)]
                    </span>
                  )}
                </div>
                <Input
                  type="number"
                  min={1}
                  value={onetimeTokenLimit}
                  onChange={(e) => setOnetimeTokenLimit(e.target.value)}
                  placeholder="e.g. 100000 tokens"
                  className="w-full"
                  inputClassName="h-9 text-xs py-1 font-mono rounded-[4px]"
                />
              </div>

              {/* Progress bar & telemetry */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-[var(--color-mute)]">
                    Used: <strong className="text-[var(--color-ink)]">{fmtTokens(quotaTokensUsed)}</strong> / {fmtTokens(limitNumber)} tokens
                  </span>
                  <span className={`font-bold ${isOnetimeExhausted ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"}`}>
                    {onetimePercent}%
                  </span>
                </div>
                <div className="w-full h-2 bg-[var(--color-canvas)] border border-[var(--color-hairline)] overflow-hidden rounded-none">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isOnetimeExhausted ? "bg-[var(--color-danger)]" : "bg-[var(--color-accent,#007aff)]"
                    }`}
                    style={{ width: `${onetimePercent}%` }}
                  />
                </div>
              </div>

              {/* Quick actions: Top-up tokens / Reset usage */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[var(--color-hairline)]">
                <span className="text-[10px] text-[var(--color-mute)] w-full sm:w-auto">Top-up:</span>
                <button
                  type="button"
                  onClick={() => handleQuickAddTokens(50_000)}
                  className="h-7 px-2 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[10px] font-mono text-[var(--color-ink)] hover:border-[var(--color-primary)] cursor-pointer"
                >
                  +50K tok
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAddTokens(100_000)}
                  className="h-7 px-2 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[10px] font-mono text-[var(--color-ink)] hover:border-[var(--color-primary)] cursor-pointer"
                >
                  +100K tok
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAddTokens(500_000)}
                  className="h-7 px-2 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[10px] font-mono text-[var(--color-ink)] hover:border-[var(--color-primary)] cursor-pointer"
                >
                  +500K tok
                </button>
                <button
                  type="button"
                  onClick={handleResetTokensUsed}
                  className="h-7 px-2 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[10px] font-mono text-[var(--color-warning)] hover:border-[var(--color-warning)] cursor-pointer sm:ml-auto"
                  title="Reset used tokens counter to zero"
                >
                  Reset Used (0)
                </button>
              </div>
            </div>
          )}

          {/* Recurring Mode Settings */}
          {quotaMode === "recurring" && (
            <div className="p-3 rounded-[4px] bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[var(--color-mute)]">Request Limit:</label>
                  <Input
                    type="number"
                    min={1}
                    value={recurringRequestLimit}
                    onChange={(e) => setRecurringRequestLimit(e.target.value)}
                    placeholder="e.g. 500"
                    className="w-full"
                    inputClassName="h-9 text-xs py-1 font-mono rounded-[4px]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[var(--color-mute)]">Token Limit:</label>
                  <Input
                    type="number"
                    min={1}
                    value={recurringTokenLimit}
                    onChange={(e) => setRecurringTokenLimit(e.target.value)}
                    placeholder="e.g. 1000000"
                    className="w-full"
                    inputClassName="h-9 text-xs py-1 font-mono rounded-[4px]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[var(--color-mute)]">Window:</label>
                  <select
                    value={recurringWindow}
                    onChange={(e) => setRecurringWindow(e.target.value)}
                    className="h-9 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2.5 text-xs font-mono text-[var(--color-ink)] outline-none transition-colors hover:border-[var(--color-primary)] cursor-pointer w-full"
                  >
                    <option value="daily">Daily (24h UTC)</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nested Model Picker */}
      {pickerOpen && (
        <ModelSelectModal
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={handleAddAllowedModel}
          onDeselect={(model) => handleRemoveAllowedModel(model?.value || "")}
          activeProviders={activeProviders}
          modelAliases={modelAliases}
          title={`Allowed Models for "${name || apiKey.name}"`}
          addedModelValues={accessAllow}
          closeOnSelect={false}
        />
      )}
    </Modal>
  );
}

EditKeyForm.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  apiKey: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  activeProviders: PropTypes.array,
  modelAliases: PropTypes.object,
};

export default function EditKeyModal({
  isOpen,
  apiKey,
  onClose,
  onSave,
  activeProviders = [],
  modelAliases = {},
}) {
  if (!isOpen || !apiKey) return null;

  return (
    <EditKeyForm
      key={`${apiKey.id}-${isOpen}`}
      isOpen={isOpen}
      apiKey={apiKey}
      onClose={onClose}
      onSave={onSave}
      activeProviders={activeProviders}
      modelAliases={modelAliases}
    />
  );
}

EditKeyModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  apiKey: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  activeProviders: PropTypes.array,
  modelAliases: PropTypes.object,
};
