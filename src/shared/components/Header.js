"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import PropTypes from "prop-types";
import ProviderIcon from "@/shared/components/ProviderIcon";
import HeaderMenu from "@/shared/components/HeaderMenu";
import HeaderLanguage from "@/shared/components/HeaderLanguage";
import ThemeToggle from "@/shared/components/ThemeToggle";
import DonateModal from "@/shared/components/DonateModal";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";
import { translate } from "@/i18n/runtime";

const getPageInfo = (pathname) => {
  if (!pathname) return { title: "", description: "", breadcrumbs: [] };

  const mediaDetailMatch = pathname.match(/\/media-providers\/([^/]+)\/([^/]+)$/);
  if (mediaDetailMatch) {
    const kindId = mediaDetailMatch[1];
    const providerId = mediaDetailMatch[2];
    const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kindId);
    const provider = AI_PROVIDERS[providerId];
    return {
      title: provider?.name || providerId,
      description: "",
      breadcrumbs: [
        { label: "Media Providers", href: `/dashboard/media-providers/${kindId}` },
        { label: kindConfig?.label || kindId, href: `/dashboard/media-providers/${kindId}` },
        { label: provider?.name || providerId, image: getProviderIconSrc(providerId) },
      ],
    };
  }

  const mediaKindMatch = pathname.match(/\/media-providers\/([^/]+)$/);
  if (mediaKindMatch) {
    const kindId = mediaKindMatch[1];
    const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kindId);
    return {
      title: kindConfig?.label || kindId,
      description: `Manage your ${kindConfig?.label || kindId} providers`,
      icon: kindConfig?.icon || "perm_media",
      breadcrumbs: [],
    };
  }

  const providerMatch = pathname.match(/\/providers\/([^/]+)$/);
  if (providerMatch) {
    const providerId = providerMatch[1];
    const providerInfo = OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId];
    if (providerInfo) {
      return {
        title: providerInfo.name,
        description: "",
        breadcrumbs: [
          { label: "Providers", href: "/dashboard/providers" },
          { label: providerInfo.name, image: getProviderIconSrc(providerInfo.id) },
        ],
      };
    }
  }

  if (pathname.includes("/providers") && !pathname.includes("/media-providers"))
    return { title: "Providers", description: "Manage your AI provider connections", icon: "dns", breadcrumbs: [] };
  if (pathname.includes("/combos"))
    return { title: "Combos", description: "Model combos with fallback", icon: "layers", breadcrumbs: [] };
  if (pathname.includes("/usage"))
    return { title: "Usage & Analytics", description: "Monitor your API usage, token consumption, and request logs", icon: "bar_chart", breadcrumbs: [] };
  if (pathname.includes("/auth-files"))
    return { title: "Auth Files", description: "Map provider credentials stored in the local database", icon: "vpn_key", breadcrumbs: [] };
  if (pathname.includes("/quota"))
    return { title: "Quota Tracker", description: "Track and manage your API quota limits", icon: "data_usage", breadcrumbs: [] };
  if (pathname.includes("/mitm"))
    return { title: "MITM Proxy", description: "Intercept CLI tool traffic and route through 9Router", icon: "security", breadcrumbs: [] };
  if (pathname.includes("/token-saver"))
    return { title: "Token Saver", description: "Compress prompts and outputs to save tokens", icon: "savings", breadcrumbs: [] };
  if (pathname.includes("/cli-tools"))
    return { title: "CLI Tools", description: "Configure CLI tools", icon: "terminal", breadcrumbs: [] };
  if (pathname.includes("/proxy-pools"))
    return { title: "Proxy Pools", description: "Manage your proxy pool configurations", icon: "lan", breadcrumbs: [] };
  if (pathname.includes("/skills"))
    return { title: "Agent Skills", description: "Copy a link and paste to your AI to use 9Router — no install needed", icon: "extension", breadcrumbs: [] };
  if (pathname.includes("/endpoint"))
    return { title: "Endpoint", description: "API endpoint configuration", icon: "api", breadcrumbs: [] };
  if (pathname.includes("/profile"))
    return { title: "Settings", description: "Manage your preferences", icon: "settings", breadcrumbs: [] };
  if (pathname.includes("/translator"))
    return { title: "Translator", description: "Debug translation flow between formats", icon: "translate", breadcrumbs: [] };
  if (pathname.includes("/console-log"))
    return { title: "Console Log", description: "Live server console output", icon: "monitor", breadcrumbs: [] };
  if (pathname === "/dashboard")
    return { title: "Endpoint", description: "API endpoint configuration", icon: "api", breadcrumbs: [] };
  return { title: "", description: "", breadcrumbs: [] };
};

export default function Header({ onMenuClick, showMenuButton = true }) {
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState("");
  const [loginMethod, setLoginMethod] = useState("");
  const [donateOpen, setDonateOpen] = useState(false);

  const pageInfo = useMemo(() => getPageInfo(pathname), [pathname]);
  const { title, description, breadcrumbs } = pageInfo;

  useEffect(() => {
    let cancelled = false;
    async function loadAuthStatus() {
      try {
        const res = await fetch("/api/auth/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setDisplayName(data?.displayName || data?.samlName || data?.samlEmail || data?.oidcName || data?.oidcEmail || "");
          setLoginMethod(data?.loginMethod || "");
        }
      } catch {
        if (!cancelled) { setDisplayName(""); setLoginMethod(""); }
      }
    }
    loadAuthStatus();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) window.location.assign("/login");
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  return (
    <header
      className="shrink-0 flex items-center justify-between gap-3 px-4 lg:px-6 py-3 border-b border-[var(--color-hairline)] bg-[var(--color-canvas)] z-20"
      style={{ height: "56px", fontFamily: "var(--font-mono)" }}
    >
      {/* Mobile menu button */}
      <div className="flex items-center gap-3 lg:hidden shrink-0">
        {showMenuButton && (
          <button
            onClick={onMenuClick}
            className="text-[var(--color-mute)] hover:text-[var(--color-ink)] transition-colors text-[14px] font-medium"
          >
            [=]
          </button>
        )}
      </div>

      {/* Page title with breadcrumbs */}
      <div className="flex flex-col min-w-0 flex-1">
        {breadcrumbs.length > 0 ? (
          <div className="flex items-center gap-1.5 min-w-0">
            {breadcrumbs.map((crumb, index) => (
              <div
                key={`${crumb.label}-${crumb.href || "current"}`}
                className={`items-center gap-1 min-w-0 ${
                  index < breadcrumbs.length - 1 ? "hidden sm:flex shrink-0" : "flex flex-1"
                }`}
              >
                {index > 0 && (
                  <span className="text-[var(--color-ash)] text-[12px] hidden sm:inline px-0.5">/</span>
                )}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="text-[var(--color-mute)] hover:text-[var(--color-ink)] transition-colors text-[14px] underline truncate"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <div className="flex items-center gap-1.5 min-w-0">
                    {crumb.image && (
                      <ProviderIcon
                        src={crumb.image}
                        alt={crumb.label}
                        size={20}
                        className="object-contain shrink-0"
                        fallbackText={crumb.label.slice(0, 2).toUpperCase()}
                      />
                    )}
                    <h1 className="text-[16px] font-bold text-[var(--color-ink)] truncate">
                      {translate(crumb.label)}
                    </h1>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : title ? (
          <h1 className="text-[16px] font-bold text-[var(--color-ink)] truncate">
            {translate(title)}
          </h1>
        ) : null}
        {description && !breadcrumbs.length && (
          <p className="hidden lg:block text-[13px] text-[var(--color-mute)] truncate leading-tight">
            {translate(description)}
          </p>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 shrink-0">
        {displayName && (loginMethod === "OIDC" || loginMethod === "SAML") && (
          <div
            className="hidden sm:flex items-center max-w-[200px] px-2 py-1 border border-[var(--color-hairline)] text-[12px] text-[var(--color-mute)] truncate"
            style={{ borderRadius: "4px" }}
            title={displayName}
          >
            <span className="truncate">{displayName}</span>
            <span className="ml-2 shrink-0 text-[10px] font-bold text-[var(--color-ash)]">
              [{loginMethod}]
            </span>
          </div>
        )}
        <HeaderSearch />
        <button
          onClick={() => setDonateOpen(true)}
          className="hidden sm:flex items-center gap-1.5 px-3 h-8 border border-[var(--color-hairline)] text-[var(--color-mute)] hover:text-[var(--color-ink)] hover:border-[var(--color-hairline-strong)] transition-colors text-[13px] font-medium"
          style={{ borderRadius: "4px" }}
          aria-label="Donate"
        >
          <span className="material-symbols-outlined text-[16px]">volunteer_activism</span>
          <span className="hidden sm:inline">Donate</span>
        </button>
        <ThemeToggle />
        <HeaderLanguage />
        <HeaderMenu onLogout={handleLogout} />
      </div>
      <DonateModal isOpen={donateOpen} onClose={() => setDonateOpen(false)} />
    </header>
  );
}

function HeaderSearch() {
  const visible = useHeaderSearchStore((s) => s.visible);
  const query = useHeaderSearchStore((s) => s.query);
  const placeholder = useHeaderSearchStore((s) => s.placeholder);
  const setQuery = useHeaderSearchStore((s) => s.setQuery);

  if (!visible) return null;

  return (
    <div className="relative w-[120px] sm:w-[200px]">
      <span className="text-[var(--color-ash)] text-[13px] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none font-mono">
        /
      </span>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full h-8 pl-6 pr-7 border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] text-[13px] text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-hairline-strong)] transition-colors"
        style={{ borderRadius: "4px", fontFamily: "var(--font-mono)" }}
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-ash)] hover:text-[var(--color-ink)] text-[13px]"
          aria-label="Clear search"
        >
          [x]
        </button>
      )}
    </div>
  );
}

Header.propTypes = {
  onMenuClick: PropTypes.func,
  showMenuButton: PropTypes.bool,
};
