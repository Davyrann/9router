"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG, UPDATER_CONFIG } from "@/shared/constants/config";
import { MEDIA_PROVIDER_KINDS } from "@/shared/constants/providers";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import useSettingsStore from "@/store/settingsStore";
import Button from "./Button";
import { ConfirmModal } from "./Modal";

const VISIBLE_MEDIA_KINDS = ["embedding", "image", "video", "tts", "stt", "systemone"];
const COMBINED_WEB_ITEM = { id: "web", label: "Web Fetch & Search", icon: "travel_explore", href: "/dashboard/media-providers/web" };

const navItems = [
  { href: "/dashboard/endpoint", label: "Endpoint & Key", icon: "api" },
  { href: "/dashboard/providers", label: "Providers", icon: "dns" },
  { href: "/dashboard/combos", label: "Combo & Vision", icon: "layers" },
  { href: "/dashboard/usage", label: "Usage", icon: "bar_chart" },
  { href: "/dashboard/quota", label: "Quota Tracker", icon: "data_usage" },
  { href: "/dashboard/token-saver", label: "Token Saver", icon: "savings" },
  { href: "/dashboard/cli-tools", label: "CLI Tools", icon: "terminal" },
];

const debugItems = [
  { href: "/dashboard/console-log", label: "Console Log", icon: "terminal" },
  { href: "/dashboard/translator", label: "Translator", icon: "translate" },
];

const systemItems = [
  { href: "/dashboard/proxy-pools", label: "Proxy Pools", icon: "lan" },
  { href: "/dashboard/skills", label: "Skills", icon: "extension" },
];

const NavLink = ({ href, label, icon, active, onClick }) => (
  <Link
    href={href}
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 px-3 py-2 transition-colors group",
      "border-l-2",
      active
        ? "border-[var(--color-ink)] text-[var(--color-ink)] bg-[var(--color-surface-soft)]"
        : "border-transparent text-[var(--color-mute)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)]"
    )}
  >
    <span className={cn("material-symbols-outlined text-[16px]", active ? "fill-1" : "")}>{icon}</span>
    <span className="text-[13px] font-medium">{label}</span>
  </Link>
);

export default function Sidebar({ onClose }) {
  const pathname = usePathname();
  const [mediaOpen, setMediaOpen] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [shutdownCountdown, setShutdownCountdown] = useState(0);
  const [enableTranslator, setEnableTranslator] = useState(false);
  const { copied, copy } = useCopyToClipboard(2000);

  const INSTALL_CMD = UPDATER_CONFIG.installCmdLatest;

  useEffect(() => {
    useSettingsStore.getState().fetchSettings().then((data) => {
      if (data?.enableTranslator) setEnableTranslator(true);
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch("/api/version")
        .then(res => res.json())
        .then(data => { if (data.hasUpdate) setUpdateInfo(data); })
        .catch(() => {});
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const isActive = (href) => {
    if (href === "/dashboard/endpoint") {
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/endpoint");
    }
    return pathname.startsWith(href);
  };

  const handleUpdate = () => {
    setShowUpdateModal(false);
    setIsUpdating(true);
  };

  const handleCopyAndShutdown = async () => {
    try { await navigator.clipboard.writeText(INSTALL_CMD); } catch { /* clipboard blocked */ }
    copy(INSTALL_CMD);
    let remaining = UPDATER_CONFIG.shutdownCountdownSec;
    setShutdownCountdown(remaining);
    const timer = setInterval(() => {
      remaining -= 1;
      setShutdownCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        fetch("/api/version/shutdown", { method: "POST" }).catch(() => {});
        setIsDisconnected(true);
      }
    }, 1000);
  };

  const handleCancelUpdate = () => {
    setIsUpdating(false);
    setShutdownCountdown(0);
  };

  return (
    <>
      <aside
        className="flex w-64 flex-col border-r border-[var(--color-hairline)] bg-[var(--color-canvas)] h-full overflow-hidden"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {/* Wordmark */}
        <div
          className="flex items-center justify-between px-4 border-b border-[var(--color-hairline)] shrink-0"
          style={{ height: "56px" }}
        >
          <Link href="/dashboard" className="flex items-baseline gap-2 group">
            <span className="text-[16px] font-bold text-[var(--color-ink)] tracking-tight leading-none">
              9Router
            </span>
            <span className="text-[12px] text-[var(--color-mute)] leading-none">v{APP_CONFIG.version}</span>
          </Link>
          {updateInfo && (
            <button
              onClick={() => setShowUpdateModal(true)}
              className="px-1.5 py-0.5 border border-[var(--color-hairline)] text-[10px] font-bold text-[var(--color-success)] hover:bg-[var(--color-surface-soft)] transition-colors"
              style={{ borderRadius: "4px" }}
              title={`v${updateInfo.latestVersion} available`}
            >
              [+update]
            </button>
          )}
        </div>

        {updateInfo && (
          <div className="px-4 py-2 border-b border-[var(--color-hairline)] bg-[var(--color-surface-soft)] shrink-0 text-[11px]">
            <span className="font-bold text-[var(--color-success)]">
              [+] v{updateInfo.latestVersion} available
            </span>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => setShowUpdateModal(true)}
                className="px-2 py-0.5 border border-[var(--color-hairline)] text-[11px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-canvas)] transition-colors"
                style={{ borderRadius: "4px" }}
              >
                Update
              </button>
              <button
                onClick={() => copy(INSTALL_CMD)}
                className="text-left hover:opacity-70 transition-opacity flex-1 min-w-0"
              >
                <code className="block text-[10px] text-[var(--color-mute)] truncate">
                  {copied ? "✓ copied" : INSTALL_CMD}
                </code>
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto custom-scrollbar">
          <div className="space-y-0">
            {navItems.map((item) => (
              <NavLink key={item.href} {...item} active={isActive(item.href)} onClick={onClose} />
            ))}
          </div>

          {/* System section */}
          <div className="mt-4 border-t border-[var(--color-hairline)] pt-3">
            <p className="px-3 pb-1 text-[11px] font-bold text-[var(--color-ash)] uppercase tracking-widest">
              System
            </p>

            {/* Media Providers accordion */}
            <button
              onClick={() => setMediaOpen((v) => !v)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 transition-colors group border-l-2",
                pathname.startsWith("/dashboard/media-providers")
                  ? "border-[var(--color-ink)] text-[var(--color-ink)] bg-[var(--color-surface-soft)]"
                  : "border-transparent text-[var(--color-mute)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)]"
              )}
            >
              <span className="material-symbols-outlined text-[16px]">perm_media</span>
              <span className="text-[13px] font-medium flex-1 text-left">Media Providers</span>
              <span className="text-[var(--color-ash)] text-[12px]">{mediaOpen ? "[-]" : "[+]"}</span>
            </button>
            {mediaOpen && (
              <div className="pl-4">
                {MEDIA_PROVIDER_KINDS.filter((k) => VISIBLE_MEDIA_KINDS.includes(k.id)).map((kind) => (
                  <NavLink
                    key={kind.id}
                    href={`/dashboard/media-providers/${kind.id}`}
                    label={kind.label}
                    icon={kind.icon}
                    active={isActive(`/dashboard/media-providers/${kind.id}`)}
                    onClick={onClose}
                  />
                ))}
                <NavLink
                  href={COMBINED_WEB_ITEM.href}
                  label={COMBINED_WEB_ITEM.label}
                  icon={COMBINED_WEB_ITEM.icon}
                  active={isActive(COMBINED_WEB_ITEM.href)}
                  onClick={onClose}
                />
              </div>
            )}

            {systemItems.map((item) => (
              <NavLink key={item.href} {...item} active={isActive(item.href)} onClick={onClose} />
            ))}

            {debugItems.map((item) => {
              const show = item.href !== "/dashboard/translator" || enableTranslator;
              return show ? (
                <NavLink key={item.href} {...item} active={isActive(item.href)} onClick={onClose} />
              ) : null;
            })}

            <NavLink
              href="/dashboard/profile"
              label="Settings"
              icon="settings"
              active={isActive("/dashboard/profile")}
              onClick={onClose}
            />
          </div>
        </nav>
      </aside>

      {/* Update Confirmation Modal */}
      <ConfirmModal
        isOpen={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        onConfirm={handleUpdate}
        title="Update 9Router"
        message={`Show install command for v${updateInfo?.latestVersion || ""}? You can copy it and shutdown to install manually.`}
        confirmText="Show Command"
        cancelText="Cancel"
        variant="primary"
      />

      {/* Disconnected / Updating Overlay */}
      {(isDisconnected || isUpdating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-ink)]/80 p-6">
          {isUpdating ? (
            <ManualUpdatePanel
              latestVersion={updateInfo?.latestVersion}
              installCmd={INSTALL_CMD}
              copied={copied}
              onCopyAndShutdown={handleCopyAndShutdown}
              onCancel={handleCancelUpdate}
              countdown={shutdownCountdown}
              isDisconnected={isDisconnected}
            />
          ) : (
            <div className="text-center p-8 border border-[var(--color-hairline)] bg-[var(--color-surface-dark)] text-[var(--color-on-dark)]" style={{ maxWidth: "400px" }}>
              <p className="text-[16px] font-bold mb-2">[x] Server Disconnected</p>
              <p className="text-[14px] text-[var(--color-on-dark-mute)] mb-6">The proxy server has been stopped.</p>
              <Button variant="secondary" onClick={() => globalThis.location.reload()}>
                Reload Page
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

Sidebar.propTypes = {
  onClose: PropTypes.func,
};

function ManualUpdatePanel({ latestVersion, installCmd, copied, onCopyAndShutdown, onCancel, countdown, isDisconnected }) {
  const isCountingDown = countdown > 0;
  return (
    <div
      className="w-full border border-[var(--color-hairline)] bg-[var(--color-surface-dark)] text-[var(--color-on-dark)] p-6"
      style={{ maxWidth: "480px", fontFamily: "var(--font-mono)" }}
    >
      <p className="text-[16px] font-bold mb-1">
        Update 9Router{latestVersion ? ` to v${latestVersion}` : ""}
      </p>
      <p className="text-[14px] text-[var(--color-on-dark-mute)] mb-4">
        {isDisconnected
          ? "Server stopped. Paste the command into a terminal to install."
          : isCountingDown
            ? `Command copied. Server will stop in ${countdown}s...`
            : "Copy the install command and shutdown the server."}
      </p>

      <p className="text-[14px] text-[var(--color-on-dark-mute)] mb-1">Install command:</p>
      <div
        className="w-full px-3 py-2 mb-4 border border-[var(--color-hairline)]"
        style={{ background: "var(--color-surface-dark-elevated)", borderRadius: "4px" }}
      >
        <code className="text-[13px] text-[var(--color-warning)] break-all">{installCmd}</code>
      </div>

      <ol className="text-[13px] text-[var(--color-on-dark-mute)] space-y-1 mb-4 list-none">
        <li>[1] Click <strong>Copy & Shutdown</strong> below.</li>
        <li>[2] Paste the command into your terminal and press Enter.</li>
        <li>[3] Run <code className="px-1 text-[var(--color-success)]" style={{ borderRadius: "4px" }}>9router</code> again after install.</li>
      </ol>

      {isDisconnected ? (
        <Button variant="secondary" fullWidth onClick={() => globalThis.location.reload()}>
          Reload Page
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isCountingDown}
            className="border-[var(--color-hairline)] text-[var(--color-on-dark)] hover:bg-[var(--color-surface-dark-elevated)]">
            Cancel
          </Button>
          <Button variant="secondary" fullWidth onClick={onCopyAndShutdown} disabled={isCountingDown}
            className="bg-[var(--color-on-dark)] text-[var(--color-ink)] hover:bg-[var(--color-ash)]">
            {copied ? "✓ Copied — shutting down..." : isCountingDown ? `Shutting down in ${countdown}s` : "Copy & Shutdown"}
          </Button>
        </div>
      )}
    </div>
  );
}

ManualUpdatePanel.propTypes = {
  latestVersion: PropTypes.string,
  installCmd: PropTypes.string.isRequired,
  copied: PropTypes.bool,
  onCopyAndShutdown: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  countdown: PropTypes.number,
  isDisconnected: PropTypes.bool,
};
