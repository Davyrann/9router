"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import PropTypes from "prop-types";
import { Card, Button, Input, Modal, CardSkeleton, Toggle, ConfirmModal } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useTimezone } from "@/shared/hooks/useTimezone";
import { cn } from "@/shared/utils/cn";
import {
  TUNNEL_BENEFITS,
  TUNNEL_PING_INTERVAL_MS,
  TUNNEL_PING_MAX_MS,
  STATUS_POLL_FAST_MS,
  REACHABLE_MISS_THRESHOLD,
  CLIENT_PING_FAST_MS,
} from "./endpointConstants";
import { clientPingUrl, clientPingAny } from "./endpointPing";
import useSettingsStore from "@/store/settingsStore";
import EndpointRow from "./components/EndpointRow";
import StatusAlert from "./components/StatusAlert";
import Tooltip from "./components/Tooltip";
import SecurityWarning from "./components/SecurityWarning";
import KeyAccessControls from "./components/KeyAccessControls";
import EditKeyModal from "./components/EditKeyModal";

// Compact token counts (2.1K / 3.4M) for the per-key usage line.
function fmtTokens(n) {
  if (!n) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

// Relative timestamps for "last used" (3h ago / 35d ago).
function fmtRelative(iso) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

const STALE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

// A key is stale when it has been unused (or never used) for 90+ days.
function isKeyStale(key) {
  const ref = key.usage?.lastUsed || key.createdAt;
  if (!ref) return false;
  return Date.now() - new Date(ref).getTime() > STALE_AFTER_MS;
}

// "expires in 12d" / "expired Nd ago" / null (no expiry set).
function expiryLabel(key) {
  if (!key.expiresAt) return null;
  const ms = new Date(key.expiresAt).getTime() - Date.now();
  if (ms <= 0) return { text: `expired ${fmtRelative(key.expiresAt).replace(" ago", "")} ago`, variant: "error" };
  const d = Math.ceil(ms / 86400000);
  if (d > 30) return { text: `expires ${new Date(key.expiresAt).toLocaleDateString()}`, variant: "muted" };
  return { text: `expires in ${d}d`, variant: d <= 7 ? "warn" : "muted" };
}

export default function APIPageClient({ machineId }) {
  const { timeZone } = useTimezone();
  // Date-only in the user's display timezone (replaces hard-coded toLocaleDateString).
  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString(undefined, timeZone ? { timeZone } : undefined);
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [renaming, setRenaming] = useState({ id: null, name: "" });
  const [keySearch, setKeySearch] = useState("");
  const [newKeyExpiry, setNewKeyExpiry] = useState("");
  const [newKeyQuota, setNewKeyQuota] = useState("");
  const [newKeyQuotaWindow, setNewKeyQuotaWindow] = useState("daily");
  const [editingKey, setEditingKey] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [keyPage, setKeyPage] = useState(1);
  const [activeProviders, setActiveProviders] = useState([]);
  const [modelAliases, setModelAliases] = useState({});

  const [requireApiKey, setRequireApiKey] = useState(false);
  const [requireLogin, setRequireLogin] = useState(true);
  const [hasPassword, setHasPassword] = useState(true);
 const [tunnelDashboardAccess, setTunnelDashboardAccess] = useState(false);

 // Cloudflare Tunnel state
  const [tunnelChecking, setTunnelChecking] = useState(true);
  const [tunnelEnabled, setTunnelEnabled] = useState(false);
  const [tunnelReachable, setTunnelReachable] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [tunnelPublicUrl, setTunnelPublicUrl] = useState("");
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelProgress, setTunnelProgress] = useState("");
  const [tunnelStatus, setTunnelStatus] = useState(null);
  const [showEnableTunnelModal, setShowEnableTunnelModal] = useState(false);
  const [showDisableTunnelModal, setShowDisableTunnelModal] = useState(false);

  // Tailscale state
  const [tsEnabled, setTsEnabled] = useState(false);
  const [tsReachable, setTsReachable] = useState(false);
  const [tsUrl, setTsUrl] = useState("");
  const [tsLoading, setTsLoading] = useState(false);
  const [tsProgress, setTsProgress] = useState("");
  const [tsStatus, setTsStatus] = useState(null);
  const [tsAuthUrl, setTsAuthUrl] = useState("");
  const [tsAuthLabel, setTsAuthLabel] = useState("");
  const [tsInstalled, setTsInstalled] = useState(null); // null=checking, true/false
  const [tsInstalling, setTsInstalling] = useState(false);
  const [tsInstallLog, setTsInstallLog] = useState([]);
  const [tsSudoPassword, setTsSudoPassword] = useState("");
  const [tsConnecting, setTsConnecting] = useState(false);
  const [showTsModal, setShowTsModal] = useState(false);
  const [showDisableTsModal, setShowDisableTsModal] = useState(false);
  const tsLogRef = useRef(null);

  // Debounce reachable=false: server may briefly return false during background refresh.
  // Only flip UI to "reconnecting" after N consecutive misses to avoid spinner flicker.
  const tunnelMissRef = useRef(0);
  const tsMissRef = useRef(0);
  // Browser-side reachable cache (independent of backend DNS quirks)
  const tunnelClientReachableRef = useRef(false);
  const tsClientReachableRef = useRef(false);
  // Track whether reachable=true was ever observed in this session.
  // Distinguishes "Checking..." (initial cold cache) from "Reconnecting..." (lost connection).
  const tunnelEverReachableRef = useRef(false);
  const tsEverReachableRef = useRef(false);
  const [tunnelEverReachable, setTunnelEverReachable] = useState(false);
  const [tsEverReachable, setTsEverReachable] = useState(false);

  // API key visibility toggle state
  const [visibleKeys, setVisibleKeys] = useState(new Set());

  // Client-side local/remote detection (UI hint only, not a security gate)
  const [isRemoteHost, setIsRemoteHost] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined")
      setIsRemoteHost(!["localhost", "127.0.0.1", "::1"].includes(window.location.hostname));
  }, []);

  const { copied, copy } = useCopyToClipboard();

  // Security gate: block remote exposure while dashboard uses default password or login is off.
  const isLoginUnsafe = !requireLogin || !hasPassword;
  const unsafeReason = !requireLogin
    ? "Enable \"Require login\" and set a custom password before activating the tunnel."
    : "Change the default dashboard password before activating the tunnel.";

  // Auto-scroll install log
  useEffect(() => {
    if (tsLogRef.current) tsLogRef.current.scrollTop = tsLogRef.current.scrollHeight;
  }, [tsInstallLog]);

  useEffect(() => {
    fetchData();
    loadSettings();
  }, []);

  // Status poll: only while degraded (not yet reachable). Stop once healthy to avoid spam.
  // Visibility re-check: refresh once when tab becomes visible.
  useEffect(() => {
    const anyEnabled = tunnelEnabled || tsEnabled;
    if (!anyEnabled) return;
    const tunnelHealthy = !tunnelEnabled || tunnelReachable;
    const tsHealthy = !tsEnabled || tsReachable;
    const allHealthy = tunnelHealthy && tsHealthy;
    const onVisible = () => { if (!document.hidden) syncTunnelStatus(); };
    document.addEventListener("visibilitychange", onVisible);
    if (allHealthy) return () => document.removeEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => { if (!document.hidden) syncTunnelStatus(); }, STATUS_POLL_FAST_MS);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tunnelEnabled, tsEnabled, tunnelReachable, tsReachable]);

  // Browser-side periodic ping: probes tunnel/tailscale URLs directly so UI stays
  // "reachable" even when backend DNS (1.1.1.1) hiccups on *.ts.net or *.trycloudflare.com.
  // Adaptive: slow when healthy, fast when degraded; pause when tab hidden.
  useEffect(() => {
    const probeBoth = async () => {
      if (document.hidden) return;
      if (tunnelEnabled && (tunnelUrl || tunnelPublicUrl)) {
        const ok = await clientPingAny(tunnelPublicUrl, tunnelUrl);
        tunnelClientReachableRef.current = ok;
        if (ok) { tunnelMissRef.current = 0; setTunnelReachable(true); if (!tunnelEverReachableRef.current) { tunnelEverReachableRef.current = true; setTunnelEverReachable(true); } }
        else { tunnelMissRef.current += 1; if (tunnelMissRef.current >= REACHABLE_MISS_THRESHOLD) setTunnelReachable(false); }
      } else {
        tunnelClientReachableRef.current = false;
      }
      if (tsEnabled && tsUrl) {
        const ok = await clientPingUrl(tsUrl);
        tsClientReachableRef.current = ok;
        if (ok) { tsMissRef.current = 0; setTsReachable(true); if (!tsEverReachableRef.current) { tsEverReachableRef.current = true; setTsEverReachable(true); } }
        else { tsMissRef.current += 1; if (tsMissRef.current >= REACHABLE_MISS_THRESHOLD) setTsReachable(false); }
      } else {
        tsClientReachableRef.current = false;
      }
    };
    const anyEnabled = (tunnelEnabled && (tunnelUrl || tunnelPublicUrl)) || (tsEnabled && tsUrl);
    if (!anyEnabled) return;
    probeBoth();
    const tunnelHealthy = !tunnelEnabled || tunnelReachable;
    const tsHealthy = !tsEnabled || tsReachable;
    if (tunnelHealthy && tsHealthy) return;
    const id = setInterval(probeBoth, CLIENT_PING_FAST_MS);
    return () => clearInterval(id);
  }, [tunnelEnabled, tunnelUrl, tunnelPublicUrl, tsEnabled, tsUrl, tunnelReachable, tsReachable]);

  // Client-side reachable only (server no longer probes; watchdog handles backend health).
  // Miss-debounce: only flip to false after N consecutive misses.
  const updateReachable = useCallback((_unused, clientRef, missRef, setter, everRef, everSetter) => {
    const reachable = clientRef.current;
    if (reachable) {
      missRef.current = 0;
      setter(true);
      if (!everRef.current) {
        everRef.current = true;
        everSetter(true);
      }
    } else {
      missRef.current += 1;
      if (missRef.current >= REACHABLE_MISS_THRESHOLD) setter(false);
    }
  }, []);

  // Trust user intent (settingsEnabled): UI stays "enabled" while watchdog restarts process
  const syncTunnelStatus = async () => {
    try {
      const statusRes = await fetch("/api/tunnel/status", { cache: "no-store" });
      if (!statusRes.ok) return;
      const data = await statusRes.json();
      const tEnabled = data.tunnel?.settingsEnabled ?? data.tunnel?.enabled ?? false;
      const tUrl = data.tunnel?.tunnelUrl || "";
      setTunnelUrl(tUrl);
      setTunnelPublicUrl(data.tunnel?.publicUrl || "");
      setTunnelEnabled(tEnabled);
      updateReachable(null, tunnelClientReachableRef, tunnelMissRef, setTunnelReachable, tunnelEverReachableRef, setTunnelEverReachable);

      const tsEn = data.tailscale?.settingsEnabled ?? data.tailscale?.enabled ?? false;
      const tsUrlVal = data.tailscale?.tunnelUrl || "";
      setTsUrl(tsUrlVal);
      setTsEnabled(tsEn);
      updateReachable(null, tsClientReachableRef, tsMissRef, setTsReachable, tsEverReachableRef, setTsEverReachable);
    } catch { /* ignore poll errors */ }
  };

  const loadSettings = async () => {
    setTunnelChecking(true);
    try {
      const [settingsData, statusRes] = await Promise.all([
        useSettingsStore.getState().fetchSettings(),
        fetch("/api/tunnel/status", { cache: "no-store" })
      ]);
      if (settingsData) {
        setRequireApiKey(settingsData.requireApiKey || false);
        setRequireLogin(settingsData.requireLogin !== false);
        setHasPassword(settingsData.hasPassword || false);
        setTunnelDashboardAccess(settingsData.tunnelDashboardAccess || false);
      }
      if (statusRes.ok) {
        const data = await statusRes.json();
        const tEnabled = data.tunnel?.settingsEnabled ?? data.tunnel?.enabled ?? false;
        const tUrl = data.tunnel?.tunnelUrl || "";
        setTunnelUrl(tUrl);
        setTunnelPublicUrl(data.tunnel?.publicUrl || "");
        setTunnelEnabled(tEnabled);
        updateReachable(null, tunnelClientReachableRef, tunnelMissRef, setTunnelReachable, tunnelEverReachableRef, setTunnelEverReachable);

        const tsEn = data.tailscale?.settingsEnabled ?? data.tailscale?.enabled ?? false;
        const tsUrlVal = data.tailscale?.tunnelUrl || "";
        setTsUrl(tsUrlVal);
        setTsEnabled(tsEn);
        updateReachable(null, tsClientReachableRef, tsMissRef, setTsReachable, tsEverReachableRef, setTsEverReachable);
      }
    } catch (error) {
      console.log("Error loading settings:", error);
    } finally {
      setTunnelChecking(false);
    }
  };

  const handleTunnelDashboardAccess = async (value) => {
    try {
      const updated = await useSettingsStore.getState().patchSettings({ tunnelDashboardAccess: value });
      if (updated) setTunnelDashboardAccess(value);
    } catch (error) {
      console.log("Error updating tunnelDashboardAccess:", error);
    }
  };

  const handleRequireApiKey = async (value) => {
    try {
      const updated = await useSettingsStore.getState().patchSettings({ requireApiKey: value });
      if (updated) setRequireApiKey(value);
    } catch (error) {
      console.log("Error updating requireApiKey:", error);
    }
  };

  const fetchData = async () => {
    try {
      const fetchKeys = async () => {
        const res = await fetch("/api/keys");
        if (!res.ok) return [];
        const data = await res.json();
        return data.keys || [];
      };

      let existing = await fetchKeys();
      // Auto-provision a default key for first-time users so the endpoint works out of the box.
      if (existing.length === 0) {
        try {
          const createRes = await fetch("/api/keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Default Key" }),
          });
          if (createRes.ok) existing = await fetchKeys();
        } catch { /* fall through to empty render */ }
      }
      setKeys(existing);
      try {
        const [provRes, aliasRes] = await Promise.all([
          fetch("/api/providers"),
          fetch("/api/models/alias"),
        ]);
        if (provRes.ok) {
          const pData = await provRes.json();
          if (pData.connections) setActiveProviders(pData.connections);
        }
        if (aliasRes.ok) {
          const aData = await aliasRes.json();
          if (aData.aliases) setModelAliases(aData.aliases);
        }
      } catch {}
    } catch (error) {
      console.log("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  // u2500u2500u2500 Cloudflare Tunnel handlers
  // Ping tunnel health until reachable. Race multiple URLs (shortlink + direct) — 1 OK is enough.
  const pingTunnelHealth = async (...urls) => {
    setTunnelLoading(true);
    setTunnelProgress("Waiting for tunnel ready...");
    const targets = urls.filter(Boolean).map((u) => `${u}/api/health`);
    const start = Date.now();
    while (Date.now() - start < TUNNEL_PING_MAX_MS) {
      await new Promise((r) => setTimeout(r, TUNNEL_PING_INTERVAL_MS));
      const ok = await Promise.any(targets.map(async (h) => {
        const p = await fetch(h, { mode: "cors", cache: "no-store" });
        if (p.ok) return true;
        throw new Error("not ready");
      })).catch(() => false);
      if (ok) {
        setTunnelEnabled(true);
        setTunnelLoading(false);
        setTunnelProgress("");
        return true;
      }
      // Every 5 pings (~10s), check if backend process still alive
      if ((Date.now() - start) % 10000 < TUNNEL_PING_INTERVAL_MS) {
        try {
          const statusRes = await fetch("/api/tunnel/status");
          if (statusRes.ok) {
            const status = await statusRes.json();
            if (!status.tunnel?.enabled) {
              setTunnelStatus({ type: "error", message: "Tunnel process stopped unexpectedly." });
              setTunnelLoading(false);
              setTunnelProgress("");
              return false;
            }
          }
        } catch { /* ignore */ }
      }
    }
    setTunnelStatus({ type: "error", message: "Tunnel created but not reachable. Please try again." });
    setTunnelLoading(false);
    setTunnelProgress("");
    return false;
  };

  const handleEnableTunnel = async () => {
    setShowEnableTunnelModal(false);
    setTunnelLoading(true);
    setTunnelStatus(null);
    setTunnelProgress("Creating tunnel...");

    // Poll download progress while enable request is pending
    let polling = true;
    const pollProgress = async () => {
      while (polling) {
        try {
          const r = await fetch("/api/tunnel/status");
          if (r.ok) {
            const s = await r.json();
            if (s.download?.downloading) {
              setTunnelProgress(`Downloading cloudflared... ${s.download.progress}%`);
            } else if (polling) {
              setTunnelProgress("Creating tunnel...");
            }
          }
        } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 1000));
      }
    };
    pollProgress();

    try {
      const res = await fetch("/api/tunnel/enable", { method: "POST" });
      polling = false;
      const data = await res.json();
      if (!res.ok) {
        setTunnelStatus({ type: "error", message: data.error || "Failed to enable tunnel" });
        return;
      }

      const url = data.tunnelUrl;
      if (!url) {
        setTunnelStatus({ type: "error", message: "No tunnel URL returned" });
        return;
      }

      setTunnelUrl(url);
      setTunnelPublicUrl(data.publicUrl || "");
      await pingTunnelHealth(data.publicUrl, url);
    } catch (error) {
      setTunnelStatus({ type: "error", message: error.message });
    } finally {
      polling = false;
      setTunnelLoading(false);
      setTunnelProgress("");
    }
  };

  const handleDisableTunnel = async () => {
    setTunnelLoading(true);
    setTunnelStatus(null);
    try {
      const res = await fetch("/api/tunnel/disable", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTunnelEnabled(false);
        setTunnelUrl("");
        setShowDisableTunnelModal(false);
        setTunnelStatus({ type: "success", message: "Tunnel disabled" });
      } else {
        setTunnelStatus({ type: "error", message: data.error || "Failed to disable tunnel" });
      }
    } catch (error) {
      setTunnelStatus({ type: "error", message: error.message });
    } finally {
      setTunnelLoading(false);
    }
  };

  // u2500u2500u2500 Tailscale handlers
  const checkTailscaleInstalled = async () => {
    setTsInstalled(null);
    try {
      const res = await fetch("/api/tunnel/tailscale-check");
      if (res.ok) {
        const data = await res.json();
        setTsInstalled(data.installed);
        return data;
      }
    } catch { /* ignore */ }
    setTsInstalled(false);
    return { installed: false };
  };

  const handleInstallTailscale = async () => {
    setTsInstalling(true);
    setTsStatus(null);
    setTsInstallLog([]);
    try {
      const res = await fetch("/api/tunnel/tailscale-install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sudoPassword: tsSudoPassword }),
      });
      setTsSudoPassword("");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const lines = part.split("\n");
          let event = "progress";
          let data = null;
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7).trim();
            if (line.startsWith("data: ")) {
              try { data = JSON.parse(line.slice(6)); } catch { /* skip */ }
            }
          }
          if (!data) continue;
          if (event === "progress") {
            setTsInstallLog((prev) => [...prev.slice(-50), data.message]);
          } else if (event === "done") {
            setTsInstalled(true);
            setTsInstalling(false);
            setShowTsModal(false);
            handleConnectTailscale();
            return;
          } else if (event === "error") {
            setTsStatus({ type: "error", message: data.error || "Install failed" });
          }
        }
      }
    } catch (e) {
      setTsStatus({ type: "error", message: e.message });
    } finally {
      setTsInstalling(false);
    }
  };

  // Ping Tailscale health until reachable
  const pingTsHealth = async (url) => {
    setTsProgress("Waiting for Tailscale ready...");
    const healthUrl = `${url}/api/health`;
    const start = Date.now();
    while (Date.now() - start < TUNNEL_PING_MAX_MS) {
      await new Promise((r) => setTimeout(r, TUNNEL_PING_INTERVAL_MS));
      try {
        const ping = await fetch(healthUrl, { mode: "no-cors", cache: "no-store" });
        if (ping.ok || ping.type === "opaque") return true;
      } catch { /* not ready yet */ }
    }
    return false;
  };

  // Show inline login button instead of auto-opening popup (browsers block popups
  // opened after async work because the user gesture is lost).
  const requestUserAuth = (url, label) => {
    setTsAuthUrl(url);
    setTsAuthLabel(label);
  };

  const clearUserAuth = () => {
    setTsAuthUrl("");
    setTsAuthLabel("");
  };

  const handleConnectTailscale = async () => {
    setShowTsModal(false);
    setTsConnecting(true);
    setTsLoading(true);
    setTsStatus(null);
    setTsProgress("Connecting...");
    clearUserAuth();
    try {
      const res = await fetch("/api/tunnel/tailscale-enable", { method: "POST" });
      const data = await res.json();

      if (res.ok && data.success) {
        setTsUrl(data.tunnelUrl || "");
        const reachable = await pingTsHealth(data.tunnelUrl);
        setTsEnabled(true);
        setTsStatus(reachable ? null : { type: "warning", message: "Connected but not reachable yet." });
        return;
      }

      if (data.needsLogin && data.authUrl) {
        requestUserAuth(data.authUrl, "Open Login Page");
        setTsProgress("Login required — click \"Open Login Page\" to continue");
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          try {
            const r2 = await fetch("/api/tunnel/tailscale-check");
            if (r2.ok) {
              const check = await r2.json();
              if (check.loggedIn) {
                clearUserAuth();
                setTsProgress("Starting funnel...");
                const res2 = await fetch("/api/tunnel/tailscale-enable", { method: "POST" });
                const data2 = await res2.json();
                if (res2.ok && data2.success) {
                  setTsUrl(data2.tunnelUrl || "");
                  const ok2 = await pingTsHealth(data2.tunnelUrl);
                  setTsEnabled(true);
                  setTsStatus(ok2 ? null : { type: "warning", message: "Connected but not reachable yet." });
                } else if (data2.funnelNotEnabled && data2.enableUrl) {
                  await pollFunnelEnable(data2.enableUrl);
                } else {
                  setTsStatus({ type: "error", message: data2.error || "Failed to start funnel" });
                }
                return;
              }
            }
          } catch { /* retry */ }
        }
        clearUserAuth();
        setTsStatus({ type: "error", message: "Login timed out. Please try again." });
        return;
      }

      if (data.funnelNotEnabled && data.enableUrl) {
        await pollFunnelEnable(data.enableUrl);
        return;
      }

      setTsStatus({ type: "error", message: data.error || "Failed to connect" });
    } catch (error) {
      setTsStatus({ type: "error", message: error.message });
    } finally {
      setTsLoading(false);
      setTsConnecting(false);
      setTsProgress("");
      clearUserAuth();
    }
  };

  const pollFunnelEnable = async (enableUrl) => {
    requestUserAuth(enableUrl, "Open Funnel Settings");
    setTsProgress("Click \"Open Funnel Settings\" to enable Funnel...");
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await fetch("/api/tunnel/tailscale-enable", { method: "POST" });
        const data = await res.json();
        if (res.ok && data.success) {
          clearUserAuth();
          setTsUrl(data.tunnelUrl || "");
          const ok3 = await pingTsHealth(data.tunnelUrl);
          setTsEnabled(true);
          setTsStatus(ok3 ? null : { type: "warning", message: "Connected but not reachable yet." });
          return;
        }
        if (data.funnelNotEnabled) continue;
        if (data.error) {
          clearUserAuth();
          setTsStatus({ type: "error", message: data.error });
          return;
        }
      } catch { /* retry */ }
    }
    clearUserAuth();
    setTsStatus({ type: "error", message: "Timed out waiting for Funnel to be enabled." });
  };

  const handleDisableTailscale = async () => {
    setTsLoading(true);
    setTsStatus(null);
    try {
      const res = await fetch("/api/tunnel/tailscale-disable", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTsEnabled(false);
        setTsUrl("");
        setShowDisableTsModal(false);
        setTsStatus({ type: "success", message: "Tailscale disabled" });
      } else {
        setTsStatus({ type: "error", message: data.error || "Failed to disable Tailscale" });
      }
    } catch (e) {
      setTsStatus({ type: "error", message: e.message });
    } finally {
      setTsLoading(false);
    }
  };

  const handleOpenTsModal = async () => {
    setTsStatus(null);
    setTsInstallLog([]);
    const data = await checkTailscaleInstalled();
    if (data?.installed && data?.hasCachedPassword) {
      handleConnectTailscale();
    } else {
      setShowTsModal(true);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;

    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A date input yields "YYYY-MM-DD" — Date parses it as UTC midnight,
        // which is in the past for most timezones, so anchor to end-of-day.
        body: JSON.stringify({
          name: newKeyName,
          ...(newKeyExpiry ? { expiresAt: `${newKeyExpiry}T23:59:59.999Z` } : {}),
          ...(newKeyQuota.trim()
            ? (newKeyQuotaWindow === "onetime"
                ? { quotaTokenLimit: Number(newKeyQuota), quotaWindow: "onetime" }
                : { quotaLimit: Number(newKeyQuota), quotaWindow: newKeyQuotaWindow === "monthly" ? "monthly" : "daily" })
            : {}),
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setCreatedKey(data.key);
        await fetchData();
        setNewKeyName("");
        setNewKeyExpiry("");
        setNewKeyQuota("");
        setNewKeyQuotaWindow("daily");
        setShowAddModal(false);
      }
    } catch (error) {
      console.log("Error creating key:", error);
    }
  };

  const handleDeleteKey = async (id) => {
    setConfirmState({
      title: "Delete API Key",
      message: "Delete this API key?",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
          if (res.ok) {
            setKeys(keys.filter((k) => k.id !== id));
            setVisibleKeys(prev => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
        } catch (error) {
          console.log("Error deleting key:", error);
        }
      }
    });
  };

  const handleToggleKey = async (id, isActive) => {
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) {
        setKeys(prev => prev.map(k => k.id === id ? { ...k, isActive } : k));
      }
    } catch (error) {
      console.log("Error toggling key:", error);
    }
  };

  // Inline rename: Enter saves, Esc cancels, empty name rejected.
  const startRename = (key) => setRenaming({ id: key.id, name: key.name });
  const cancelRename = () => setRenaming({ id: null, name: "" });
  const saveRename = async (id) => {
    const name = renaming.name.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setKeys(prev => prev.map(k => k.id === id ? { ...k, name } : k));
        cancelRename();
      }
    } catch (error) {
      console.log("Error renaming key:", error);
    }
  };

  // Update key settings from EditKeyModal
  const handleSaveKeySettings = async (payload) => {
    if (!editingKey) return;
    const res = await fetch(`/api/keys/${editingKey.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Failed to update key");
    }
    setKeys((prev) => prev.map((k) => (k.id === editingKey.id ? { ...k, ...data.key } : k)));
    setEditingKey(null);
  };

  const resetQuota = async (id) => {
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotaReset: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(prev => prev.map(k => (k.id === id ? { ...k, ...data.key } : k)));
      }
    } catch (error) {
      console.log("Error resetting quota:", error);
    }
  };

  // Save a key's access (restricted flag + allow list).
  const handleUpdateKeyAccess = async (id, access) => {
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.key) {
        setKeys(prev => prev.map(k => k.id === id ? { ...k, access: data.key.access } : k));
      } else {
        console.log("Error updating key access:", data.error || res.status);
      }
    } catch (error) {
      console.log("Error updating key access:", error);
    }
  };

  const maskKey = (fullKey) => {
    if (!fullKey || fullKey.length <= 10) return fullKey || "";
    return fullKey.slice(0, 6) + "•".repeat(fullKey.length - 10) + fullKey.slice(-4);
  };

  const toggleKeyVisibility = (keyId) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(keyId)) next.delete(keyId);
      else next.add(keyId);
      return next;
    });
  };

  const [baseUrl, setBaseUrl] = useState("/v1");

  // Hydration fix: Only access window on client side
  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(`${window.location.origin}/v1`);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-8">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const currentEndpoint = baseUrl;

  const isKeyExhausted = (k) => {
    if (k.quotaTokenLimit && (k.quotaTokensUsed || 0) >= k.quotaTokenLimit) return true;
    if (k.quotaLimit && (k.quotaUsed || 0) >= k.quotaLimit) return true;
    return false;
  };

  const search = keySearch.trim().toLowerCase();
  const filteredKeys = keys.filter((k) => {
    if (filterStatus === "active" && (k.isActive === false || isKeyExhausted(k))) return false;
    if (filterStatus === "paused" && k.isActive !== false) return false;
    if (filterStatus === "exhausted" && !isKeyExhausted(k)) return false;

    if (search) {
      const nameMatch = (k.name || "").toLowerCase().includes(search);
      const keyMatch = (k.key || "").toLowerCase().includes(search);
      if (!nameMatch && !keyMatch) return false;
    }
    return true;
  });

  const keysPerPage = 10;
  const totalKeyPages = Math.max(1, Math.ceil(filteredKeys.length / keysPerPage));
  const currentKeyPage = Math.min(keyPage, totalKeyPages);
  const paginatedKeys = filteredKeys.slice((currentKeyPage - 1) * keysPerPage, currentKeyPage * keysPerPage);

  const countActive = keys.filter((k) => k.isActive !== false && !isKeyExhausted(k)).length;
  const countExhausted = keys.filter((k) => isKeyExhausted(k)).length;
  const countPaused = keys.filter((k) => k.isActive === false).length;

  return (
    <div className="flex flex-col gap-8">
      {/* Endpoint Card */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[var(--color-ink)]">api</span>
            <h2 className="text-[16px] font-bold text-[var(--color-ink)] font-mono">
              API Endpoint
            </h2>
          </div>
          <span className="text-[12px] text-[var(--color-mute)] font-mono hidden sm:inline">
            OpenAI-Compatible (/v1/*)
          </span>
        </div>

        {/* Endpoint Channels — Mobile-First Stack */}
        <div className="flex flex-col gap-3">
          {/* 1. Local Gateway */}
          <div className="p-3.5 sm:p-4 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] rounded">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold text-[var(--color-ink)] font-mono">
                  Local Gateway
                </span>
                <span className="px-1.5 py-0.2 text-[10px] font-mono text-[var(--color-success)] border border-[rgba(48,209,88,0.4)] rounded">
                  ONLINE
                </span>
              </div>
              <span className="text-[12px] text-[var(--color-mute)] font-mono hidden sm:inline">
                Loopback
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[var(--color-canvas)] border border-[var(--color-hairline)] rounded">
              <div className="min-w-0 flex-1 overflow-x-auto scroll-thin-x py-0.5">
                <code className="text-[13px] text-[var(--color-ink)] font-mono whitespace-nowrap select-all block">
                  {currentEndpoint}
                </code>
              </div>
              <button
                onClick={() => copy(currentEndpoint, "local_url")}
                className="flex items-center justify-center h-7 px-2.5 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] text-[var(--color-mute)] hover:text-[var(--color-ink)] rounded text-[12px] font-mono transition-colors shrink-0 cursor-pointer"
                title="Copy local endpoint URL"
              >
                <span className="material-symbols-outlined text-[14px] mr-1">
                  {copied === "local_url" ? "check" : "content_copy"}
                </span>
                {copied === "local_url" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* 2. Cloudflare Tunnel */}
          <div className="p-3.5 sm:p-4 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] rounded">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold text-[var(--color-ink)] font-mono">
                  Cloudflare Tunnel
                </span>
                {tunnelEnabled && tunnelReachable && (
                  <span className="px-1.5 py-0.2 text-[10px] font-mono text-[var(--color-success)] border border-[rgba(48,209,88,0.4)] rounded">
                    ONLINE
                  </span>
                )}
                {tunnelEnabled && !tunnelReachable && !tunnelLoading && (
                  <span className="px-1.5 py-0.2 text-[10px] font-mono text-[var(--color-warning)] border border-[var(--color-warning)]/40 rounded">
                    CONNECTING
                  </span>
                )}
                {!tunnelEnabled && (
                  <span className="px-1.5 py-0.2 text-[10px] font-mono text-[var(--color-mute)] border border-[var(--color-hairline)] rounded">
                    OFF
                  </span>
                )}
              </div>
            </div>

            {tunnelEnabled && !tunnelLoading && tunnelReachable ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[var(--color-canvas)] border border-[var(--color-hairline)] rounded">
                <div className="min-w-0 flex-1 overflow-x-auto scroll-thin-x py-0.5">
                  <code className="text-[13px] text-[var(--color-ink)] font-mono whitespace-nowrap select-all block">
                    {`${tunnelPublicUrl || tunnelUrl}/v1`}
                  </code>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => copy(`${tunnelPublicUrl || tunnelUrl}/v1`, "tunnel_url")}
                    className="flex items-center justify-center h-7 px-2.5 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] text-[var(--color-mute)] hover:text-[var(--color-ink)] rounded text-[12px] font-mono transition-colors cursor-pointer"
                    title="Copy tunnel URL"
                  >
                    <span className="material-symbols-outlined text-[14px] mr-1">
                      {copied === "tunnel_url" ? "check" : "content_copy"}
                    </span>
                    {copied === "tunnel_url" ? "Copied" : "Copy"}
                  </button>
                  <button
                    onClick={() => setShowDisableTunnelModal(true)}
                    className="flex items-center justify-center h-7 px-2 border border-red-500/20 text-red-500 hover:bg-red-500/10 rounded text-[12px] font-mono transition-colors cursor-pointer"
                    title="Disable Tunnel"
                  >
                    <span className="material-symbols-outlined text-[14px] mr-1">power_settings_new</span>
                    Stop
                  </button>
                </div>
              </div>
            ) : tunnelEnabled && !tunnelLoading && !tunnelReachable ? (
              <div className="flex items-center justify-between gap-2 p-3 rounded border border-amber-300 dark:border-amber-800 bg-amber-500/5 text-sm text-amber-600 dark:text-amber-400 font-mono">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                  <span>{tunnelEverReachable ? "Tunnel reconnecting..." : "Tunnel checking..."}</span>
                </div>
                <button
                  onClick={() => setShowDisableTunnelModal(true)}
                  className="p-1 hover:bg-red-500/10 rounded text-red-500 transition-colors"
                  title="Disable Tunnel"
                >
                  <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
                </button>
              </div>
            ) : tunnelLoading ? (
              <div className="flex items-center justify-between gap-2 p-3 rounded border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-sm text-[var(--color-mute)] font-mono">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                  <span>{tunnelProgress || "Creating tunnel..."}</span>
                </div>
                <button
                  onClick={() => { setTunnelLoading(false); setTunnelProgress(""); }}
                  className="p-1 hover:bg-red-500/10 rounded text-red-500 transition-colors"
                  title="Stop"
                >
                  <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
                </button>
              </div>
            ) : tunnelStatus?.type === "error" ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 px-3 py-2 rounded border border-red-300 dark:border-red-800 bg-red-500/5 text-sm text-red-600 dark:text-red-400 font-mono">
                  <span className="material-symbols-outlined text-sm">error</span>
                  <span>{tunnelStatus.message}</span>
                </div>
                <Button size="sm" icon="cloud_upload" onClick={() => setShowEnableTunnelModal(true)} className="w-full sm:w-auto">
                  Enable Tunnel
                </Button>
              </div>
            ) : tunnelChecking ? (
              <div className="flex items-center justify-between gap-2 p-3 rounded border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-sm text-[var(--color-mute)] font-mono">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                  <span>Checking tunnel...</span>
                </div>
                <button
                  onClick={() => setTunnelChecking(false)}
                  className="p-1 hover:bg-red-500/10 rounded text-red-500 transition-colors"
                  title="Stop"
                >
                  <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-[13px] text-[var(--color-mute)] font-mono">
                  Public HTTPS URL via Cloudflare. No port forwarding needed.
                </p>
                <Button
                  size="sm"
                  icon="cloud_upload"
                  className="w-full sm:w-auto shrink-0"
                  onClick={() => {
                    if (isLoginUnsafe) {
                      setTunnelStatus({ type: "error", message: `Security required: ${unsafeReason}` });
                      return;
                    }
                    if (!requireApiKey) {
                      setTunnelStatus({ type: "error", message: "Security required: Enable \"Require API key\" before activating the tunnel." });
                      return;
                    }
                    setShowEnableTunnelModal(true);
                  }}
                >
                  Enable Tunnel
                </Button>
              </div>
            )}
          </div>

          {/* 3. Tailscale Funnel */}
          <div className="p-3.5 sm:p-4 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] rounded">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold text-[var(--color-ink)] font-mono">
                  Tailscale Funnel
                </span>
                {tsEnabled && tsReachable && (
                  <span className="px-1.5 py-0.2 text-[10px] font-mono text-[var(--color-success)] border border-[rgba(48,209,88,0.4)] rounded">
                    ONLINE
                  </span>
                )}
                {tsEnabled && !tsReachable && !tsLoading && (
                  <span className="px-1.5 py-0.2 text-[10px] font-mono text-[var(--color-warning)] border border-[var(--color-warning)]/40 rounded">
                    CONNECTING
                  </span>
                )}
                {!tsEnabled && (
                  <span className="px-1.5 py-0.2 text-[10px] font-mono text-[var(--color-mute)] border border-[var(--color-hairline)] rounded">
                    OFF
                  </span>
                )}
              </div>
            </div>

            {tsEnabled && !tsLoading && tsReachable ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[var(--color-canvas)] border border-[var(--color-hairline)] rounded">
                <div className="min-w-0 flex-1 overflow-x-auto scroll-thin-x py-0.5">
                  <code className="text-[13px] text-[var(--color-ink)] font-mono whitespace-nowrap select-all block">
                    {`${tsUrl}/v1`}
                  </code>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => copy(`${tsUrl}/v1`, "ts_url")}
                    className="flex items-center justify-center h-7 px-2.5 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] text-[var(--color-mute)] hover:text-[var(--color-ink)] rounded text-[12px] font-mono transition-colors cursor-pointer"
                    title="Copy tailscale URL"
                  >
                    <span className="material-symbols-outlined text-[14px] mr-1">
                      {copied === "ts_url" ? "check" : "content_copy"}
                    </span>
                    {copied === "ts_url" ? "Copied" : "Copy"}
                  </button>
                  <button
                    onClick={() => setShowDisableTsModal(true)}
                    className="flex items-center justify-center h-7 px-2 border border-red-500/20 text-red-500 hover:bg-red-500/10 rounded text-[12px] font-mono transition-colors cursor-pointer"
                    title="Disable Tailscale"
                  >
                    <span className="material-symbols-outlined text-[14px] mr-1">power_settings_new</span>
                    Stop
                  </button>
                </div>
              </div>
            ) : tsEnabled && !tsLoading && !tsReachable ? (
              <div className="flex items-center justify-between gap-2 p-3 rounded border border-amber-300 dark:border-amber-800 bg-amber-500/5 text-sm text-amber-600 dark:text-amber-400 font-mono">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                  <span>{tsEverReachable ? "Tailscale reconnecting..." : "Tailscale checking..."}</span>
                </div>
                <button
                  onClick={() => setShowDisableTsModal(true)}
                  className="p-1 hover:bg-red-500/10 rounded text-red-500 transition-colors"
                  title="Disable Tailscale"
                >
                  <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
                </button>
              </div>
            ) : (tsLoading || tsConnecting) ? (
              <div className="flex items-center justify-between gap-2 p-3 rounded border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-sm text-[var(--color-mute)] font-mono">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                  <span>{tsProgress || "Connecting..."}</span>
                </div>
                <div className="flex items-center gap-2">
                  {tsAuthUrl && (
                    <Button
                      size="sm"
                      icon="open_in_new"
                      onClick={() => window.open(tsAuthUrl, "tailscale_auth", "width=600,height=700,noopener,noreferrer")}
                    >
                      {tsAuthLabel || "Open"}
                    </Button>
                  )}
                  <button
                    onClick={() => { setTsLoading(false); setTsConnecting(false); setTsProgress(""); clearUserAuth(); }}
                    className="p-1 hover:bg-red-500/10 rounded text-red-500 transition-colors"
                    title="Stop"
                  >
                    <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
                  </button>
                </div>
              </div>
            ) : tsStatus?.type === "error" ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 px-3 py-2 rounded border border-red-300 dark:border-red-800 bg-red-500/5 text-sm text-red-600 dark:text-red-400 font-mono">
                  <span className="material-symbols-outlined text-sm">error</span>
                  <span>{tsStatus.message}</span>
                </div>
                <Button size="sm" icon="vpn_lock" onClick={handleOpenTsModal} className="w-full sm:w-auto">
                  Enable Tailscale
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-[13px] text-[var(--color-mute)] font-mono">
                  Secure mesh network URL via Tailscale Funnel.
                </p>
                <Button
                  size="sm"
                  icon="vpn_lock"
                  className="w-full sm:w-auto shrink-0"
                  onClick={() => {
                    if (isLoginUnsafe) {
                      setTsStatus({ type: "error", message: `Security required: ${unsafeReason}` });
                      return;
                    }
                    handleOpenTsModal();
                  }}
                >
                  Enable Tailscale
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Pre-enable security gate banner */}
        {isLoginUnsafe && !tunnelEnabled && !tsEnabled && (
          <div className="mt-4">
            <SecurityWarning
              message={unsafeReason}
              action={{ label: "Open settings", href: "/dashboard/profile" }}
            />
          </div>
        )}

        {/* Security warnings when tunnel or tailscale is active */}
        {(tunnelEnabled || tsEnabled) && (
          <div className="mt-4 flex flex-col gap-2">
            {!requireApiKey && (
              <SecurityWarning
                message="Require API key is disabled — your endpoint is publicly accessible without authentication."
                action={{ label: "Enable", href: "#require-api-key" }}
              />
            )}
            {(!requireLogin || !hasPassword) && (
              <SecurityWarning
                message={
                  !requireLogin
                    ? "Require login is disabled — anyone can access your dashboard via tunnel."
                    : "Dashboard uses the default password — change it in Profile settings."
                }
                action={{
                  label: !requireLogin ? "Enable" : "Change password",
                  href: "/dashboard/profile",
                }}
              />
            )}
          </div>
        )}

        {/* Tunnel dashboard access option */}
        {(tunnelEnabled || tsEnabled) && (
          <div className="mt-4 pt-4 border-t border-border flex items-center gap-3">
            <Toggle
              checked={tunnelDashboardAccess}
              onChange={() => handleTunnelDashboardAccess(!tunnelDashboardAccess)}
            />
            <div className="flex items-center gap-1.5">
              <p className="font-medium text-sm">Allow dashboard access via tunnel</p>
              <Tooltip text="When enabled, the dashboard can be accessed through your tunnel or Tailscale URL (login still required). When disabled, dashboard access via tunnel/Tailscale is completely blocked." />
            </div>
          </div>
        )}
      </Card>

      {/* API Keys */}
      <Card id="require-api-key">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[var(--color-ink)]">vpn_key</span>
            <h2 className="text-[16px] font-bold text-[var(--color-ink)] font-mono">
              API Keys
            </h2>
          </div>
          <Button size="sm" icon="add" onClick={() => setShowAddModal(true)} className="w-full sm:w-auto h-8 text-xs font-mono">
            Create Key
          </Button>
        </div>

        {/* Search & Filter Bar (Mobile-First) */}
        <div className="flex flex-col gap-2.5 mb-4">
          <div className="flex items-center gap-2">
            <Input
              value={keySearch}
              onChange={(e) => {
                setKeySearch(e.target.value);
                setKeyPage(1);
              }}
              placeholder="Search keys by name or 9r-..."
              className="flex-1"
              inputClassName="h-9 text-xs font-mono rounded-[4px]"
            />
            {keySearch && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setKeySearch("");
                  setKeyPage(1);
                }}
                className="h-9 px-2 text-xs font-mono shrink-0"
              >
                Clear
              </Button>
            )}
          </div>

          {/* Filter Pills with Counts */}
          <div className="flex items-center gap-1.5 overflow-x-auto scroll-thin-x pb-1 text-xs font-mono">
            <button
              onClick={() => { setFilterStatus("all"); setKeyPage(1); }}
              className={`h-7 px-2.5 rounded-[4px] border transition-colors whitespace-nowrap cursor-pointer ${
                filterStatus === "all"
                  ? "bg-[var(--color-ink)] text-[var(--color-canvas)] border-[var(--color-ink)] font-bold"
                  : "bg-[var(--color-surface-soft)] text-[var(--color-mute)] border-[var(--color-hairline)] hover:text-[var(--color-ink)]"
              }`}
            >
              All ({keys.length})
            </button>
            <button
              onClick={() => { setFilterStatus("active"); setKeyPage(1); }}
              className={`h-7 px-2.5 rounded-[4px] border transition-colors whitespace-nowrap cursor-pointer ${
                filterStatus === "active"
                  ? "bg-[var(--color-ink)] text-[var(--color-canvas)] border-[var(--color-ink)] font-bold"
                  : "bg-[var(--color-surface-soft)] text-[var(--color-mute)] border-[var(--color-hairline)] hover:text-[var(--color-ink)]"
              }`}
            >
              Active ({countActive})
            </button>
            <button
              onClick={() => { setFilterStatus("exhausted"); setKeyPage(1); }}
              className={`h-7 px-2.5 rounded-[4px] border transition-colors whitespace-nowrap cursor-pointer ${
                filterStatus === "exhausted"
                  ? "bg-[var(--color-danger)] text-white border-[var(--color-danger)] font-bold"
                  : "bg-[var(--color-surface-soft)] text-[var(--color-mute)] border-[var(--color-hairline)] hover:text-[var(--color-danger)]"
              }`}
            >
              Exhausted ({countExhausted})
            </button>
            <button
              onClick={() => { setFilterStatus("paused"); setKeyPage(1); }}
              className={`h-7 px-2.5 rounded-[4px] border transition-colors whitespace-nowrap cursor-pointer ${
                filterStatus === "paused"
                  ? "bg-[var(--color-warning)] text-black border-[var(--color-warning)] font-bold"
                  : "bg-[var(--color-surface-soft)] text-[var(--color-mute)] border-[var(--color-hairline)] hover:text-[var(--color-warning)]"
              }`}
            >
              Paused ({countPaused})
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pb-3.5 mb-4 border-b border-[var(--color-hairline)]">
          <div className="min-w-0 pr-2">
            <p className="text-[14px] font-bold text-[var(--color-ink)] font-mono">
              Require API key
            </p>
            <p className="text-[12px] text-[var(--color-mute)] font-mono leading-tight mt-0.5">
              Requests without a valid key will be rejected
            </p>
          </div>
          <Toggle
            checked={requireApiKey}
            onChange={() => handleRequireApiKey(!requireApiKey)}
          />
        </div>

        {isRemoteHost && !requireApiKey && (
          <div className="mb-4 -mt-2">
            <SecurityWarning message="Endpoint is exposed without an API key." />
          </div>
        )}

        {keys.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
              <span className="material-symbols-outlined text-[32px]">vpn_key</span>
            </div>
            <p className="text-text-main font-medium mb-1">No API keys yet</p>
            <p className="text-sm text-text-muted mb-4">Create your first API key to get started</p>
            <Button icon="add" onClick={() => setShowAddModal(true)}>
              Create Key
            </Button>
          </div>
        ) : filteredKeys.length === 0 ? (
          <div className="text-center py-12 font-mono">
            <p className="text-sm text-[var(--color-mute)]">No keys match the current filter</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-xs"
              onClick={() => {
                setKeySearch("");
                setFilterStatus("all");
                setKeyPage(1);
              }}
            >
              Reset filters
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {paginatedKeys.map((key) => {
              const keyExpiry = expiryLabel(key);
              const exhausted = isKeyExhausted(key);
              const isOnetime = key.quotaWindow === "onetime";

              return (
                <div
                  key={key.id}
                  className={cn(
                    "p-4 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] transition-colors",
                    key.isActive === false && "opacity-70",
                    exhausted && "border-[var(--color-danger)]/50 bg-[rgba(239,68,68,0.02)]"
                  )}
                  style={{ borderRadius: "4px" }}
                >
                  {/* Header: Name, Rename, Status Pill, Edit, Toggle, Delete */}
                  <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--color-hairline)]">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      {renaming.id === key.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={renaming.name}
                            onChange={(e) => setRenaming({ id: key.id, name: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRename(key.id);
                              if (e.key === "Escape") cancelRename();
                            }}
                            autoFocus
                            placeholder="Key name"
                            className="w-48"
                          />
                          <Button size="xs" onClick={() => saveRename(key.id)} disabled={!renaming.name.trim()}>
                            Save
                          </Button>
                          <Button size="xs" variant="ghost" onClick={cancelRename}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group/name min-w-0">
                          <span className="text-[15px] font-bold text-[var(--color-ink)] truncate font-mono">
                            {key.name}
                          </span>
                          <button
                            onClick={() => startRename(key)}
                            className="p-1 rounded text-[var(--color-mute)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-card)] transition-colors"
                            title="Rename key"
                          >
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                          </button>
                        </div>
                      )}

                      {/* Status Badges */}
                      {key.isActive === false ? (
                        <span className="px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-warning)] border border-[var(--color-warning)]/40 rounded-[4px] font-bold">
                          [PAUSED]
                        </span>
                      ) : exhausted ? (
                        <span className="px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-danger)] border border-[var(--color-danger)]/40 rounded-[4px] font-bold bg-[rgba(239,68,68,0.08)]">
                          [EXHAUSTED (429)]
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-success)] border border-[rgba(48,209,88,0.4)] rounded-[4px] font-bold">
                          [ACTIVE]
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setEditingKey(key)}
                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[11px] font-mono font-medium text-[var(--color-ink)] hover:border-[var(--color-primary)] transition-colors cursor-pointer"
                        title="Edit key settings, models and token limits"
                      >
                        <span className="material-symbols-outlined text-[13px]">tune</span>
                        Edit
                      </button>
                      <Toggle
                        size="sm"
                        checked={key.isActive ?? true}
                        onChange={(checked) => {
                          if (key.isActive && !checked) {
                            setConfirmState({
                              title: "Pause API Key",
                              message: `Pause API key "${key.name}"?\n\nThis key will stop working immediately but can be resumed later.`,
                              onConfirm: async () => {
                                setConfirmState(null);
                                handleToggleKey(key.id, checked);
                              },
                            });
                          } else {
                            handleToggleKey(key.id, checked);
                          }
                        }}
                        title={key.isActive ? "Pause key" : "Resume key"}
                      />
                      <button
                        onClick={() => handleDeleteKey(key.id)}
                        className="flex items-center justify-center size-7 rounded text-[var(--color-mute)] hover:text-[var(--color-danger)] hover:bg-[var(--color-surface-card)] transition-colors cursor-pointer"
                        title="Delete key"
                        aria-label="Delete key"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>

                  {/* Secret Key Snippet */}
                  <div className="my-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 sm:px-3 sm:py-2 bg-[var(--color-surface-card)] border border-[var(--color-hairline)] rounded-[4px]">
                    <div className="min-w-0 flex-1 overflow-x-auto scroll-thin-x py-0.5">
                      <code className="text-[13px] text-[var(--color-ink)] font-mono whitespace-nowrap select-all block">
                        {visibleKeys.has(key.id) ? key.key : maskKey(key.key)}
                      </code>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-[var(--color-hairline)] w-full sm:w-auto justify-end">
                      <button
                        onClick={() => toggleKeyVisibility(key.id)}
                        className="flex items-center justify-center h-7 px-2 border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-mute)] hover:text-[var(--color-ink)] rounded-[4px] text-[12px] font-mono transition-colors cursor-pointer"
                        title={visibleKeys.has(key.id) ? "Hide key" : "Show key"}
                      >
                        <span className="material-symbols-outlined text-[14px] mr-1">
                          {visibleKeys.has(key.id) ? "visibility_off" : "visibility"}
                        </span>
                        {visibleKeys.has(key.id) ? "Hide" : "Show"}
                      </button>
                      <button
                        onClick={() => copy(key.key, key.id)}
                        className="flex items-center justify-center h-7 px-2 border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-mute)] hover:text-[var(--color-ink)] rounded-[4px] text-[12px] font-mono transition-colors cursor-pointer"
                        title="Copy key"
                      >
                        <span className="material-symbols-outlined text-[14px] mr-1">
                          {copied === key.id ? "check" : "content_copy"}
                        </span>
                        {copied === key.id ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {/* Specs & Attributes */}
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] bg-[var(--color-canvas)] border border-[var(--color-hairline)] text-[var(--color-mute)]">
                      <span className="text-[var(--color-ash)]">Created:</span>
                      <span className="text-[var(--color-ink)] font-medium whitespace-nowrap">{fmtDate(key.createdAt)}</span>
                    </div>

                    {keyExpiry && (
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border ${
                        keyExpiry.variant === "error"
                          ? "bg-[rgba(239,68,68,0.08)] border-[var(--color-danger)] text-[var(--color-danger)]"
                          : "bg-[var(--color-canvas)] border-[var(--color-hairline)] text-[var(--color-mute)]"
                      }`}>
                        <span className={keyExpiry.variant === "error" ? "text-[var(--color-danger)] opacity-80" : "text-[var(--color-ash)]"}>Expires:</span>
                        <span className={keyExpiry.variant === "error" ? "font-semibold whitespace-nowrap" : "text-[var(--color-ink)] font-medium whitespace-nowrap"}>
                          {keyExpiry.text}
                        </span>
                      </div>
                    )}

                    {isKeyStale(key) && key.isActive !== false && (
                      <button
                        onClick={() => handleToggleKey(key.id, false)}
                        title={key.usage ? "Unused for over 90 days — click to pause" : "Created over 90 days ago and never used — click to pause"}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] bg-[rgba(245,158,11,0.08)] border border-[var(--color-warning)] text-[var(--color-warning)] hover:opacity-80 font-medium whitespace-nowrap cursor-pointer"
                      >
                        [!] Stale (pause)
                      </button>
                    )}
                  </div>

                  {/* Quota & Usage Bar */}
                  <div className="mt-3 flex flex-col gap-2.5 font-mono text-xs">
                    {/* Onetime token bar */}
                    {isOnetime ? (
                      (() => {
                        const used = key.quotaTokensUsed || 0;
                        const limit = key.quotaTokenLimit || 0;
                        const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                        const isEx = limit > 0 && used >= limit;
                        return (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-[11px] tabular-nums">
                              <span className="text-[var(--color-mute)]">
                                <span className="text-[var(--color-ash)]">Onetime Token Limit: </span>
                                <span className="font-bold text-[var(--color-ink)]">
                                  {fmtTokens(used)} / {fmtTokens(limit)} tok (Lifetime)
                                </span>
                              </span>
                              <span className={`font-bold ${isEx ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"}`}>
                                {isEx ? "[EXHAUSTED]" : `${pct}%`}
                              </span>
                            </div>
                            <div className="w-full h-2 bg-[var(--color-canvas)] border border-[var(--color-hairline)] overflow-hidden rounded-none">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  isEx ? "bg-[var(--color-danger)]" : "bg-[var(--color-accent,#007aff)]"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      /* Recurring or Unlimited */
                      <>
                        {key.quotaLimit && (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-[11px] tabular-nums">
                              <span className="text-[var(--color-mute)]">
                                <span className="text-[var(--color-ash)]">Requests: </span>
                                <span className="font-bold text-[var(--color-ink)]">
                                  {key.quotaUsed || 0} / {key.quotaLimit} reqs ({key.quotaWindow === "monthly" ? "mo" : "day"})
                                </span>
                              </span>
                              <span className={`font-bold ${
                                (key.quotaUsed || 0) >= key.quotaLimit ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"
                              }`}>
                                {Math.round(((key.quotaUsed || 0) / key.quotaLimit) * 100)}%
                              </span>
                            </div>
                            <div className="w-full h-2 bg-[var(--color-canvas)] border border-[var(--color-hairline)] overflow-hidden rounded-none">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  (key.quotaUsed || 0) >= key.quotaLimit ? "bg-[var(--color-danger)]" : "bg-[var(--color-primary)]"
                                }`}
                                style={{ width: `${Math.max(0, Math.min(100, ((key.quotaUsed || 0) / key.quotaLimit) * 100))}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {key.quotaTokenLimit ? (
                          (() => {
                            const used = key.quotaTokensUsed || 0;
                            const limit = key.quotaTokenLimit;
                            const pct = Math.round((used / limit) * 100);
                            const isEx = used >= limit;
                            return (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between text-[11px] tabular-nums">
                                  <span className="text-[var(--color-mute)]">
                                    <span className="text-[var(--color-ash)]">Token Usage: </span>
                                    <span className="font-bold text-[var(--color-ink)]">
                                      {fmtTokens(used)} / {fmtTokens(limit)} tok ({key.quotaWindow === "monthly" ? "mo" : "day"})
                                    </span>
                                  </span>
                                  <span className={`font-bold ${isEx ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"}`}>
                                    {pct}%
                                  </span>
                                </div>
                                <div className="w-full h-2 bg-[var(--color-canvas)] border border-[var(--color-hairline)] overflow-hidden rounded-none">
                                  <div
                                    className={`h-full transition-all duration-300 ${
                                      isEx ? "bg-[var(--color-danger)]" : "bg-[var(--color-accent,#007aff)]"
                                    }`}
                                    style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-[11px] text-[var(--color-mute)]">
                              <span>
                                <span className="text-[var(--color-ash)]">Token Usage: </span>
                                <span className="text-[var(--color-ink)] font-medium">
                                  {fmtTokens((key.usage?.promptTokens || 0) + (key.usage?.completionTokens || 0))} tok (unlimited)
                                </span>
                              </span>
                              <span className="font-medium text-[var(--color-ash)]">No Limit</span>
                            </div>
                            <div className="w-full h-2 bg-[var(--color-canvas)] border border-[var(--color-hairline)] overflow-hidden rounded-none">
                              <div
                                className="h-full bg-[var(--color-accent,#007aff)] transition-all duration-300"
                                style={{ width: "100%" }}
                              />
                            </div>
                          </div>
                        )}

                        {(key.quotaLimit || key.quotaTokenLimit) && (
                          <div className="flex items-center justify-between pt-1 text-[11px] text-[var(--color-mute)]">
                            <span>
                              Window: <span className="text-[var(--color-ink)] font-medium">{key.quotaWindow === "monthly" ? "Monthly" : "Daily (UTC)"}</span>
                              {key.quotaResetAt && (
                                <span className="text-[var(--color-ash)] ml-2">
                                  Resets: {new Date(key.quotaResetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              )}
                            </span>
                            <button
                              onClick={() => resetQuota(key.id)}
                              className="text-[11px] font-mono text-[var(--color-mute)] underline hover:text-[var(--color-ink)] cursor-pointer"
                              title="Zero the window counters and restart interval"
                            >
                              Reset counters
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Allowed Models Summary Preview */}
                  <div className="mt-2.5 pt-2 border-t border-[var(--color-hairline)] flex items-center gap-1.5 flex-wrap text-[11px] font-mono">
                    <span className="text-[var(--color-ash)]">Allowed Models:</span>
                    {key.access?.restricted ? (
                      (key.access.allow?.length || 0) === 0 ? (
                        <span className="text-[var(--color-danger)] font-bold">
                          [!] Blocked (No models allowed)
                        </span>
                      ) : (
                        <div className="flex items-center gap-1 flex-wrap">
                          {key.access.allow.slice(0, 3).map((m) => (
                            <span
                              key={m}
                              className="px-1.5 py-0.2 rounded-[4px] bg-[var(--color-canvas)] border border-[var(--color-hairline)] text-[var(--color-ink)] text-[10px]"
                            >
                              {m}
                            </span>
                          ))}
                          {key.access.allow.length > 3 && (
                            <span className="text-[var(--color-mute)] text-[10px]">
                              +{key.access.allow.length - 3} more
                            </span>
                          )}
                        </div>
                      )
                    ) : (
                      <span className="text-[var(--color-mute)]">
                        All models permitted (Unrestricted)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Pagination Controls */}
            {totalKeyPages > 1 && (
              <div className="flex items-center justify-between pt-3 mt-1 border-t border-[var(--color-hairline)] text-xs font-mono text-[var(--color-mute)]">
                <span>
                  Showing {(currentKeyPage - 1) * keysPerPage + 1}–{Math.min(currentKeyPage * keysPerPage, filteredKeys.length)} of {filteredKeys.length} keys
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => setKeyPage((p) => Math.max(1, p - 1))}
                    disabled={currentKeyPage <= 1}
                    className="h-7 px-2.5 rounded-[4px]"
                  >
                    &laquo; Prev
                  </Button>
                  <span className="text-[var(--color-ink)] font-bold">
                    {currentKeyPage} / {totalKeyPages}
                  </span>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => setKeyPage((p) => Math.min(totalKeyPages, p + 1))}
                    disabled={currentKeyPage >= totalKeyPages}
                    className="h-7 px-2.5 rounded-[4px]"
                  >
                    Next &raquo;
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Edit Key Modal (Mobile First) */}
      <EditKeyModal
        isOpen={Boolean(editingKey)}
        apiKey={editingKey}
        onClose={() => setEditingKey(null)}
        onSave={handleSaveKeySettings}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
      />

      {/* Add Key Modal */}
      <Modal
        isOpen={showAddModal}
        title="Create API Key"
        onClose={() => {
          setShowAddModal(false);
          setNewKeyName("");
          setNewKeyExpiry("");
          setNewKeyQuota("");
          setNewKeyQuotaWindow("daily");
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setShowAddModal(false);
                setNewKeyName("");
                setNewKeyExpiry("");
                setNewKeyQuota("");
                setNewKeyQuotaWindow("daily");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateKey}
              disabled={!newKeyName.trim()}
            >
              Create Key
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Key Name"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="e.g. Production Backend"
            hint="A friendly label to identify where this key is used."
            required
            autoFocus
          />
          <Input
            type="date"
            label="Expires (optional)"
            value={newKeyExpiry}
            onChange={(e) => setNewKeyExpiry(e.target.value)}
            hint="Leave empty for a key that never expires."
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] font-bold text-[var(--color-ink)]" style={{ fontFamily: "var(--font-mono)" }}>
              Quota Limit (optional)
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                placeholder="e.g. 500"
                value={newKeyQuota}
                onChange={(e) => setNewKeyQuota(e.target.value)}
                className="flex-1 min-w-0"
              />
              <select
                value={newKeyQuotaWindow}
                onChange={(e) => setNewKeyQuotaWindow(e.target.value)}
                className="h-10 px-3 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] text-[14px] font-mono text-[var(--color-ink)] rounded shrink-0 outline-none focus:border-[var(--color-hairline-strong)] transition-colors"
                style={{ borderRadius: "4px" }}
              >
                <option value="daily">requests per day</option>
                <option value="monthly">requests per month</option>
                <option value="onetime">tokens onetime (lifetime)</option>
              </select>
            </div>
            <p className="text-[13px] text-[var(--color-mute)]" style={{ fontFamily: "var(--font-mono)" }}>
              Requests above this quota will receive HTTP 429.
            </p>
          </div>
        </div>
      </Modal>

      {/* Created Key Modal */}
      <Modal
        isOpen={!!createdKey}
        title="API Key Created"
        onClose={() => setCreatedKey(null)}
        footer={
          <Button onClick={() => setCreatedKey(null)}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2 font-medium">
              Save this key now!
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              Store this key securely. You can view or copy it later from the API Keys list.
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              value={createdKey || ""}
              readOnly
              className="flex-1 font-mono text-sm"
            />
            <Button
              variant="secondary"
              icon={copied === "created_key" ? "check" : "content_copy"}
              onClick={() => copy(createdKey, "created_key")}
            >
              {copied === "created_key" ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Enable Tunnel Modal */}
      <Modal
        isOpen={showEnableTunnelModal}
        title="Enable Tunnel"
        onClose={() => setShowEnableTunnelModal(false)}
        footer={
          <>
            <Button onClick={() => setShowEnableTunnelModal(false)} variant="secondary">Cancel</Button>
            <Button onClick={handleEnableTunnel}>
              Start Tunnel
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="bg-surface-2 border border-border-subtle rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary">cloud_upload</span>
              <div>
                <p className="text-sm text-text-main font-medium mb-1">
                  Cloudflare Tunnel
                </p>
                <p className="text-sm text-text-muted">
                  Expose your local 9Router to the internet. No port forwarding, no static IP needed. Share endpoint URL with your team or use it in Cursor, Cline, and other AI tools from anywhere.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {TUNNEL_BENEFITS.map((benefit) => (
              <div key={benefit.title} className="flex flex-col items-center text-center p-3 rounded-lg bg-sidebar/50">
                <span className="material-symbols-outlined text-xl text-primary mb-1">{benefit.icon}</span>
                <p className="text-xs font-semibold">{benefit.title}</p>
                <p className="text-xs text-text-muted">{benefit.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-text-muted">
            Requires outbound port 7844 (TCP/UDP). Connection may take 10-30s.
          </p>
        </div>
      </Modal>

      {/* Disable Cloudflare Tunnel Modal */}
      <Modal
        isOpen={showDisableTunnelModal}
        title="Disable Tunnel"
        onClose={() => !tunnelLoading && setShowDisableTunnelModal(false)}
        footer={
          <>
            <Button onClick={() => setShowDisableTunnelModal(false)} variant="secondary" disabled={tunnelLoading}>Cancel</Button>
            <Button onClick={handleDisableTunnel} disabled={tunnelLoading} variant="danger">
              {tunnelLoading ? "Disabling..." : "Disable"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">The Cloudflare tunnel will be disconnected. Remote access via tunnel URL will stop working.</p>
        </div>
      </Modal>

      {/* Tailscale Modal */}
      <Modal
        isOpen={showTsModal}
        title="Tailscale Funnel"
        onClose={() => { if (!tsInstalling) { setShowTsModal(false); setTsSudoPassword(""); setTsStatus(null); } }}
        footer={
          !tsInstalling ? (
            <>
              <Button onClick={() => setShowTsModal(false)} variant="secondary">Cancel</Button>
              {tsInstalled === false && (
                <Button onClick={handleInstallTailscale}>
                  Install Tailscale
                </Button>
              )}
              {tsInstalled === true && (
                <Button onClick={() => handleConnectTailscale()}>
                  Connect
                </Button>
              )}
            </>
          ) : null
        }
      >
        <div className="flex flex-col gap-4">
          {/* Checking state */}
          {tsInstalled === null && (
            <p className="text-sm text-text-muted flex items-center gap-2">
              <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
              Checking...
            </p>
          )}

          {/* Not installed */}
          {tsInstalled === false && !tsInstalling && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text-muted">Tailscale is not installed. Install it to enable Funnel.</p>
            </div>
          )}

          {/* Installing with progress log */}
          {tsInstalling && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                Installing Tailscale...
              </div>
              {tsInstallLog.length > 0 && (
                <div ref={tsLogRef} className="bg-black/5 dark:bg-white/5 rounded p-2 max-h-40 overflow-y-auto font-mono text-xs text-text-muted">
                  {tsInstallLog.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Installed: show Connect button */}
          {tsInstalled === true && !tsInstalling && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                Tailscale installed
              </div>
            </div>
          )}

          {tsStatus && <StatusAlert status={tsStatus} />}
        </div>
      </Modal>

      {/* Disable Tailscale Modal */}
      <Modal
        isOpen={showDisableTsModal}
        title="Disable Tailscale"
        onClose={() => !tsLoading && setShowDisableTsModal(false)}
        footer={
          <>
            <Button onClick={() => setShowDisableTsModal(false)} variant="secondary" disabled={tsLoading}>Cancel</Button>
            <Button onClick={handleDisableTailscale} disabled={tsLoading} variant="danger">
              {tsLoading ? "Disabling..." : "Disable"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">Tailscale Funnel will be stopped. Remote access via Tailscale URL will stop working.</p>
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


APIPageClient.propTypes = {
  machineId: PropTypes.string.isRequired,
};
