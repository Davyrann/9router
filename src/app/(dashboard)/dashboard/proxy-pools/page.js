"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { Button, Card, CardSkeleton, Input, Modal, Toggle, ConfirmModal } from "@/shared/components";
import Pagination from "@/shared/components/Pagination";
import { useNotificationStore } from "@/store/notificationStore";
import { cn } from "@/shared/utils/cn";

function formatDateTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

function normalizeFormData(data = {}) {
  return {
    name: data.name || "",
    proxyUrl: data.proxyUrl || "",
    noProxy: data.noProxy || "",
    isActive: data.isActive !== false,
    strictProxy: data.strictProxy === true,
  };
}

export default function ProxyPoolsPage() {
  const [proxyPools, setProxyPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showBatchImportModal, setShowBatchImportModal] = useState(false);
  const [showVercelModal, setShowVercelModal] = useState(false);
  const [showCloudflareModal, setShowCloudflareModal] = useState(false);
  const [showDenoModal, setShowDenoModal] = useState(false);
  const [showNetlifyModal, setShowNetlifyModal] = useState(false);
  const [showRelayMenu, setShowRelayMenu] = useState(false);
  const [editingProxyPool, setEditingProxyPool] = useState(null);
  const [formData, setFormData] = useState(normalizeFormData());
  const [batchImportText, setBatchImportText] = useState("");
  const [vercelForm, setVercelForm] = useState({ vercelToken: "", projectName: "vercel-relay" });
  const [cloudflareForm, setCloudflareForm] = useState({ accountId: "", apiToken: "", projectName: "cloudflare-relay" });
  const [denoForm, setDenoForm] = useState({ denoToken: "", orgDomain: "", projectName: "" });
  const [netlifyForm, setNetlifyForm] = useState({ netlifyToken: "", projectName: "netlify-relay" });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1, activeCount: 0 });
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthProgress, setHealthProgress] = useState({ current: 0, total: 0 });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const relayMenuRef = useRef(null);
  const notify = useNotificationStore();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (relayMenuRef.current && !relayMenuRef.current.contains(e.target)) {
        setShowRelayMenu(false);
      }
    };
    if (showRelayMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showRelayMenu]);

  const fetchProxyPools = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        includeUsage: "true",
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      const res = await fetch(`/api/proxy-pools?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setProxyPools(data.proxyPools || []);
        if (data.pagination) {
          setPagination((prev) => ({ ...prev, ...data.pagination }));
          // Page shrank (delete/bulk ops): jump back to the last valid page.
          if (data.pagination.total > 0 && data.pagination.page > data.pagination.totalPages) {
            setPagination((prev) => ({ ...prev, page: data.pagination.totalPages }));
          }
        }
      }
    } catch (error) {
      console.log("Error fetching proxy pools:", error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProxyPools();
  }, [fetchProxyPools]);

  const resetForm = () => {
    setEditingProxyPool(null);
    setFormData(normalizeFormData());
  };

  const openCreateModal = () => {
    resetForm();
    setShowFormModal(true);
  };

  const openEditModal = (proxyPool) => {
    setEditingProxyPool(proxyPool);
    setFormData(normalizeFormData(proxyPool));
    setShowFormModal(true);
  };

  const closeFormModal = () => {
    setShowFormModal(false);
    resetForm();
  };

  const handleSave = async () => {
    const payload = {
      name: formData.name.trim(),
      proxyUrl: formData.proxyUrl.trim(),
      noProxy: formData.noProxy.trim(),
      isActive: formData.isActive === true,
      strictProxy: formData.strictProxy === true,
    };

    if (!payload.name || !payload.proxyUrl) return;

    setSaving(true);
    try {
      const isEdit = !!editingProxyPool;
      const res = await fetch(isEdit ? `/api/proxy-pools/${editingProxyPool.id}` : "/api/proxy-pools", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await fetchProxyPools();
        closeFormModal();
        notify.success(editingProxyPool ? "Proxy pool updated" : "Proxy pool created");
      } else {
        const data = await res.json();
        notify.error(data.error || "Failed to save proxy pool");
      }
    } catch (error) {
      console.log("Error saving proxy pool:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (proxyPool) => {
    setConfirmState({
      title: "Delete Proxy Pool",
      message: `Delete proxy pool "${proxyPool.name}"?`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/proxy-pools/${proxyPool.id}`, { method: "DELETE" });
          if (res.ok) {
            await fetchProxyPools();
            notify.success("Proxy pool deleted");
            return;
          }

          const data = await res.json();
          if (res.status === 409) {
            notify.warning(`Cannot delete: ${data.boundConnectionCount || 0} connection(s) are still using this pool.`);
          } else {
            notify.error(data.error || "Failed to delete proxy pool");
          }
        } catch (error) {
          console.log("Error deleting proxy pool:", error);
          notify.error("Failed to delete proxy pool");
        }
      }
    });
  };

  const handleTest = async (proxyPoolId) => {
    setTestingId(proxyPoolId);
    try {
      const res = await fetch(`/api/proxy-pools/${proxyPoolId}/test`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        notify.error(data.error || "Failed to test proxy");
        return;
      }

      await fetchProxyPools();
      notify.success(data.ok ? "Proxy test passed" : "Proxy test failed");
    } catch (error) {
      console.log("Error testing proxy pool:", error);
      notify.error("Failed to test proxy");
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleActive = async (pool) => {
    const next = !pool.isActive;
    setProxyPools((prev) => prev.map((p) => p.id === pool.id ? { ...p, isActive: next } : p));
    try {
      const res = await fetch(`/api/proxy-pools/${pool.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      if (!res.ok) {
        setProxyPools((prev) => prev.map((p) => p.id === pool.id ? { ...p, isActive: pool.isActive } : p));
        notify.error("Failed to update active state");
      }
    } catch (error) {
      console.log("Error toggling active:", error);
      setProxyPools((prev) => prev.map((p) => p.id === pool.id ? { ...p, isActive: pool.isActive } : p));
    }
  };

  const pageIds = proxyPools.map((p) => p.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const toggleSelect = (id) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelectedIds((prev) => (
    allSelected
      ? prev.filter((id) => !pageIds.includes(id))
      : [...new Set([...prev, ...pageIds])]
  ));
  const clearSelection = () => setSelectedIds([]);
  const handlePageChange = (page) => setPagination((prev) => ({ ...prev, page }));
  const handlePageSizeChange = (pageSize) => setPagination((prev) => ({ ...prev, pageSize, page: 1 }));

  const bulkSetActive = async (isActive) => {
    const targets = selectedIds.length > 0 ? selectedIds : proxyPools.map((p) => p.id);
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      let ok = 0; let failed = 0;
      for (const id of targets) {
        try {
          const res = await fetch(`/api/proxy-pools/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive }),
          });
          if (res.ok) ok += 1; else failed += 1;
        } catch { failed += 1; }
      }
      await fetchProxyPools();
      notify.success(`${isActive ? "Activated" : "Deactivated"} ${ok}${failed ? `, failed ${failed}` : ""}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setConfirmState({
      title: "Delete Proxy Pools",
      message: `Delete ${selectedIds.length} proxy pool(s)?`,
      onConfirm: async () => {
        setConfirmState(null);
        setBulkBusy(true);
        try {
          let ok = 0; let blocked = 0; let failed = 0;
          for (const id of selectedIds) {
            try {
              const res = await fetch(`/api/proxy-pools/${id}`, { method: "DELETE" });
              if (res.ok) ok += 1;
              else if (res.status === 409) blocked += 1;
              else failed += 1;
            } catch { failed += 1; }
          }
          await fetchProxyPools();
          clearSelection();
          notify.success(`Deleted ${ok}${blocked ? `, ${blocked} bound` : ""}${failed ? `, ${failed} failed` : ""}`);
        } finally {
          setBulkBusy(false);
        }
      }
    });
  };

  const handleHealthCheck = async () => {
    let targets = proxyPools;
    if (selectedIds.length > 0) {
      try {
        const res = await fetch("/api/proxy-pools", { cache: "no-store" });
        const data = await res.json();
        targets = (data.proxyPools || []).filter((p) => selectedIds.includes(p.id));
      } catch {
        targets = proxyPools.filter((p) => selectedIds.includes(p.id));
      }
    }
    if (targets.length === 0) return;
    setHealthChecking(true);
    setHealthProgress({ current: 0, total: targets.length });
    let alive = 0; const deadIds = [];
    let done = 0;
    const CONCURRENCY = 10;
    const queue = [...targets];

    const worker = async () => {
      while (queue.length > 0) {
        const pool = queue.shift();
        if (!pool) break;
        try {
          const res = await fetch(`/api/proxy-pools/${pool.id}/test`, { method: "POST" });
          const data = await res.json();
          if (res.ok && data.ok) alive += 1; else deadIds.push(pool.id);
        } catch {
          deadIds.push(pool.id);
        } finally {
          done += 1;
          setHealthProgress({ current: done, total: targets.length });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
    await fetchProxyPools();
    setHealthChecking(false);
    setHealthProgress({ current: 0, total: 0 });

    if (deadIds.length > 0) {
      setConfirmState({
        title: "Disable Dead Proxies",
        message: `Alive: ${alive}, Dead: ${deadIds.length}.\n\nDisable ${deadIds.length} dead proxies?`,
        onConfirm: async () => {
          setConfirmState(null);
          setBulkBusy(true);
          try {
            for (const id of deadIds) {
              try {
                await fetch(`/api/proxy-pools/${id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ isActive: false }),
                });
              } catch {}
            }
            await fetchProxyPools();
            notify.success(`Disabled ${deadIds.length} dead proxies`);
          } finally {
            setBulkBusy(false);
          }
        }
      });
    } else {
      notify.success(`Health check done. Alive: ${alive}, Dead: ${deadIds.length}`);
    }
  };

  const openBatchImportModal = () => {
    setBatchImportText("");
    setShowBatchImportModal(true);
  };

  const closeBatchImportModal = () => {
    if (importing) return;
    setShowBatchImportModal(false);
  };

  const openVercelModal = () => {
    setVercelForm({ vercelToken: "", projectName: "vercel-relay" });
    setShowVercelModal(true);
  };

  const closeVercelModal = () => {
    if (deploying) return;
    setShowVercelModal(false);
  };

  const openCloudflareModal = () => {
    setCloudflareForm({ accountId: "", apiToken: "", projectName: "cloudflare-relay" });
    setShowCloudflareModal(true);
  };

  const closeCloudflareModal = () => {
    if (deploying) return;
    setShowCloudflareModal(false);
  };

  const openDenoModal = () => {
    setDenoForm({ denoToken: "", orgDomain: "", projectName: "" });
    setShowDenoModal(true);
  };

  const closeDenoModal = () => {
    if (deploying) return;
    setShowDenoModal(false);
  };

  const openNetlifyModal = () => {
    setNetlifyForm({ netlifyToken: "", projectName: "netlify-relay" });
    setShowNetlifyModal(true);
  };

  const closeNetlifyModal = () => {
    if (deploying) return;
    setShowNetlifyModal(false);
  };

  const handleVercelDeploy = async () => {
    if (!vercelForm.vercelToken.trim()) return;
    setDeploying(true);
    try {
      const res = await fetch("/api/proxy-pools/vercel-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vercelForm),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchProxyPools();
        closeVercelModal();
        notify.success(`Deployed: ${data.deployUrl}`);
      } else {
        notify.error(data.error || "Deploy failed");
      }
    } catch (error) {
      console.log("Error deploying Vercel relay:", error);
      notify.error("Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const handleCloudflareDeploy = async () => {
    if (!cloudflareForm.accountId.trim() || !cloudflareForm.apiToken.trim()) return;
    setDeploying(true);
    try {
      const res = await fetch("/api/proxy-pools/cloudflare-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cloudflareForm),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchProxyPools();
        closeCloudflareModal();
        notify.success(`Deployed: ${data.deployUrl}`);
      } else {
        notify.error(data.error || "Deploy failed");
      }
    } catch (error) {
      console.log("Error deploying Cloudflare relay:", error);
      notify.error("Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const handleDenoDeploy = async () => {
    if (!denoForm.denoToken.trim()) return;
    setDeploying(true);
    try {
      const res = await fetch("/api/proxy-pools/deno-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(denoForm),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchProxyPools();
        closeDenoModal();
        notify.success(`Deployed: ${data.deployUrl}`);
      } else {
        notify.error(data.error || "Deploy failed");
      }
    } catch (error) {
      console.log("Error deploying Deno relay:", error);
      notify.error("Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const handleNetlifyDeploy = async () => {
    if (!netlifyForm.netlifyToken.trim()) return;
    setDeploying(true);
    try {
      const res = await fetch("/api/proxy-pools/netlify-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(netlifyForm),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchProxyPools();
        closeNetlifyModal();
        notify.success(`Deployed: ${data.deployUrl}`);
      } else {
        notify.error(data.error || "Deploy failed");
      }
    } catch (error) {
      console.log("Error deploying Netlify relay:", error);
      notify.error("Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const parseProxyLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return null;

    if (trimmed.includes("://")) {
      const parsed = new URL(trimmed);
      const hostLabel = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
      return {
        proxyUrl: parsed.toString(),
        name: `Imported ${hostLabel}`,
      };
    }

    const parts = trimmed.split(":");
    if (parts.length === 4) {
      const [host, port, username, password] = parts;
      if (!host || !port || !username || !password) {
        throw new Error("Invalid host:port:user:pass format");
      }

      const proxyUrl = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
      const parsed = new URL(proxyUrl);
      return {
        proxyUrl: parsed.toString(),
        name: `Imported ${host}:${port}`,
      };
    }

    throw new Error("Unsupported format");
  };

  const handleBatchImport = async () => {
    const lines = batchImportText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      notify.warning("Please paste at least one proxy line.");
      return;
    }

    const parsedEntries = [];
    const invalidLines = [];

    lines.forEach((line, index) => {
      try {
        const parsed = parseProxyLine(line);
        if (parsed) {
          parsedEntries.push({
            ...parsed,
            lineNumber: index + 1,
          });
        }
      } catch (error) {
        invalidLines.push(`Line ${index + 1}: ${error.message}`);
      }
    });

    if (invalidLines.length > 0) {
      notify.error(`Invalid proxy format:\n${invalidLines.join("\n")}`);
      return;
    }

    setImporting(true);
    try {
      const allRes = await fetch("/api/proxy-pools", { cache: "no-store" });
      const allData = allRes.ok ? await allRes.json() : { proxyPools: [] };
      const existingKeys = new Set(
        (allData.proxyPools || proxyPools).map((pool) => `${(pool.proxyUrl || "").trim()}|||${(pool.noProxy || "").trim()}`)
      );

      let created = 0;
      let skipped = 0;
      let failed = 0;

      for (const entry of parsedEntries) {
        const dedupeKey = `${entry.proxyUrl}|||`;
        if (existingKeys.has(dedupeKey)) {
          skipped += 1;
          continue;
        }

        const res = await fetch("/api/proxy-pools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: entry.name,
            proxyUrl: entry.proxyUrl,
            noProxy: "",
            isActive: true,
          }),
        });

        if (res.ok) {
          created += 1;
          existingKeys.add(dedupeKey);
        } else {
          failed += 1;
        }
      }

      await fetchProxyPools();
      setShowBatchImportModal(false);
      notify.success(`Batch import completed: Created ${created}, Skipped ${skipped}, Failed ${failed}`);
    } catch (error) {
      console.log("Error batch importing proxies:", error);
      notify.error("Batch import failed");
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 font-mono sm:gap-4 px-2 sm:px-0">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 font-mono sm:gap-4 px-2 sm:px-0">
      {/* Header and Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[18px] sm:text-[20px] font-bold text-[var(--color-ink)] leading-tight">
              Proxy Pools
            </h1>
            <span className="text-[11px] text-[var(--color-mute)] border border-[var(--color-hairline)] px-1.5 py-0.5 bg-[var(--color-surface-soft)]">
              {pagination.total}
            </span>
          </div>
          <p className="text-[12px] text-[var(--color-mute)] mt-0.5 leading-snug">
            Configure upstream proxies &amp; edge relays for outbound routing.
          </p>
        </div>

        {/* Action buttons (responsive flex for mobile & desktop) */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Deploy Relay Popover */}
          <div className="relative" ref={relayMenuRef}>
            <Button
              size="sm"
              variant="secondary"
              icon="rocket_launch"
              onClick={() => setShowRelayMenu(!showRelayMenu)}
              className="min-h-[36px]"
            >
              Deploy Relay
              <span className="material-symbols-outlined ml-1 text-[16px] text-[var(--color-mute)]">
                {showRelayMenu ? "expand_less" : "expand_more"}
              </span>
            </Button>

            {showRelayMenu && (
              <div className="absolute left-0 top-full z-50 mt-1 w-56 border border-[var(--color-hairline-strong)] bg-[var(--color-canvas)] rounded-none shadow-none p-1 sm:left-auto sm:right-0 sm:w-60">
                <button
                  type="button"
                  onClick={() => {
                    openCloudflareModal();
                    setShowRelayMenu(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)] transition-colors rounded-[4px] cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-[var(--color-mute)]">cloud</span>
                    <span>Cloudflare Relay</span>
                  </span>
                  <span className="text-[11px] text-[var(--color-ash)] font-mono">[worker]</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openVercelModal();
                    setShowRelayMenu(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)] transition-colors rounded-[4px] cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-[var(--color-mute)]">cloud_upload</span>
                    <span>Vercel Relay</span>
                  </span>
                  <span className="text-[11px] text-[var(--color-ash)] font-mono">[edge]</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openDenoModal();
                    setShowRelayMenu(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)] transition-colors rounded-[4px] cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-[var(--color-mute)]">terminal</span>
                    <span>Deno Relay</span>
                  </span>
                  <span className="text-[11px] text-[var(--color-ash)] font-mono">[deploy]</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openNetlifyModal();
                    setShowRelayMenu(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)] transition-colors rounded-[4px] cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-[var(--color-mute)]">deployed_code</span>
                    <span>Netlify Relay</span>
                  </span>
                  <span className="text-[11px] text-[var(--color-ash)] font-mono">[func]</span>
                </button>
              </div>
            )}
          </div>

          <Button
            size="sm"
            variant="secondary"
            icon="upload"
            onClick={openBatchImportModal}
            className="min-h-[36px]"
          >
            Batch Import
          </Button>

          <Button
            size="sm"
            variant="primary"
            icon="add"
            onClick={openCreateModal}
            className="min-h-[36px]"
          >
            Add Proxy Pool
          </Button>
        </div>
      </div>

      {/* Main Content Card */}
      <Card padding="sm" className="font-mono rounded-none">
        {/* Selection Stats / Quick Count Bar */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-hairline)] pb-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {proxyPools.length > 0 && (
              <label className="flex items-center gap-1.5 text-[12px] text-[var(--color-mute)] cursor-pointer select-none py-1">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="size-4 rounded-[3px] accent-[var(--color-ink)] border border-[var(--color-hairline-strong)] cursor-pointer"
                  aria-label={allSelected ? "Unselect all" : "Select all"}
                />
                <span>{allSelected ? "[x] unselect all" : "[ ] select all"}</span>
              </label>
            )}
            <span className="inline-flex items-center text-[11px] text-[var(--color-mute)] font-mono border border-[var(--color-hairline)] px-2 py-0.5 bg-[var(--color-surface-soft)]">
              total: {pagination.total}
            </span>
            <span className="inline-flex items-center text-[11px] text-[var(--color-success)] font-mono border border-[var(--color-hairline)] px-2 py-0.5 bg-[var(--color-surface-soft)]">
              [+] active: {pagination.activeCount}
            </span>
            {pagination.total - pagination.activeCount > 0 && (
              <span className="inline-flex items-center text-[11px] text-[var(--color-ash)] font-mono border border-[var(--color-hairline)] px-2 py-0.5 bg-[var(--color-surface-soft)]">
                [-] inactive: {pagination.total - pagination.activeCount}
              </span>
            )}
          </div>
          <div className="text-[11px] text-[var(--color-ash)] font-mono">
            page {pagination.page}/{pagination.totalPages || 1}
          </div>
        </div>

        {/* Bulk Actions / Health Check Toolbar */}
        {(selectedIds.length > 0 || healthChecking) && (
          <div className="mb-3 flex flex-col gap-2.5 border border-[var(--color-hairline-strong)] bg-[var(--color-surface-soft)] p-2.5 sm:p-3 rounded-none shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[12px] text-[var(--color-ink)] font-mono">
                <span className="text-[var(--color-mute)]">&gt;</span>
                <span className="font-bold">
                  {selectedIds.length > 0
                    ? `[selected: ${selectedIds.length}]`
                    : `[page: ${pagination.page} (${proxyPools.length})]`}
                </span>
              </div>
              <Button
                size="sm"
                variant="primary"
                icon={healthChecking ? "progress_activity" : "health_and_safety"}
                onClick={handleHealthCheck}
                disabled={healthChecking || bulkBusy || proxyPools.length === 0}
                className="min-h-[36px] sm:min-h-[32px] text-[12px]"
              >
                {healthChecking ? `Checking ${healthProgress.current}/${healthProgress.total}` : "Health Check"}
              </Button>
            </div>

            {selectedIds.length > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--color-hairline)] xs:grid-cols-4 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon="toggle_on"
                  onClick={() => bulkSetActive(true)}
                  disabled={bulkBusy || healthChecking}
                  className="min-h-[36px] justify-center text-[12px]"
                >
                  Activate
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon="toggle_off"
                  onClick={() => bulkSetActive(false)}
                  disabled={bulkBusy || healthChecking}
                  className="min-h-[36px] justify-center text-[12px]"
                >
                  Deactivate
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon="delete"
                  onClick={bulkDelete}
                  disabled={bulkBusy || healthChecking}
                  className="min-h-[36px] justify-center text-[12px]"
                >
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearSelection}
                  disabled={bulkBusy || healthChecking}
                  className="min-h-[36px] justify-center text-[12px]"
                >
                  Clear
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Empty State or List */}
        {proxyPools.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed border-[var(--color-hairline)] bg-[var(--color-surface-soft)]">
            <div className="inline-block font-mono text-[13px] text-[var(--color-mute)] mb-1">
              [!] No proxy pools configured
            </div>
            <p className="text-[12px] text-[var(--color-ash)] font-mono max-w-md mx-auto mb-4 leading-relaxed">
              Create an upstream proxy entry or deploy an edge relay to mask your outbound IP address.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <Button size="sm" icon="add" onClick={openCreateModal} className="w-full sm:w-auto min-h-[36px]">
                Add Proxy Pool
              </Button>
              <Button size="sm" variant="secondary" icon="upload" onClick={openBatchImportModal} className="w-full sm:w-auto min-h-[36px]">
                Batch Import
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[var(--color-hairline)]">
            {proxyPools.map((pool) => (
              <div
                key={pool.id}
                className="flex flex-col gap-2.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                {/* Left: Checkbox + Info */}
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(pool.id)}
                    onChange={() => toggleSelect(pool.id)}
                    className="mt-1 size-4 shrink-0 rounded-[3px] accent-[var(--color-ink)] border border-[var(--color-hairline-strong)] cursor-pointer"
                    aria-label={`Select ${pool.name}`}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    {/* Name + Status Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="font-bold text-[13px] sm:text-[14px] text-[var(--color-ink)] break-all">
                        {pool.name}
                      </span>
                      {/* Test status badge */}
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono rounded-[4px] border",
                          pool.testStatus === "active"
                            ? "text-[var(--color-success)] border-[rgba(48,209,88,0.4)] bg-transparent"
                            : pool.testStatus === "error"
                            ? "text-[var(--color-danger)] border-[rgba(255,59,48,0.4)] bg-transparent"
                            : "text-[var(--color-mute)] border-[var(--color-hairline)] bg-[var(--color-surface-soft)]"
                        )}
                      >
                        {pool.testStatus === "active" ? "[+] active" : pool.testStatus === "error" ? "[x] error" : "[?] unknown"}
                      </span>
                      {/* Active toggle indicator */}
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono rounded-[4px] border",
                          pool.isActive
                            ? "text-[var(--color-success)] border-[rgba(48,209,88,0.3)] bg-transparent"
                            : "text-[var(--color-ash)] border-[var(--color-hairline)] bg-[var(--color-surface-soft)]"
                        )}
                      >
                        {pool.isActive ? "[active]" : "[inactive]"}
                      </span>
                      {/* Relay type */}
                      {pool.type && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono rounded-[4px] border border-[var(--color-hairline)] text-[var(--color-mute)] bg-[var(--color-surface-soft)]">
                          [{pool.type}]
                        </span>
                      )}
                      {/* Strict proxy */}
                      {pool.strictProxy && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono rounded-[4px] border border-[rgba(255,159,10,0.4)] text-[var(--color-warning)] bg-transparent">
                          [!strict]
                        </span>
                      )}
                      {/* Bound connection count */}
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono rounded-[4px] border border-[var(--color-hairline)] text-[var(--color-mute)] bg-[var(--color-surface-card)]">
                        {pool.boundConnectionCount || 0} bound
                      </span>
                    </div>

                    {/* Proxy URL: break-all prevents mobile horizontal scroll */}
                    <div className="text-[12px] text-[var(--color-mute)] font-mono break-all leading-snug">
                      <span className="text-[var(--color-ash)] select-none">&gt; </span>
                      <span>{pool.proxyUrl}</span>
                    </div>

                    {/* No Proxy bypass rule */}
                    {pool.noProxy ? (
                      <div className="text-[11px] text-[var(--color-ash)] font-mono break-all leading-snug">
                        <span className="select-none">bypass: </span>
                        <span>{pool.noProxy}</span>
                      </div>
                    ) : null}

                    {/* Timestamp & error message */}
                    <div className="text-[11px] text-[var(--color-ash)] font-mono leading-snug">
                      <span>tested: {formatDateTime(pool.lastTestedAt)}</span>
                      {pool.lastError && (
                        <span className="text-[var(--color-danger)] ml-1 break-all">
                          · [err: {pool.lastError}]
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions cluster with touch targets >= 36-40px */}
                <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 border-t border-[var(--color-hairline)] sm:border-t-0 sm:pt-0 sm:shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono text-[var(--color-mute)] sm:hidden">state:</span>
                    <Toggle
                      size="sm"
                      checked={pool.isActive === true}
                      onChange={() => handleToggleActive(pool)}
                      title={pool.isActive ? "Disable" : "Enable"}
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleTest(pool.id)}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center p-2 rounded-[4px] border border-transparent hover:border-[var(--color-hairline-strong)] hover:bg-[var(--color-surface-soft)] text-[var(--color-mute)] hover:text-[var(--color-ink)] transition-colors cursor-pointer"
                      title="Test proxy"
                      disabled={testingId === pool.id}
                      aria-label="Test proxy"
                    >
                      <span
                        className="material-symbols-outlined text-[18px]"
                        style={testingId === pool.id ? { animation: "spin 1s linear infinite" } : undefined}
                      >
                        {testingId === pool.id ? "progress_activity" : "science"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(pool)}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center p-2 rounded-[4px] border border-transparent hover:border-[var(--color-hairline-strong)] hover:bg-[var(--color-surface-soft)] text-[var(--color-mute)] hover:text-[var(--color-ink)] transition-colors cursor-pointer"
                      title="Edit"
                      aria-label="Edit proxy pool"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(pool)}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center p-2 rounded-[4px] border border-transparent hover:border-[rgba(255,59,48,0.4)] hover:bg-[var(--color-danger)]/10 text-[var(--color-danger)] transition-colors cursor-pointer"
                      title="Delete"
                      aria-label="Delete proxy pool"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.total > 0 && (
          <div className="mt-3 pt-3 border-t border-[var(--color-hairline)]">
            <Pagination
              currentPage={pagination.page}
              pageSize={pagination.pageSize}
              totalItems={pagination.total}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              className="px-0"
            />
          </div>
        )}
      </Card>

      {/* Batch Import Modal */}
      <Modal
        isOpen={showBatchImportModal}
        title="Batch Import Proxies"
        onClose={closeBatchImportModal}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={closeBatchImportModal}
              disabled={importing}
              className="min-h-[38px]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBatchImport}
              disabled={!batchImportText.trim() || importing}
              className="min-h-[38px]"
            >
              {importing ? "Importing..." : "Import"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 font-mono">
          <div>
            <label className="text-[13px] font-bold text-[var(--color-ink)] mb-1 block">
              Paste Proxy List (One per line)
            </label>
            <textarea
              value={batchImportText}
              onChange={(e) => setBatchImportText(e.target.value)}
              placeholder={"http://user:pass@127.0.0.1:7897\n127.0.0.1:7897:user:pass"}
              className="w-full min-h-[160px] p-3 text-[13px] font-mono text-[var(--color-ink)] bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] rounded-[4px] focus:outline-none focus:border-[var(--color-hairline-strong)] placeholder:text-[var(--color-ash)] leading-relaxed"
            />
            <p className="text-[11px] text-[var(--color-mute)] mt-1.5">
              [format] protocol://user:pass@host:port, or host:port:user:pass
            </p>
          </div>

        </div>
      </Modal>

      {/* Vercel Relay Modal */}
      <Modal
        isOpen={showVercelModal}
        title="Deploy Vercel Relay"
        onClose={closeVercelModal}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={closeVercelModal}
              disabled={deploying}
              className="min-h-[38px]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleVercelDeploy}
              disabled={!vercelForm.vercelToken.trim() || deploying}
              className="min-h-[38px]"
            >
              {deploying ? "Deploying... (~1 min)" : "Deploy"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 font-mono">
          <div className="rounded-none bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] p-3 flex flex-col gap-1.5">
            <p className="text-[13px] text-[var(--color-ink)] font-bold">[info] What is Vercel Relay?</p>
            <p className="text-[12px] text-[var(--color-mute)] leading-relaxed">
              Deploys an edge relay function to Vercel. Outbound provider requests are forwarded through Vercel&apos;s edge network, masking your real IP.
            </p>
            <ul className="text-[11px] text-[var(--color-mute)] space-y-1 mt-1 border-t border-[var(--color-hairline)] pt-2">
              <li>· IP masked by Vercel&apos;s dynamic edge IPs across 20+ regions</li>
              <li>· High IP reputation — provider traffic blends with millions of web apps</li>
              <li>· Free tier: 100GB bandwidth/month, 500K edge invocations</li>
              <li>· Deploy multiple relays across accounts for IP diversity</li>
            </ul>
          </div>

          <Input
            label="Vercel API Token"
            value={vercelForm.vercelToken}
            onChange={(e) => setVercelForm((prev) => ({ ...prev, vercelToken: e.target.value }))}
            placeholder="your-vercel-api-token"
            hint={
              <>
                Token used once for deploy, not stored.{" "}
                <a
                  href="https://vercel.com/account/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-[var(--color-charcoal)]"
                >
                  Get token →
                </a>
              </>
            }
            type="password"
          />
          <Input
            label="Project Name"
            value={vercelForm.projectName}
            onChange={(e) => setVercelForm((prev) => ({ ...prev, projectName: e.target.value }))}
            placeholder="my-relay"
            hint="Unique name for your Vercel project. Leave empty for auto-generated name."
          />
        </div>
      </Modal>

      {/* Cloudflare Relay Modal */}
      <Modal
        isOpen={showCloudflareModal}
        title="Deploy Cloudflare Relay"
        onClose={closeCloudflareModal}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={closeCloudflareModal}
              disabled={deploying}
              className="min-h-[38px]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCloudflareDeploy}
              disabled={!cloudflareForm.accountId.trim() || !cloudflareForm.apiToken.trim() || deploying}
              className="min-h-[38px]"
            >
              {deploying ? "Deploying..." : "Deploy Worker"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 font-mono">
          <div className="rounded-none bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] p-3 flex flex-col gap-1.5">
            <p className="text-[13px] text-[var(--color-ink)] font-bold">[info] What is Cloudflare Relay?</p>
            <p className="text-[12px] text-[var(--color-mute)] leading-relaxed">
              Deploys a Cloudflare Worker as a proxy relay. All AI requests forward through Cloudflare&apos;s global edge network.
            </p>
            <ul className="text-[11px] text-[var(--color-mute)] space-y-1 mt-1 border-t border-[var(--color-hairline)] pt-2">
              <li>· High performance global routing and IP masking via Workers</li>
              <li>· Free tier: 100,000 requests per day</li>
              <li>· Requires Cloudflare Account ID and Workers API Token</li>
            </ul>
            <div className="mt-2 pt-2 border-t border-[var(--color-hairline)] text-[11px] text-[var(--color-mute)]">
              <p className="font-bold text-[var(--color-ink)] mb-1">[guide] How to generate API Token:</p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>Go to <b>My Profile</b> → <b>API Tokens</b> → <b>Create Token</b></li>
                <li>Scroll to <b>Custom Token</b> and click <b>Get started</b></li>
                <li>Under <b>Permissions</b>: Account | Workers Scripts | Edit</li>
                <li>Under <b>Account Resources</b>: Include | Account | <i>Your Account Name</i></li>
                <li>Click <b>Continue to summary</b> → <b>Create Token</b></li>
              </ol>
            </div>
          </div>

          <Input
            label="Account ID"
            value={cloudflareForm.accountId}
            onChange={(e) => setCloudflareForm((prev) => ({ ...prev, accountId: e.target.value }))}
            placeholder="your-cloudflare-account-id"
            hint="Found on the right side of Cloudflare dashboard overview page."
          />
          <Input
            label="API Token"
            value={cloudflareForm.apiToken}
            onChange={(e) => setCloudflareForm((prev) => ({ ...prev, apiToken: e.target.value }))}
            placeholder="your-cloudflare-api-token"
            hint={
              <>
                Requires &quot;Workers Scripts: Edit&quot; permission.{" "}
                <a
                  href="https://dash.cloudflare.com/profile/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-[var(--color-charcoal)]"
                >
                  Get token →
                </a>
              </>
            }
            type="password"
          />
          <Input
            label="Worker Name"
            value={cloudflareForm.projectName}
            onChange={(e) => setCloudflareForm((prev) => ({ ...prev, projectName: e.target.value }))}
            placeholder="my-relay"
            hint="Unique name for your Cloudflare Worker. Leave empty for auto-generated name."
          />
        </div>
      </Modal>

      {/* Deno Relay Modal */}
      <Modal
        isOpen={showDenoModal}
        title="Deploy Deno Relay"
        onClose={closeDenoModal}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={closeDenoModal}
              disabled={deploying}
              className="min-h-[38px]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDenoDeploy}
              disabled={!denoForm.denoToken.trim() || !denoForm.orgDomain.trim() || deploying}
              className="min-h-[38px]"
            >
              {deploying ? "Deploying..." : "Deploy Relay"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 font-mono">
          <div className="rounded-none bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] p-3 flex flex-col gap-1.5">
            <p className="text-[13px] text-[var(--color-ink)] font-bold">[info] What is Deno Relay?</p>
            <p className="text-[12px] text-[var(--color-mute)] leading-relaxed">
              Deploys a relay worker to Deno Deploy&apos;s global edge network. All AI requests forward through Deno&apos;s edge.
            </p>
            <ul className="text-[11px] text-[var(--color-mute)] space-y-1 mt-1 border-t border-[var(--color-hairline)] pt-2">
              <li>· Deno Deploy v2 runs on a high-performance global network</li>
              <li>· Free tier: 1M requests &amp; 100GiB outbound traffic / month</li>
              <li>· No per-request CPU time limits</li>
              <li>· Supports up to 20 active apps &amp; 50 custom domains</li>
            </ul>
            <div className="mt-2 pt-2 border-t border-[var(--color-hairline)] text-[11px] text-[var(--color-mute)]">
              <p className="font-bold text-[var(--color-ink)] mb-1">[guide] How to generate API token:</p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>Go to <b>console.deno.com</b></li>
                <li>Select <b>Organization</b> → <b>Settings</b> → <b>Organization Tokens</b></li>
                <li>Create an <b>Organization Token</b> (prefix <b>ddo_</b>)</li>
              </ol>
            </div>
          </div>

          <Input
            label="Deno Deploy API Token"
            value={denoForm.denoToken}
            onChange={(e) => setDenoForm((prev) => ({ ...prev, denoToken: e.target.value }))}
            placeholder="ddo_xxxxxxxxxxxxxxxx"
            hint="Token used once for deploy, not stored. Found in Organization Settings."
            type="password"
          />
          <Input
            label="Organization Domain"
            value={denoForm.orgDomain}
            onChange={(e) => setDenoForm((prev) => ({ ...prev, orgDomain: e.target.value }))}
            placeholder="your-org.deno.net"
            hint="Organization default domain. Relay URL format: https://my-relay.your-org.deno.net"
          />
          <Input
            label="App Name"
            value={denoForm.projectName}
            onChange={(e) => setDenoForm((prev) => ({ ...prev, projectName: e.target.value }))}
            placeholder="deno-relay"
            hint="Unique app name. Leave empty for auto-generated name."
          />
        </div>
      </Modal>

      {/* Netlify Relay Modal */}
      <Modal
        isOpen={showNetlifyModal}
        title="Deploy Netlify Relay"
        onClose={closeNetlifyModal}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={closeNetlifyModal}
              disabled={deploying}
              className="min-h-[38px]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleNetlifyDeploy}
              disabled={!netlifyForm.netlifyToken.trim() || deploying}
              className="min-h-[38px]"
            >
              {deploying ? "Deploying... (~1 min)" : "Deploy"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 font-mono">
          <div className="rounded-none bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] p-3 flex flex-col gap-1.5">
            <p className="text-[13px] text-[var(--color-ink)] font-bold">[info] What is Netlify Relay?</p>
            <p className="text-[12px] text-[var(--color-mute)] leading-relaxed">
              Deploys a serverless relay function to Netlify&apos;s edge network. Outbound provider requests are forwarded through Netlify functions.
            </p>
            <ul className="text-[11px] text-[var(--color-mute)] space-y-1 mt-1 border-t border-[var(--color-hairline)] pt-2">
              <li>· Runs on Netlify Functions with 60s limit and streaming support</li>
              <li>· Free tier: 125,000 function invocations and 100GB bandwidth / month</li>
              <li>· Relay URL: https://your-site.netlify.app/.netlify/functions/relay</li>
            </ul>
            <div className="mt-2 pt-2 border-t border-[var(--color-hairline)] text-[11px] text-[var(--color-mute)]">
              <p className="font-bold text-[var(--color-ink)] mb-1">[guide] How to generate API token:</p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>Go to <b>User Settings</b> → <b>Applications</b> → <b>Personal access tokens</b></li>
                <li>Select <b>New access token</b> and generate token</li>
                <li>Copy token — will not be shown again</li>
              </ol>
            </div>
          </div>

          <Input
            label="Netlify API Token"
            value={netlifyForm.netlifyToken}
            onChange={(e) => setNetlifyForm((prev) => ({ ...prev, netlifyToken: e.target.value }))}
            placeholder="nfp_xxxxxxxxxxxxxxxx"
            hint={
              <>
                Token used once for deploy, not stored.{" "}
                <a
                  href="https://app.netlify.com/user/applications#personal-access-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-[var(--color-charcoal)]"
                >
                  Get token →
                </a>
              </>
            }
            type="password"
          />
          <Input
            label="Site Name"
            value={netlifyForm.projectName}
            onChange={(e) => setNetlifyForm((prev) => ({ ...prev, projectName: e.target.value }))}
            placeholder="netlify-relay"
            hint="Unique site name (lowercase letters, numbers, hyphens)."
          />
        </div>
      </Modal>

      {/* Add / Edit Proxy Pool Modal */}
      <Modal
        isOpen={showFormModal}
        title={editingProxyPool ? "Edit Proxy Pool" : "Add Proxy Pool"}
        onClose={closeFormModal}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={closeFormModal}
              disabled={saving}
              className="min-h-[38px]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formData.name.trim() || !formData.proxyUrl.trim() || saving}
              className="min-h-[38px]"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 font-mono">
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Office Proxy"
            required
          />
          <Input
            label="Proxy URL"
            value={formData.proxyUrl}
            onChange={(e) => setFormData((prev) => ({ ...prev, proxyUrl: e.target.value }))}
            placeholder="http://127.0.0.1:7897"
            required
          />
          <Input
            label="No Proxy"
            value={formData.noProxy}
            onChange={(e) => setFormData((prev) => ({ ...prev, noProxy: e.target.value }))}
            placeholder="localhost,127.0.0.1,.internal"
            hint="Comma-separated hosts/domains to bypass proxy"
          />

          <div className="flex flex-col gap-2 rounded-none border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold text-[13px] text-[var(--color-ink)]">Active</p>
              <p className="text-[11px] text-[var(--color-mute)]">Inactive pools are ignored by runtime resolution.</p>
            </div>
            <Toggle
              checked={formData.isActive === true}
              onChange={() => setFormData((prev) => ({ ...prev, isActive: !prev.isActive }))}
              disabled={saving}
            />
          </div>

          <div className="flex flex-col gap-2 rounded-none border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold text-[13px] text-[var(--color-ink)]">Strict Proxy</p>
              <p className="text-[11px] text-[var(--color-mute)]">Fail request if proxy is unreachable instead of falling back to direct.</p>
            </div>
            <Toggle
              checked={formData.strictProxy === true}
              onChange={() => setFormData((prev) => ({ ...prev, strictProxy: !prev.strictProxy }))}
              disabled={saving}
            />
          </div>
        </div>
      </Modal>

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Confirm"}
        message={confirmState?.message}
        variant="danger"
      />
    </div>
  );
}
