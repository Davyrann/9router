"use client";

import { useState, useEffect } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { Card, Button, Modal, Input, CardSkeleton, ModelSelectModal, ConfirmModal, CapacityBadges, Select, Toggle } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { aggregateComboCapabilities } from "open-sse/providers/capabilities.js";
import { cn } from "@/shared/utils/cn";

// Validate combo name: only a-z, A-Z, 0-9, -, _
const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

// Capacity adapter: global fallback pools of models per input-modality capability.
// A request needing a capability the target model/combo lacks switches straight
// to the first enabled model here instead of erroring or dropping the data.
const CAPACITY_ADAPTER_CAPS = [
  { key: "vision", label: "Vision", icon: "visibility", desc: "images (png, jpg, webp, …)" },
  // pdf, videoInput temporarily hidden — no translator support yet for those blocks.
  { key: "audioInput", label: "Audio", icon: "graphic_eq", desc: "audio input" },
];
const DEFAULT_FALLBACK_MODEL = "oc/mimo-v2.6-flash-free";
const EMPTY_CAP_ENTRY = { enabled: true, roundRobin: false, models: [] };
const EMPTY_CAPACITY_ADAPTER = {
  vision: { ...EMPTY_CAP_ENTRY },
  pdf: { ...EMPTY_CAP_ENTRY },
  audioInput: { ...EMPTY_CAP_ENTRY },
  videoInput: { ...EMPTY_CAP_ENTRY },
};
const upgradeLegacyModel = (m) => (m === "oc/mimo-v2.5-free" ? DEFAULT_FALLBACK_MODEL : m);

// Backward-compat: legacy stored form was an array of {model, enabled}.
function normalizeCapEntry(entry) {
  if (Array.isArray(entry)) {
    return { enabled: true, roundRobin: false, models: entry.map((e) => upgradeLegacyModel(e?.model || e)).filter(Boolean) };
  }
  if (entry && typeof entry === "object") {
    return {
      enabled: entry.enabled !== false,
      roundRobin: !!entry.roundRobin,
      models: Array.isArray(entry.models) ? entry.models.map(upgradeLegacyModel).filter(Boolean) : [],
    };
  }
  return { ...EMPTY_CAP_ENTRY };
}

const STRATEGY_OPTIONS = [
  { value: "fallback", label: "Fallback — try in order" },
  { value: "round-robin", label: "Round Robin — rotate" },
  { value: "fusion", label: "Fusion — panel + judge" },
];

export default function CombosPage() {
  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState(null);
  const [activeProviders, setActiveProviders] = useState([]);
  const [comboStrategies, setComboStrategies] = useState({});
  const [capacityAdapter, setCapacityAdapter] = useState(EMPTY_CAPACITY_ADAPTER);
  const { getCaps } = useModelCaps();
  const [confirmState, setConfirmState] = useState(null);
  const [presetLoading, setPresetLoading] = useState(null); // "cursor" | "claude" | null
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const { copied, copy } = useCopyToClipboard();

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Drop stale selection when the combo list changes (delete / refresh).
  useEffect(() => {
    const alive = new Set(combos.map((c) => c.id));
    setSelectedIds((prev) => prev.filter((id) => alive.has(id)));
  }, [combos]);

  const selectedCombos = combos.filter((c) => selectedIds.includes(c.id));
  const allSelected = combos.length > 0 && selectedIds.length === combos.length;
  const someSelected = selectedIds.length > 0;

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : combos.map((c) => c.id));
  };

  const clearSelection = () => setSelectedIds([]);

  const handleGeneratePresets = async (source) => {
    const label = source === "cursor" ? "Cursor Default" : "Claude Default";
    setPresetLoading(source);
    try {
      const previewRes = await fetch(`/api/combos/presets?source=${source}`);
      const preview = await previewRes.json();
      if (!previewRes.ok) {
        alert(preview.error || `Failed to preview ${label}`);
        return;
      }

      const toCreate = preview.toCreate ?? (preview.items || []).filter((i) => !i.exists).length;
      const toSkip = preview.toSkip ?? (preview.items || []).filter((i) => i.exists).length;
      const total = (preview.items || []).length;

      if (total === 0) {
        alert(`No ${label} models available to generate.`);
        return;
      }

      if (toCreate === 0) {
        alert(`All ${total} ${label} combos already exist. Nothing to create.`);
        return;
      }

      setConfirmState({
        title: `Generate ${label}`,
        message: `Create ${toCreate} combo${toCreate === 1 ? "" : "s"} named like ${source === "cursor" ? "Cursor" : "Claude"} model IDs (seeded with cu/… or cc/…). ${toSkip} already exist and will be skipped. You can edit any combo afterward to add fallbacks.`,
        confirmText: "Generate",
        variant: "primary",
        onConfirm: async () => {
          setConfirmState((prev) => prev ? { ...prev, loading: true } : null);
          try {
            const res = await fetch("/api/combos/presets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ source }),
            });
            const data = await res.json();
            if (!res.ok) {
              alert(data.error || `Failed to generate ${label}`);
              return;
            }
            await fetchData();
            setConfirmState(null);
          } catch (error) {
            console.log(`Error generating ${label}:`, error);
            alert(`Failed to generate ${label}`);
            setConfirmState((prev) => prev ? { ...prev, loading: false } : null);
          }
        },
      });
    } catch (error) {
      console.log(`Error previewing ${label}:`, error);
      alert(`Failed to preview ${label}`);
    } finally {
      setPresetLoading(null);
    }
  };

  const fetchData = async () => {
    try {
      const [combosRes, providersRes, settingsRes] = await Promise.all([
        fetch("/api/combos"),
        fetch("/api/providers"),
        fetch("/api/settings"),
      ]);
      const combosData = await combosRes.json();
      const providersData = await providersRes.json();
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};

      // Only LLM combos here - webSearch/webFetch combos belong to media-providers/web
      if (combosRes.ok) setCombos((combosData.combos || []).filter(c => !c.kind || c.kind === "llm"));
      if (providersRes.ok) {
        setActiveProviders((providersData.connections || []).filter((c) => c.isActive !== false));
      }
      setComboStrategies(settingsData.comboStrategies || {});
      const rawAdapter = settingsData.capacityAdapter || {};
      const normalized = {};
      for (const cap of CAPACITY_ADAPTER_CAPS) {
        normalized[cap.key] = normalizeCapEntry(rawAdapter[cap.key]);
      }
      setCapacityAdapter(normalized);
    } catch (error) {
      console.log("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetCapacityAdapter = async (next) => {
    setCapacityAdapter(next);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capacityAdapter: next }),
      });
    } catch (error) {
      console.log("Error updating capacity adapter:", error);
    }
  };

  const handleCreate = async (data) => {
    try {
      const res = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchData();
        setShowCreateModal(false);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create combo");
      }
    } catch (error) {
      console.log("Error creating combo:", error);
    }
  };

  const handleUpdate = async (id, data) => {
    try {
      const res = await fetch(`/api/combos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchData();
        setEditingCombo(null);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update combo");
      }
    } catch (error) {
      console.log("Error updating combo:", error);
    }
  };

  const pruneStrategiesForNames = (names, base = comboStrategies) => {
    const updated = { ...base };
    for (const name of names) delete updated[name];
    return updated;
  };

  const persistComboStrategies = async (updated) => {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comboStrategies: updated }),
    });
    setComboStrategies(updated);
  };

  const handleDelete = async (id) => {
    const combo = combos.find((c) => c.id === id);
    setConfirmState({
      title: "Delete Combo",
      message: combo ? `Delete combo "${combo.name}"?` : "Delete this combo?",
      onConfirm: async () => {
        setConfirmState((prev) => prev ? { ...prev, loading: true } : null);
        try {
          const res = await fetch(`/api/combos/${id}`, { method: "DELETE" });
          if (res.ok) {
            if (combo?.name) {
              await persistComboStrategies(pruneStrategiesForNames([combo.name]));
            }
            setCombos((prev) => prev.filter((c) => c.id !== id));
            setSelectedIds((prev) => prev.filter((x) => x !== id));
          }
          setConfirmState(null);
        } catch (error) {
          console.log("Error deleting combo:", error);
          setConfirmState((prev) => prev ? { ...prev, loading: false } : null);
        }
      }
    });
  };

  const handleBulkDelete = () => {
    if (selectedCombos.length === 0) return;
    const count = selectedCombos.length;
    setConfirmState({
      title: "Delete Selected Combos",
      message: `Delete ${count} selected combo${count === 1 ? "" : "s"}? This cannot be undone.`,
      confirmText: "Delete",
      variant: "danger",
      onConfirm: async () => {
        setConfirmState((prev) => prev ? { ...prev, loading: true } : null);
        setBulkBusy(true);
        try {
          const ids = selectedCombos.map((c) => c.id);
          const names = selectedCombos.map((c) => c.name);
          const results = await Promise.all(
            ids.map((id) => fetch(`/api/combos/${id}`, { method: "DELETE" }))
          );
          const failed = results.filter((r) => !r.ok).length;
          await persistComboStrategies(pruneStrategiesForNames(names));
          setCombos((prev) => prev.filter((c) => !ids.includes(c.id)));
          clearSelection();
          setConfirmState(null);
          if (failed > 0) alert(`Deleted with ${failed} failure${failed === 1 ? "" : "s"}.`);
        } catch (error) {
          console.log("Error bulk deleting combos:", error);
          alert("Failed to delete selected combos");
          setConfirmState((prev) => prev ? { ...prev, loading: false } : null);
        } finally {
          setBulkBusy(false);
        }
      },
    });
  };

  // Merge a per-combo strategy patch into settings.comboStrategies. Passing an empty
  // patch (strategy back to default "fallback") drops the entry entirely.
  const handleSetComboStrategy = async (comboName, patch) => {
    try {
      const updated = { ...comboStrategies };
      const next = { ...(updated[comboName] || {}), ...patch };
      // Prune to keep settings clean: default fallback with no extras = no entry.
      if (!next.fallbackStrategy || next.fallbackStrategy === "fallback") {
        delete updated[comboName];
      } else {
        updated[comboName] = next;
      }

      await persistComboStrategies(updated);
    } catch (error) {
      console.log("Error updating combo strategy:", error);
    }
  };

  const handleBulkSetStrategy = async (strategy) => {
    if (selectedCombos.length === 0 || !strategy) return;
    setBulkBusy(true);
    try {
      const updated = { ...comboStrategies };
      for (const combo of selectedCombos) {
        if (!strategy || strategy === "fallback") {
          delete updated[combo.name];
        } else {
          updated[combo.name] = {
            ...(updated[combo.name] || {}),
            fallbackStrategy: strategy,
          };
        }
      }
      await persistComboStrategies(updated);
    } catch (error) {
      console.log("Error bulk updating combo strategy:", error);
      alert("Failed to update strategy for selected combos");
    } finally {
      setBulkBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 px-1 sm:px-0" style={{ fontFamily: "var(--font-mono)" }}>
      {/* Header — Mobile First */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[var(--color-hairline)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[var(--color-ink)]">layers</span>
            <h1 className="text-[16px] font-bold text-[var(--color-ink)]">Model Combos</h1>
          </div>
          <p className="text-[13px] text-[var(--color-mute)] mt-0.5 leading-tight">
            Group models under a single route with fallback or load balancing.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowGuide((v) => !v)}
            className="h-8 px-2.5 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] text-[12px] font-mono text-[var(--color-mute)] hover:text-[var(--color-ink)] rounded transition-colors text-center cursor-pointer whitespace-nowrap shrink-0"
            title="Toggle strategy explanation"
          >
            {showGuide ? "[x] Close" : "[?] Guide"}
          </button>
          <Button
            size="sm"
            icon="add"
            onClick={() => setShowCreateModal(true)}
            className="flex-1 sm:flex-initial shrink-0 whitespace-nowrap"
          >
            Create Combo
          </Button>
        </div>
      </div>

      {/* Guide Drawer */}
      {showGuide && (
        <div className="p-3.5 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] rounded font-mono text-[13px] text-[var(--color-body)] flex flex-col gap-2">
          <div className="flex items-center justify-between pb-1.5 border-b border-[var(--color-hairline)] font-bold text-[var(--color-ink)]">
            <span>Routing Strategies</span>
            <button
              onClick={() => setShowGuide(false)}
              className="text-[var(--color-mute)] hover:text-[var(--color-ink)]"
            >
              [x]
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <div>
              <strong className="text-[var(--color-ink)]">[+] Fallback:</strong> Tries models in sequential order. Automatically hops to the next model upon rate limit or error.
            </div>
            <div>
              <strong className="text-[var(--color-ink)]">[+] Round Robin:</strong> Distributes requests evenly across models in the combo to balance quota.
            </div>
            <div>
              <strong className="text-[var(--color-ink)]">[+] Fusion:</strong> Queries models in parallel, then uses a judge model to synthesize the final answer (bills all models + judge).
            </div>
          </div>
        </div>
      )}

      {/* Combos List */}
      {combos.length === 0 ? (
        <div className="text-center py-12 px-6 border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-mute)] font-mono text-[14px]">
          <span className="material-symbols-outlined text-[32px] text-[var(--color-mute)] mb-2">layers</span>
          <p className="font-bold text-[var(--color-ink)] text-[16px] mb-1">[-] No combos created yet</p>
          <p className="text-[13px] text-[var(--color-mute)] mb-4">
            Combine multiple providers or models into a single endpoint with automatic fallback.
          </p>
          <Button icon="add" onClick={() => setShowCreateModal(true)} className="w-full sm:w-auto">
            Create First Combo
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Selection toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 p-2.5 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] rounded font-mono text-[13px]">
            <label className="flex items-center gap-2 cursor-pointer select-none text-[var(--color-mute)] hover:text-[var(--color-ink)]">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected && !allSelected;
                }}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-[var(--color-hairline-strong)] text-[var(--color-primary)] focus:ring-0 cursor-pointer"
              />
              <span>
                {someSelected
                  ? `${selectedIds.length} of ${combos.length} selected`
                  : `Select all (${combos.length})`}
              </span>
            </label>

            {someSelected && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value=""
                  disabled={bulkBusy}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) handleBulkSetStrategy(v);
                  }}
                  className="h-8 rounded border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-2.5 text-[12px] font-mono text-[var(--color-ink)] outline-none"
                >
                  <option value="" disabled>Set strategy…</option>
                  {STRATEGY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <Button
                  size="xs"
                  variant="danger"
                  icon="delete"
                  disabled={bulkBusy}
                  loading={bulkBusy}
                  onClick={handleBulkDelete}
                >
                  Delete ({selectedIds.length})
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={clearSelection}
                  disabled={bulkBusy}
                >
                  Clear
                </Button>
              </div>
            )}
          </div>

          {/* Cards Grid / Stack */}
          <div className="flex flex-col gap-3">
            {(() => {
              const comboByName = Object.fromEntries(combos.map((c) => [c.name, c.models]));
              return combos.map((combo) => (
                <ComboCard
                  key={combo.id}
                  combo={combo}
                  getCaps={getCaps}
                  comboByName={comboByName}
                  activeProviders={activeProviders}
                  copied={copied}
                  onCopy={copy}
                  onEdit={() => setEditingCombo(combo)}
                  onDelete={() => handleDelete(combo.id)}
                  strategy={comboStrategies[combo.name] || {}}
                  onSetStrategy={(patch) => handleSetComboStrategy(combo.name, patch)}
                  selected={selectedIds.includes(combo.id)}
                  onToggleSelect={() => toggleSelect(combo.id)}
                />
              ));
            })()}
          </div>
        </div>
      )}

      {/* Capacity Adapter */}
      <CapacityAdapterSection
        capacityAdapter={capacityAdapter}
        onChange={handleSetCapacityAdapter}
        activeProviders={activeProviders}
        getCaps={getCaps}
      />

      {/* Create Modal */}
      {showCreateModal && (
        <ComboFormModal
          key="create"
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreate}
          activeProviders={activeProviders}
        />
      )}

      {editingCombo && (
        <ComboFormModal
          key={editingCombo.id}
          isOpen={!!editingCombo}
          combo={editingCombo}
          onClose={() => setEditingCombo(null)}
          onSave={(data) => handleUpdate(editingCombo.id, data)}
          activeProviders={activeProviders}
        />
      )}

      {/* Confirm modal */}
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => !confirmState?.loading && setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Confirm"}
        message={confirmState?.message}
        confirmText={confirmState?.confirmText || "Confirm"}
        variant={confirmState?.variant || "danger"}
        loading={!!confirmState?.loading}
      />
    </div>
  );
}

const fmtK = (n) => {
  if (!n) return "?";
  if (n >= 1000000) {
    const m = n / 1000000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  return `${Math.round(n / 1000)}k`;
};

function ComboCard({
  combo,
  getCaps,
  comboByName = {},
  activeProviders = [],
  copied,
  onCopy,
  onEdit,
  onDelete,
  strategy = {},
  onSetStrategy,
  selected = false,
  onToggleSelect,
}) {
  const [showJudgeSelect, setShowJudgeSelect] = useState(false);
  const current = strategy.fallbackStrategy || "fallback";
  const judge = strategy.judgeModel || "";
  const isFusion = current === "fusion";
  const comboCaps = aggregateComboCapabilities(combo.models, comboByName, getCaps);

  return (
    <div
      className={cn(
        "p-3.5 sm:p-4 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] rounded flex flex-col gap-3 transition-colors",
        selected && "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/30"
      )}
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-[var(--color-hairline-strong)] text-[var(--color-primary)] focus:ring-0 cursor-pointer shrink-0"
            aria-label={`Select ${combo.name}`}
          />
          <span className="font-mono font-bold text-[15px] sm:text-[16px] text-[var(--color-ink)] truncate">
            {combo.name}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopy(combo.name, `combo-${combo.id}`);
            }}
            className="flex items-center justify-center h-7 px-2 border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[12px] font-mono text-[var(--color-mute)] hover:text-[var(--color-ink)] rounded transition-colors cursor-pointer"
            title="Copy combo name"
          >
            <span className="material-symbols-outlined text-[14px] mr-1">
              {copied === `combo-${combo.id}` ? "check" : "content_copy"}
            </span>
            {copied === `combo-${combo.id}` ? "Copied" : "Copy"}
          </button>
          <button
            onClick={onEdit}
            className="flex items-center justify-center h-7 px-2 border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[12px] font-mono text-[var(--color-mute)] hover:text-[var(--color-ink)] rounded transition-colors cursor-pointer"
            title="Edit combo"
          >
            <span className="material-symbols-outlined text-[14px] mr-1">edit</span>
            Edit
          </button>
          <button
            onClick={onDelete}
            className="flex items-center justify-center size-7 border border-red-500/20 text-red-500 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
            title="Delete combo"
            aria-label="Delete combo"
          >
            <span className="material-symbols-outlined text-[15px]">delete</span>
          </button>
        </div>
      </div>

      {/* Model Sequence / Pipeline Display */}
      <div className="p-2.5 bg-[var(--color-canvas)] border border-[var(--color-hairline)] rounded flex flex-col gap-2">
        {/* Desktop: horizontal pipeline chain */}
        <div className="hidden sm:flex flex-wrap items-center gap-1.5 font-mono text-[12px]">
          {combo.models.length === 0 ? (
            <span className="text-[var(--color-ash)] italic">No models configured</span>
          ) : (
            combo.models.map((model, index) => (
              <div key={index} className="inline-flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] rounded text-[var(--color-ink)] inline-flex items-center gap-1.5">
                  <span className="text-[var(--color-ash)] font-medium">#{index + 1}</span>
                  <span className="font-medium truncate max-w-[200px] sm:max-w-none">{model}</span>
                  <CapacityBadges
                    caps={
                      comboByName[model]
                        ? aggregateComboCapabilities(comboByName[model], comboByName, getCaps)
                        : getCaps?.(model)
                    }
                  />
                </span>
                {index < combo.models.length - 1 && (
                  <span className="text-[var(--color-ash)] font-bold text-[11px]">→</span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Mobile: clean vertical pipeline with downward fallback indicators */}
        <div className="flex sm:hidden flex-col gap-1 font-mono text-[12px]">
          {combo.models.length === 0 ? (
            <span className="text-[var(--color-ash)] italic py-1">No models configured</span>
          ) : (
            combo.models.map((model, index) => (
              <div key={index} className="flex flex-col">
                <div className="flex items-center justify-between gap-2 p-2 bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] rounded">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="text-[10px] text-[var(--color-ash)] font-bold shrink-0">#{index + 1}</span>
                    <span className="font-medium text-[var(--color-ink)] truncate text-[12px]">{model}</span>
                  </div>
                  <CapacityBadges
                    caps={
                      comboByName[model]
                        ? aggregateComboCapabilities(comboByName[model], comboByName, getCaps)
                        : getCaps?.(model)
                    }
                  />
                </div>
                {index < combo.models.length - 1 && (
                  <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-[var(--color-ash)]">
                    <span className="font-bold text-[11px]">↓</span>
                    <span>fallback</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Limits & Capabilities Info */}
        {comboCaps && (
          <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--color-mute)] pt-1.5 border-t border-[var(--color-hairline)]">
            <span>
              ctx: <strong className="text-[var(--color-ink)] font-normal">{fmtK(comboCaps.contextWindow)}</strong>
            </span>
            <span className="text-[var(--color-ash)]">·</span>
            <span>
              max output: <strong className="text-[var(--color-ink)] font-normal">{fmtK(comboCaps.maxOutput)}</strong>
            </span>
            <span className="text-[var(--color-ash)]">·</span>
            <span>{combo.models.length} model{combo.models.length === 1 ? "" : "s"}</span>
          </div>
        )}
      </div>

      {/* Bottom Strategy Bar — Centered vertically */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2.5 mt-0.5 border-t border-[var(--color-hairline)]">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-mono text-[var(--color-mute)] shrink-0">Strategy:</span>
          <select
            value={current}
            onChange={(e) => onSetStrategy({ fallbackStrategy: e.target.value })}
            className="h-8 rounded border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-2.5 text-[12px] font-mono text-[var(--color-ink)] outline-none flex-1 sm:flex-initial cursor-pointer hover:border-[var(--color-hairline-strong)] transition-colors"
          >
            {STRATEGY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Fusion Judge Selector */}
        {isFusion && (
          <div className="flex items-center gap-1.5 flex-wrap font-mono text-[12px]">
            <span className="text-[var(--color-mute)]">Judge:</span>
            <button
              onClick={() => setShowJudgeSelect(true)}
              className="h-7 px-2 border border-dashed border-[var(--color-hairline-strong)] bg-[var(--color-canvas)] rounded text-[var(--color-primary)] hover:border-[var(--color-primary)] transition-colors inline-flex items-center gap-1 cursor-pointer"
              title="Pick the model that fuses panel answers"
            >
              <span className="material-symbols-outlined text-[13px]">gavel</span>
              <span className="truncate max-w-[180px]">{judge || `Auto (${combo.models[0] || "first"})`}</span>
            </button>
            {judge && (
              <button
                onClick={() => onSetStrategy({ judgeModel: "" })}
                className="h-7 px-1.5 text-[var(--color-mute)] hover:text-red-500 cursor-pointer"
                title="Reset judge to Auto"
              >
                [x]
              </button>
            )}
          </div>
        )}
      </div>

      {/* Judge model picker */}
      {showJudgeSelect && (
        <ModelSelectModal
          isOpen={showJudgeSelect}
          onClose={() => setShowJudgeSelect(false)}
          onSelect={(m) => {
            onSetStrategy({ judgeModel: m?.value || "" });
            setShowJudgeSelect(false);
          }}
          activeProviders={activeProviders}
          title="Select Judge Model"
          addedModelValues={judge ? [judge] : []}
          closeOnSelect={true}
        />
      )}
    </div>
  );
}

function CapacityAdapterSection({ capacityAdapter, onChange, activeProviders, getCaps }) {
  return (
    <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-[var(--color-hairline)] font-mono">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-[var(--color-ink)]">auto_awesome</span>
          <h2 className="text-[16px] font-bold text-[var(--color-ink)]">Capacity Adapter</h2>
        </div>
        <p className="text-[13px] text-[var(--color-mute)] leading-tight">
          Auto-switches to capable fallback models when the targeted model lacks vision or audio support.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {CAPACITY_ADAPTER_CAPS.map((cap) => (
          <CapacityAdapterCap
            key={cap.key}
            cap={cap}
            entry={capacityAdapter[cap.key] || EMPTY_CAP_ENTRY}
            onChange={(entry) => onChange({ ...capacityAdapter, [cap.key]: entry })}
            activeProviders={activeProviders}
            getCaps={getCaps}
          />
        ))}
      </div>
    </div>
  );
}

function CapacityAdapterCap({ cap, entry, onChange, activeProviders, getCaps }) {
  const [showModelSelect, setShowModelSelect] = useState(false);
  const { enabled, roundRobin, models } = entry;

  const patch = (p) => onChange({ ...entry, ...p });

  const handleAdd = (model) => {
    const value = model?.value || model?.name || model;
    if (!value || models.includes(value)) return;
    patch({ models: [...models, value] });
  };

  const handleDeselect = (model) => {
    const value = model?.value || model?.name || model;
    const next = models.filter((m) => m !== value);
    patch({ models: next.length === 0 ? [DEFAULT_FALLBACK_MODEL] : next });
  };

  const handleRemove = (index) => {
    const next = models.filter((_, i) => i !== index);
    patch({ models: next.length === 0 ? [DEFAULT_FALLBACK_MODEL] : next });
  };

  const handleMove = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= models.length) return;
    const next = [...models];
    [next[index], next[target]] = [next[target], next[index]];
    patch({ models: next });
  };

  return (
    <div
      className={cn(
        "p-3.5 sm:p-4 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] rounded flex flex-col gap-3 transition-colors",
        !enabled && "opacity-60"
      )}
    >
      {/* Cap Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <Toggle
            checked={enabled}
            onChange={(v) => patch({ enabled: v })}
            aria-label={`Enable ${cap.label} adapter`}
          />
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono font-bold text-[14px] text-[var(--color-ink)]">{cap.label}</span>
            <span className="text-[12px] text-[var(--color-mute)] truncate">— {cap.desc}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-[var(--color-hairline)]">
          <label className="flex items-center gap-2 text-[12px] font-mono text-[var(--color-mute)] cursor-pointer select-none">
            <Toggle
              size="sm"
              checked={roundRobin}
              onChange={(v) => patch({ roundRobin: v })}
              disabled={!enabled}
              aria-label={`Round-robin ${cap.label} adapter`}
            />
            <span>Round-Robin</span>
          </label>
          <Button
            variant="secondary"
            size="xs"
            icon="add"
            onClick={() => setShowModelSelect(true)}
            disabled={!enabled}
            title={`Add ${cap.label} model`}
          >
            Add Model
          </Button>
        </div>
      </div>

      {/* Model Pool Ordered List (Mobile-First Card Rows) */}
      {models.length === 0 ? (
        <div className="p-3 border border-dashed border-[var(--color-hairline)] rounded text-center text-[12px] font-mono text-[var(--color-mute)] bg-[var(--color-canvas)]">
          No models in pool (will fallback to {DEFAULT_FALLBACK_MODEL})
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {models.map((model, index) => (
            <div
              key={`${model}-${index}`}
              className="p-2 sm:px-3 sm:py-2 border border-[var(--color-hairline)] bg-[var(--color-canvas)] rounded flex items-center justify-between gap-2 font-mono text-[13px]"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[11px] text-[var(--color-ash)] shrink-0 w-6">#{index + 1}</span>
                <span className="text-[var(--color-ink)] font-medium truncate">{model}</span>
                <CapacityBadges caps={getCaps?.(model)} />
                {model === DEFAULT_FALLBACK_MODEL && (
                  <span className="hidden sm:inline-block px-1.5 py-0.2 text-[10px] text-[var(--color-success)] border border-[rgba(48,209,88,0.3)] rounded shrink-0">
                    default
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleMove(index, -1)}
                  disabled={!enabled || index === 0}
                  className="flex items-center justify-center size-7 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] text-[var(--color-mute)] hover:text-[var(--color-ink)] disabled:opacity-30 disabled:cursor-not-allowed rounded cursor-pointer transition-colors"
                  title="Move up"
                >
                  <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(index, 1)}
                  disabled={!enabled || index === models.length - 1}
                  className="flex items-center justify-center size-7 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] text-[var(--color-mute)] hover:text-[var(--color-ink)] disabled:opacity-30 disabled:cursor-not-allowed rounded cursor-pointer transition-colors"
                  title="Move down"
                >
                  <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  disabled={!enabled}
                  className="flex items-center justify-center size-7 border border-red-500/20 text-red-500 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors cursor-pointer"
                  title="Remove"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModelSelect && (
        <ModelSelectModal
          isOpen={showModelSelect}
          onClose={() => setShowModelSelect(false)}
          onSelect={handleAdd}
          onDeselect={handleDeselect}
          activeProviders={activeProviders}
          title={`Add ${cap.label} Model`}
          addedModelValues={models}
          capFilter={cap.key}
          closeOnSelect={false}
        />
      )}
    </div>
  );
}

function ModelItem({ id, index, model, isFirst, isLast, onEdit, onMoveUp, onMoveDown, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(model);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== model) onEdit(trimmed);
    else setDraft(model);
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      setDraft(model);
      setEditing(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "p-2 border border-[var(--color-hairline)] bg-[var(--color-canvas)] rounded flex items-center justify-between gap-2 font-mono text-[13px] transition-colors",
        isDragging && "ring-1 ring-[var(--color-primary)]/40"
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab touch-none p-1 rounded text-[var(--color-ash)] hover:text-[var(--color-ink)] active:cursor-grabbing shrink-0"
          title="Drag to reorder"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="4" r="2" />
            <circle cx="15" cy="4" r="2" />
            <circle cx="9" cy="12" r="2" />
            <circle cx="15" cy="12" r="2" />
            <circle cx="9" cy="20" r="2" />
            <circle cx="15" cy="20" r="2" />
          </svg>
        </button>

        {/* Index badge */}
        <span className="text-[11px] text-[var(--color-ash)] shrink-0 w-5">#{index + 1}</span>

        {/* Editable Model Name */}
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 rounded border border-[var(--color-hairline-strong)] bg-[var(--color-surface-soft)] px-2 py-0.5 font-mono text-[12px] text-[var(--color-ink)] outline-none"
          />
        ) : (
          <span
            className="min-w-0 flex-1 cursor-text truncate font-mono text-[12px] text-[var(--color-ink)] hover:underline"
            onClick={() => setEditing(true)}
            title="Click to edit model ID"
          >
            {model}
          </span>
        )}
      </div>

      {/* Up / Down / Remove buttons */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="flex items-center justify-center size-6 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] text-[var(--color-mute)] hover:text-[var(--color-ink)] disabled:opacity-30 disabled:cursor-not-allowed rounded cursor-pointer"
          title="Move up"
        >
          <span className="material-symbols-outlined text-[13px]">arrow_upward</span>
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="flex items-center justify-center size-6 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] text-[var(--color-mute)] hover:text-[var(--color-ink)] disabled:opacity-30 disabled:cursor-not-allowed rounded cursor-pointer"
          title="Move down"
        >
          <span className="material-symbols-outlined text-[13px]">arrow_downward</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center justify-center size-6 border border-red-500/20 text-red-500 hover:bg-red-500/10 rounded cursor-pointer transition-colors"
          title="Remove"
        >
          <span className="material-symbols-outlined text-[13px]">close</span>
        </button>
      </div>
    </div>
  );
}

function ComboFormModal({ isOpen, combo, onClose, onSave, activeProviders, kindFilter = null }) {
  const [name, setName] = useState(combo?.name || "");
  const [models, setModels] = useState(combo?.models || []);
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [modelAliases, setModelAliases] = useState({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const modelItems = models.map((model, i) => ({ uid: `item-${i}`, model }));

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = modelItems.findIndex((m) => m.uid === active.id);
      const newIndex = modelItems.findIndex((m) => m.uid === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        setModels((prev) => arrayMove(prev, oldIndex, newIndex));
      }
    }
  };

  const fetchModalData = async () => {
    try {
      const aliasesRes = await fetch("/api/models/alias");
      if (!aliasesRes.ok) return;
      const aliasesData = await aliasesRes.json();
      setModelAliases(aliasesData.aliases || {});
    } catch (error) {
      console.error("Error fetching modal data:", error);
    }
  };

  useEffect(() => {
    if (isOpen) fetchModalData();
  }, [isOpen]);

  const validateName = (value) => {
    if (!value.trim()) {
      setNameError("Name is required");
      return false;
    }
    if (!VALID_NAME_REGEX.test(value)) {
      setNameError("Only letters, numbers, -, _ and . allowed");
      return false;
    }
    setNameError("");
    return true;
  };

  const handleNameChange = (e) => {
    const value = e.target.value;
    setName(value);
    if (value) validateName(value);
    else setNameError("");
  };

  const handleAddModel = (model) => {
    if (!models.includes(model.value)) {
      setModels([...models, model.value]);
    }
  };

  const handleDeselectModel = (model) => {
    setModels(models.filter((m) => m !== model.value));
  };

  const handleRemoveModel = (index) => {
    setModels(models.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    const newModels = [...models];
    [newModels[index - 1], newModels[index]] = [newModels[index], newModels[index - 1]];
    setModels(newModels);
  };

  const handleMoveDown = (index) => {
    if (index === models.length - 1) return;
    const newModels = [...models];
    [newModels[index], newModels[index + 1]] = [newModels[index + 1], newModels[index]];
    setModels(newModels);
  };

  const handleSave = async () => {
    if (!validateName(name)) return;
    setSaving(true);
    await onSave({ name: name.trim(), models });
    setSaving(false);
  };

  const isEdit = !!combo;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={isEdit ? "Edit Combo" : "Create Combo"}
        scrollable={false}
        bodyClassName="p-3.5 sm:p-5"
        footer={
          <>
            <Button onClick={onClose} variant="ghost">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || !!nameError || saving}
            >
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Combo"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 font-mono">
          {/* Name */}
          <div>
            <Input
              label="Combo Name"
              value={name}
              onChange={handleNameChange}
              placeholder="e.g. smart-fallback"
              error={nameError}
              hint="Only letters, numbers, -, _ and . allowed."
              required
              autoFocus
            />
          </div>

          {/* Models */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-bold text-[var(--color-ink)]">
                Models in Sequence
              </label>
              <span className="text-[11px] text-[var(--color-mute)]">
                {models.length} model{models.length === 1 ? "" : "s"}
              </span>
            </div>

            {models.length === 0 ? (
              <div className="text-center py-5 border border-dashed border-[var(--color-hairline)] rounded bg-[var(--color-surface-soft)]">
                <span className="material-symbols-outlined text-[22px] text-[var(--color-mute)] mb-0.5">layers</span>
                <p className="text-[12px] text-[var(--color-mute)]">No models added yet</p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              >
                <SortableContext items={modelItems.map((m) => m.uid)} strategy={verticalListSortingStrategy}>
                  <div className="flex max-h-[160px] sm:max-h-[220px] min-w-0 flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-0.5">
                    {modelItems.map(({ uid, model }, index) => (
                      <ModelItem
                        key={uid}
                        id={uid}
                        index={index}
                        model={model}
                        isFirst={index === 0}
                        isLast={index === modelItems.length - 1}
                        onEdit={(newVal) => {
                          const updated = [...models];
                          updated[index] = newVal;
                          setModels(updated);
                        }}
                        onMoveUp={() => handleMoveUp(index)}
                        onMoveDown={() => handleMoveDown(index)}
                        onRemove={() => handleRemoveModel(index)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {/* Add Model Button */}
            <Button
              variant="secondary"
              size="sm"
              icon="add"
              onClick={() => setShowModelSelect(true)}
              className="w-full mt-0.5"
            >
              Add Model to Sequence
            </Button>
          </div>
        </div>
      </Modal>

      {/* Model Select Modal */}
      {showModelSelect && (
        <ModelSelectModal
          isOpen={showModelSelect}
          onClose={() => setShowModelSelect(false)}
          onSelect={handleAddModel}
          onDeselect={handleDeselectModel}
          activeProviders={activeProviders}
          modelAliases={modelAliases}
          title="Add Model to Combo"
          kindFilter={kindFilter}
          addedModelValues={models}
          closeOnSelect={false}
        />
      )}
    </>
  );
}
