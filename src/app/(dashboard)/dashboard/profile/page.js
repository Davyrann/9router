"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Card, Button, Toggle, Input, Select, CardSkeleton } from "@/shared/components";
import Modal, { ConfirmModal } from "@/shared/components/Modal";
import LanguageSwitcher from "@/shared/components/LanguageSwitcher";
import { useTheme } from "@/shared/hooks/useTheme";
import { useTimezone, listTimeZones } from "@/shared/hooks/useTimezone";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG } from "@/shared/constants/config";
import { LOCALE_COOKIE, normalizeLocale, LOCALE_NAMES } from "@/i18n/config";
import { LOCALE_FLAGS } from "@/shared/constants/locales";

function getLocaleFromCookie() {
  if (typeof document === "undefined") return "en";
  const cookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
  const value = cookie ? decodeURIComponent(cookie.split("=")[1]) : "en";
  return normalizeLocale(value);
}

// Select placeholder uses value="" (disabled), so "Browser default" needs a
// non-empty sentinel to stay selectable.
const TZ_BROWSER = "browser";

// Telegram backup interval is stored as minutes; show the largest whole unit.
function minutesToUnit(minutes) {
  const m = Math.max(1, Number(minutes) || 1440);
  if (m % 1440 === 0) return { intervalValue: m / 1440, intervalUnit: "days" };
  if (m % 60 === 0) return { intervalValue: m / 60, intervalUnit: "hours" };
  return { intervalValue: m, intervalUnit: "minutes" };
}

const INTERVAL_UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 };

// Next scheduled run, derived from the last run + the configured interval.
function nextRunFrom(data) {
  const lastRun = data?.telegramBackupLastRunAt ? Date.parse(data.telegramBackupLastRunAt) : 0;
  if (!lastRun) return "";
  const intervalMs = Math.max(1, Number(data?.telegramBackupIntervalMinutes) || 1440) * 60000;
  return new Date(lastRun + intervalMs).toISOString();
}

function telegramFormFromSettings(data) {
  return {
    enabled: data?.telegramBackupEnabled === true,
    botToken: "",
    chatId: data?.telegramBackupChatId || "",
    ...minutesToUnit(data?.telegramBackupIntervalMinutes),
  };
}

export default function ProfilePage() {
  const { theme, setTheme } = useTheme();
  const { timeZone, setTimeZone } = useTimezone();
  const [locale, setLocale] = useState(() => getLocaleFromCookie());
  const [langOpen, setLangOpen] = useState(false);
  const [shutdownOpen, setShutdownOpen] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [settings, setSettings] = useState({ fallbackStrategy: "fill-first" });
  const [loading, setLoading] = useState(true);
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [passStatus, setPassStatus] = useState({ type: "", message: "" });
  const [passLoading, setPassLoading] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState({ type: "", message: "" });
  const [dbAuth, setDbAuth] = useState({ open: false, mode: "", password: "" });
  const pendingImportRef = useRef(null);
  const [tgForm, setTgForm] = useState({ enabled: false, botToken: "", chatId: "", intervalValue: 1, intervalUnit: "days" });
  const [tgStatus, setTgStatus] = useState({ type: "", message: "" });
  const [tgLoading, setTgLoading] = useState(false);
  const [tgInfo, setTgInfo] = useState({ configured: false, hasToken: false, lastRunAt: "", lastStatus: "", nextRunAt: "" });
  const [oidcForm, setOidcForm] = useState({
    authMode: "password",
    oidcIssuerUrl: "",
    oidcClientId: "",
    oidcScopes: "openid profile email",
    oidcLoginLabel: "Sign in with OIDC",
  });
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [oidcStatus, setOidcStatus] = useState({ type: "", message: "" });
  const [oidcLoading, setOidcLoading] = useState(false);
  const [oidcTestLoading, setOidcTestLoading] = useState(false);
  const [oidcTestStatus, setOidcTestStatus] = useState({ type: "", message: "" });
  const [oidcExpanded, setOidcExpanded] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const oidcRedirectUri = origin ? `${origin}/api/auth/oidc/callback` : "/api/auth/oidc/callback";
  const samlAcsUrl = origin ? `${origin}/api/auth/saml/acs` : "/api/auth/saml/acs";
  const samlMetadataUrl = origin ? `${origin}/api/auth/saml/metadata` : "/api/auth/saml/metadata";

  // SAML State
  const [ssoTypeTab, setSsoTypeTab] = useState("saml");
  const [samlForm, setSamlForm] = useState({
    samlEntryPoint: "",
    samlIssuer: "urn:9router:sp",
    samlCert: "",
    samlLoginLabel: "Sign in with SAML SSO",
    samlAttributeEmail: "email",
    samlAttributeName: "name",
  });
  const [samlStatus, setSamlStatus] = useState({ type: "", message: "" });
  const [samlLoading, setSamlLoading] = useState(false);
  const [samlTestLoading, setSamlTestLoading] = useState(false);
  const [samlTestStatus, setSamlTestStatus] = useState({ type: "", message: "" });
  const [showSamlGuide, setShowSamlGuide] = useState(false);
  const idpMetadataFileRef = useRef(null);
  const certFileRef = useRef(null);

  const importFileRef = useRef(null);
  const [proxyForm, setProxyForm] = useState({
    outboundProxyEnabled: false,
    outboundProxyUrl: "",
    outboundNoProxy: "",
  });
  const [proxyStatus, setProxyStatus] = useState({ type: "", message: "" });
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyTestLoading, setProxyTestLoading] = useState(false);

  const [isRemoteHost, setIsRemoteHost] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (typeof window !== "undefined") {
        setIsRemoteHost(!["localhost", "127.0.0.1", "::1"].includes(window.location.hostname));
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Timezone options + live preview clock (tick state so preview recomputes each second)
  const tzOptions = useMemo(
    () => [
      { value: TZ_BROWSER, label: "Browser default" },
      ...listTimeZones().map((z) => ({ value: z, label: z.replace(/_/g, " ") })),
    ],
    []
  );
  const [tzTick, setTzTick] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setTzTick(1), 0);
    const id = setInterval(() => setTzTick((n) => n + 1), 1000);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, []);
  const tzPreview = useMemo(
    () =>
      tzTick === 0
        ? "" // server + first client render: stable placeholder, avoids hydration mismatch
        : new Date().toLocaleString("en-GB", {
            dateStyle: "medium",
            timeStyle: "medium",
            ...(timeZone ? { timeZone } : {}),
          }),
    [timeZone, tzTick]
  );

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setOidcForm({
          authMode: data?.authMode || "password",
          oidcIssuerUrl: data?.oidcIssuerUrl || "",
          oidcClientId: data?.oidcClientId || "",
          oidcScopes: data?.oidcScopes || "openid profile email",
          oidcLoginLabel: data?.oidcLoginLabel || "Sign in with OIDC",
        });
        setOidcClientSecret("");
        setSsoTypeTab(data?.ssoType || "saml");
        setSamlForm({
          samlEntryPoint: data?.samlEntryPoint || "",
          samlIssuer: data?.samlIssuer || "urn:9router:sp",
          samlCert: data?.samlCert || "",
          samlLoginLabel: data?.samlLoginLabel || "Sign in with SAML SSO",
          samlAttributeEmail: data?.samlAttributeEmail || "email",
          samlAttributeName: data?.samlAttributeName || "name",
        });
        if (
          data?.authMode === "sso" ||
          data?.authMode === "saml" ||
          data?.authMode === "oidc" ||
          data?.authMode === "both"
        ) {
          setOidcExpanded(true);
        }
        setProxyForm({
          outboundProxyEnabled: data?.outboundProxyEnabled === true,
          outboundProxyUrl: data?.outboundProxyUrl || "",
          outboundNoProxy: data?.outboundNoProxy || "",
        });
        setTgForm(telegramFormFromSettings(data));
        setTgInfo((prev) => ({
          ...prev,
          hasToken: data?.telegramBackupBotTokenConfigured === true,
          configured: data?.telegramBackupBotTokenConfigured === true && !!data?.telegramBackupChatId,
          lastRunAt: data?.telegramBackupLastRunAt || "",
          lastStatus: data?.telegramBackupLastStatus || "",
          nextRunAt: nextRunFrom(data),
        }));
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch settings:", err);
        setLoading(false);
      });
  }, []);

  const updateOutboundProxy = async (e) => {
    e.preventDefault();
    if (settings.outboundProxyEnabled !== true) return;
    setProxyLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outboundProxyUrl: proxyForm.outboundProxyUrl,
          outboundNoProxy: proxyForm.outboundNoProxy,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setProxyStatus({ type: "success", message: "Proxy settings applied" });
      } else {
        setProxyStatus({ type: "error", message: data.error || "Failed to update proxy settings" });
      }
    } catch {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyLoading(false);
    }
  };

  const testOutboundProxy = async () => {
    if (settings.outboundProxyEnabled !== true) return;

    const proxyUrl = (proxyForm.outboundProxyUrl || "").trim();
    if (!proxyUrl) {
      setProxyStatus({ type: "error", message: "Please enter a Proxy URL to test" });
      return;
    }

    setProxyTestLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings/proxy-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyUrl }),
      });

      const data = await res.json();
      if (res.ok && data?.ok) {
        setProxyStatus({
          type: "success",
          message: `Proxy test OK (${data.status}) in ${data.elapsedMs}ms`,
        });
      } else {
        setProxyStatus({
          type: "error",
          message: data?.error || "Proxy test failed",
        });
      }
    } catch {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyTestLoading(false);
    }
  };

  const updateOutboundProxyEnabled = async (outboundProxyEnabled) => {
    setProxyLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outboundProxyEnabled }),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setProxyForm((prev) => ({ ...prev, outboundProxyEnabled: data?.outboundProxyEnabled === true }));
        setProxyStatus({
          type: "success",
          message: outboundProxyEnabled ? "Proxy enabled" : "Proxy disabled",
        });
      } else {
        setProxyStatus({ type: "error", message: data.error || "Failed to update proxy settings" });
      }
    } catch {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setPassStatus({ type: "error", message: "Passwords do not match" });
      return;
    }

    setPassLoading(true);
    setPassStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwords.current,
          newPassword: passwords.new,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setPassStatus({ type: "success", message: "Password updated successfully" });
        setPasswords({ current: "", new: "", confirm: "" });
      } else {
        setPassStatus({ type: "error", message: data.error || "Failed to update password" });
      }
    } catch {
      setPassStatus({ type: "error", message: "An error occurred" });
    } finally {
      setPassLoading(false);
    }
  };

  const updateFallbackStrategy = async (strategy) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fallbackStrategy: strategy }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, fallbackStrategy: strategy }));
      }
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  };

  const updateComboStrategy = async (strategy) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboStrategy: strategy }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, comboStrategy: strategy }));
      }
    } catch (err) {
      console.error("Failed to update combo strategy:", err);
    }
  };

  const updateStickyLimit = async (limit) => {
    const numLimit = parseInt(limit, 10);
    if (isNaN(numLimit) || numLimit < 1) return;

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stickyRoundRobinLimit: numLimit }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, stickyRoundRobinLimit: numLimit }));
      }
    } catch (err) {
      console.error("Failed to update sticky limit:", err);
    }
  };

  const updateComboStickyLimit = async (limit) => {
    const numLimit = parseInt(limit, 10);
    if (isNaN(numLimit) || numLimit < 1) return;

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboStickyRoundRobinLimit: numLimit }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, comboStickyRoundRobinLimit: numLimit }));
      }
    } catch (err) {
      console.error("Failed to update combo sticky limit:", err);
    }
  };

  const updateRequireLogin = async (requireLogin) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireLogin }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, requireLogin }));
      }
    } catch (err) {
      console.error("Failed to update require login:", err);
    }
  };

  const updateOidcForm = (field, value) => {
    setOidcForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveOidcSettings = async (authMode = oidcForm.authMode || "password") => {
    const issuerUrl = oidcForm.oidcIssuerUrl.trim();
    const clientId = oidcForm.oidcClientId.trim();
    const scopes = oidcForm.oidcScopes.trim();
    const loginLabel = oidcForm.oidcLoginLabel.trim();
    const secret = oidcClientSecret.trim();

    if (authMode !== "password" && (!issuerUrl || !clientId || !secret) && !settings.oidcConfigured) {
      setOidcStatus({ type: "error", message: "Issuer URL, client ID, and client secret are required to enable OIDC." });
      return;
    }

    setOidcLoading(true);
    setOidcStatus({ type: "", message: "" });
    setOidcTestStatus({ type: "", message: "" });

    try {
      const payload = {
        authMode,
        ssoType: "oidc",
        oidcIssuerUrl: issuerUrl,
        oidcClientId: clientId,
        oidcScopes: scopes || "openid profile email",
        oidcLoginLabel: loginLabel || "Sign in with OIDC",
      };
      if (secret) {
        payload.oidcClientSecret = secret;
      }

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setOidcForm({
          authMode: data?.authMode || authMode,
          oidcIssuerUrl: data?.oidcIssuerUrl || issuerUrl,
          oidcClientId: data?.oidcClientId || clientId,
          oidcScopes: data?.oidcScopes || scopes || "openid profile email",
          oidcLoginLabel: data?.oidcLoginLabel || loginLabel || "Sign in with OIDC",
        });
        setOidcClientSecret("");
        setOidcStatus({
          type: "success",
          message:
            authMode === "oidc"
              ? "OIDC login enabled"
              : authMode === "both"
                ? "Password and OIDC login enabled"
                : "OIDC settings saved",
        });
      } else {
        setOidcStatus({ type: "error", message: data.error || "Failed to save OIDC settings" });
      }
    } catch {
      setOidcStatus({ type: "error", message: "An error occurred" });
    } finally {
      setOidcLoading(false);
    }
  };

  const testOidcConnection = async () => {
    const issuerUrl = oidcForm.oidcIssuerUrl.trim();
    const clientId = oidcForm.oidcClientId.trim();
    const scopes = oidcForm.oidcScopes.trim();
    const secret = oidcClientSecret.trim();

    if (!issuerUrl || !clientId) {
      setOidcTestStatus({ type: "error", message: "Issuer URL and client ID are required to test the connection." });
      return;
    }

    setOidcTestLoading(true);
    setOidcStatus({ type: "", message: "" });
    setOidcTestStatus({ type: "", message: "" });

    try {
      const saveRes = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authMode: oidcForm.authMode || settings.authMode || "password",
          oidcIssuerUrl: issuerUrl,
          oidcClientId: clientId,
          oidcScopes: scopes || "openid profile email",
          oidcLoginLabel: oidcForm.oidcLoginLabel.trim() || "Sign in with OIDC",
          ...(secret ? { oidcClientSecret: secret } : {}),
        }),
      });

      const saved = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) {
        setOidcTestStatus({
          type: "error",
          message: saved.error || "Failed to save OIDC settings before testing",
        });
        return;
      }

      const res = await fetch("/api/auth/oidc/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerUrl: saved.oidcIssuerUrl || issuerUrl,
          clientId: saved.oidcClientId || clientId,
          scopes: saved.oidcScopes || scopes || "openid profile email",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        const statusMessage = data.clientSecretTested
          ? data.clientSecretValid === true
            ? `Connection OK. Discovery loaded from ${data.issuerUrl}. Client secret validated too.`
            : `Connection OK. Discovery loaded from ${data.issuerUrl}. Client secret was not checked.`
          : `Connection OK. Discovery loaded from ${data.issuerUrl}.`;
        setOidcTestStatus({
          type: "success",
          message: statusMessage,
        });
      } else {
        setOidcTestStatus({ type: "error", message: data.error || "OIDC connection test failed" });
      }
    } catch {
      setOidcTestStatus({ type: "error", message: "An error occurred" });
    } finally {
      setOidcTestLoading(false);
    }
  };

  const updateSamlForm = (field, value) => {
    setSamlForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleIdpMetadataUpload = (event) => {
    const file = event.target.files?.[0];
    if (idpMetadataFileRef.current) idpMetadataFileRef.current.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const xmlText = e.target?.result || "";
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, "text/xml");
        const parserError = doc.querySelector("parsererror");
        if (parserError) {
          setSamlStatus({ type: "error", message: "Unable to parse valid SAML IdP metadata from XML file" });
          return;
        }

        const entityID = doc.documentElement.getAttribute("entityID") || "";
        const ssoNodes = Array.from(doc.querySelectorAll("SingleSignOnService, *|SingleSignOnService"));
        let ssoUrl = "";
        for (const node of ssoNodes) {
          const binding = node.getAttribute("Binding") || "";
          const location = node.getAttribute("Location") || "";
          if (location) {
            ssoUrl = location;
            if (binding.includes("HTTP-Redirect")) break;
          }
        }

        const certNodes = Array.from(doc.querySelectorAll("X509Certificate, *|X509Certificate"));
        let certStr = "";
        if (certNodes.length > 0) {
          certStr = certNodes[0].textContent.trim();
        }

        setSamlForm((prev) => ({
          ...prev,
          samlEntryPoint: ssoUrl || prev.samlEntryPoint,
          samlIssuer: prev.samlIssuer || "urn:9router:sp",
          samlCert: certStr || prev.samlCert,
        }));

        setSamlStatus({
          type: "success",
          message: `IdP Metadata imported! (SSO URL: ${ssoUrl ? "found" : "not found"}, EntityID: ${entityID ? "found" : "not found"}, Cert: ${certStr ? "found" : "not found"})`,
        });
      } catch {
        setSamlStatus({ type: "error", message: "Error reading IdP Metadata XML file" });
      }
    };
    reader.readAsText(file);
  };

  const handleCertFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (certFileRef.current) certFileRef.current.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result || "";
      setSamlForm((prev) => ({ ...prev, samlCert: text.trim() }));
      setSamlStatus({ type: "success", message: "Certificate file loaded into configuration." });
    };
    reader.readAsText(file);
  };

  const saveSamlSettings = async (targetAuthMode = oidcForm.authMode || "password") => {
    setSamlLoading(true);
    setSamlStatus({ type: "", message: "" });
    setSamlTestStatus({ type: "", message: "" });

    try {
      const payload = {
        authMode: targetAuthMode,
        ssoType: "saml",
        samlEntryPoint: samlForm.samlEntryPoint.trim(),
        samlIssuer: samlForm.samlIssuer.trim() || "urn:9router:sp",
        samlCert: samlForm.samlCert.trim(),
        samlLoginLabel: samlForm.samlLoginLabel.trim() || "Sign in with SAML SSO",
        samlAttributeEmail: samlForm.samlAttributeEmail.trim() || "email",
        samlAttributeName: samlForm.samlAttributeName.trim() || "name",
      };

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setSamlForm({
          samlEntryPoint: data?.samlEntryPoint || payload.samlEntryPoint,
          samlIssuer: data?.samlIssuer || payload.samlIssuer,
          samlCert: data?.samlCert || payload.samlCert,
          samlLoginLabel: data?.samlLoginLabel || payload.samlLoginLabel,
          samlAttributeEmail: data?.samlAttributeEmail || payload.samlAttributeEmail,
          samlAttributeName: data?.samlAttributeName || payload.samlAttributeName,
        });
        setSamlStatus({
          type: "success",
          message:
            targetAuthMode === "sso" || targetAuthMode === "saml"
              ? "SAML SSO login enabled"
              : targetAuthMode === "both"
                ? "Password and SAML SSO login enabled"
                : "SAML 2.0 settings saved",
        });
      } else {
        setSamlStatus({ type: "error", message: data.error || "Failed to save SAML settings" });
      }
    } catch {
      setSamlStatus({ type: "error", message: "An error occurred while saving SAML settings" });
    } finally {
      setSamlLoading(false);
    }
  };

  const testSamlConnection = async () => {
    setSamlTestLoading(true);
    setSamlStatus({ type: "", message: "" });
    setSamlTestStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/auth/saml/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          samlEntryPoint: samlForm.samlEntryPoint.trim(),
          samlIssuer: samlForm.samlIssuer.trim(),
          samlCert: samlForm.samlCert.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setSamlTestStatus({ type: "success", message: data.message || "SAML configuration verified!" });
      } else {
        setSamlTestStatus({ type: "error", message: data.error || "SAML configuration test failed" });
      }
    } catch {
      setSamlTestStatus({ type: "error", message: "An error occurred while testing SAML configuration" });
    } finally {
      setSamlTestLoading(false);
    }
  };

  const updateObservabilityEnabled = async (enabled) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enableObservability: enabled }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, enableObservability: enabled }));
      }
    } catch (err) {
      console.error("Failed to update enableObservability:", err);
    }
  };

  const reloadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error("Failed to reload settings:", err);
    }
  };

  const refreshTelegramStatus = async () => {
    try {
      const res = await fetch("/api/settings/backup");
      if (!res.ok) return;
      const data = await res.json();
      setTgInfo((prev) => ({
        ...prev,
        configured: data?.configured === true,
        hasToken: data?.hasToken === true,
        lastRunAt: data?.lastRunAt || "",
        lastStatus: data?.lastStatus || "",
        nextRunAt: data?.nextRunAt || "",
      }));
    } catch (err) {
      console.error("Failed to load backup status:", err);
    }
  };

  const saveTelegramBackup = async (e) => {
    e.preventDefault();
    setTgLoading(true);
    setTgStatus({ type: "", message: "" });
    try {
      const factor = INTERVAL_UNIT_MINUTES[tgForm.intervalUnit] || 1440;
      const intervalMinutes = Math.max(1, Math.round((Number(tgForm.intervalValue) || 1) * factor));
      const body = {
        telegramBackupEnabled: tgForm.enabled === true,
        telegramBackupChatId: tgForm.chatId.trim(),
        telegramBackupIntervalMinutes: intervalMinutes,
      };
      if (tgForm.botToken.trim()) body.telegramBackupBotToken = tgForm.botToken.trim();

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setTgForm((prev) => ({ ...prev, botToken: "" }));
        setTgStatus({ type: "success", message: "Telegram backup settings saved" });
        refreshTelegramStatus();
      } else {
        setTgStatus({ type: "error", message: data.error || "Failed to save Telegram backup settings" });
      }
    } catch {
      setTgStatus({ type: "error", message: "An error occurred" });
    } finally {
      setTgLoading(false);
    }
  };

  const runTelegramAction = async (action, password) => {
    setTgLoading(true);
    setTgStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-9r-password": password },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send backup");
      setTgStatus({ type: "success", message: action === "test" ? "Test message sent" : "Backup sent to Telegram" });
      refreshTelegramStatus();
    } catch (err) {
      setTgStatus({ type: "error", message: err.message || "Failed to send backup" });
    } finally {
      setTgLoading(false);
    }
  };

  const handleExportDatabase = async (password) => {
    setDbLoading(true);
    setDbStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings/database", {
        headers: { "x-9r-password": password },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to export database");
      }

      const payload = await res.json();
      const content = JSON.stringify(payload, null, 2);
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[.:]/g, "-");
      anchor.href = url;
      anchor.download = `9router-backup-${stamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setDbStatus({ type: "success", message: "Database backup downloaded" });
    } catch (err) {
      setDbStatus({ type: "error", message: err.message || "Failed to export database" });
    } finally {
      setDbLoading(false);
    }
  };

  const handleImportDatabase = (event) => {
    const file = event.target.files?.[0];
    if (importFileRef.current) importFileRef.current.value = "";
    if (!file) return;
    pendingImportRef.current = file;
    setDbStatus({ type: "", message: "" });
    setDbAuth({ open: true, mode: "import", password: "" });
  };

  const runImportDatabase = async (password) => {
    const file = pendingImportRef.current;
    if (!file) return;
    setDbLoading(true);
    try {
      const raw = await file.text();
      const payload = JSON.parse(raw);

      const res = await fetch("/api/settings/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to import database");
      }

      await reloadSettings();
      setDbStatus({ type: "success", message: "Database imported successfully" });
    } catch (err) {
      setDbStatus({ type: "error", message: err.message || "Invalid backup file" });
    } finally {
      pendingImportRef.current = null;
      setDbLoading(false);
    }
  };

  // Confirm password modal, then run export or import.
  const handleDbAuthConfirm = async () => {
    const { mode, password } = dbAuth;
    setDbAuth({ open: false, mode: "", password: "" });
    if (mode === "export") await handleExportDatabase(password);
    else if (mode === "import") await runImportDatabase(password);
    else if (mode === "telegram") await runTelegramAction("backup", password);
    else if (mode === "telegram-test") await runTelegramAction("test", password);
  };

  const observabilityEnabled = settings.enableObservability === true;

  const handleShutdown = async () => {
    setIsShuttingDown(true);
    try {
      await fetch("/api/version/shutdown", { method: "POST" });
    } catch {
      // Expected to fail as server shuts down; ignore error
    }
    setIsShuttingDown(false);
    setShutdownOpen(false);
  };

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        window.location.assign("/login");
      }
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto px-3 py-4 sm:px-6 sm:py-6 flex flex-col gap-4 sm:gap-6 font-mono text-[var(--color-ink)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-[var(--color-hairline)]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-ink)] text-sm font-bold">[&gt;]</span>
              <h1 className="text-base sm:text-lg font-bold uppercase tracking-tight">System Settings</h1>
            </div>
            <p className="text-xs text-[var(--color-mute)] mt-0.5">
              Runtime configuration, persistence, fallback policies &amp; authentication.
            </p>
          </div>
        </div>
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-3 py-4 sm:px-6 sm:py-6 flex flex-col gap-4 sm:gap-6 font-mono text-[var(--color-ink)]">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-[var(--color-hairline)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--color-ink)] text-sm font-bold">[&gt;]</span>
            <h1 className="text-base sm:text-lg font-bold uppercase tracking-tight">System Settings</h1>
          </div>
          <p className="text-xs text-[var(--color-mute)] mt-0.5">
            Runtime configuration, persistence, fallback policies &amp; authentication.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] text-xs text-[var(--color-mute)] w-fit rounded-[4px]">
          <span className="text-[var(--color-success)] font-bold">[o]</span>
          <span>GATEWAY ACTIVE</span>
        </div>
      </div>

      {/* Local Mode / System Info */}
      <Card className="rounded-none border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 shadow-none flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-[var(--color-ink)] font-bold">[o]</span>
            <div>
              <h2 className="text-sm sm:text-base font-bold uppercase">Local Mode</h2>
              <p className="text-xs text-[var(--color-mute)]">Host runtime &amp; storage interface</p>
            </div>
          </div>

          {/* Theme switcher with touch targets */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] rounded-[4px] w-full sm:w-auto">
            {["light", "dark", "system"].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTheme(option)}
                className={cn(
                  "min-h-[38px] px-3 py-1.5 rounded-[4px] text-xs font-mono font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5",
                  theme === option
                    ? "bg-[var(--color-canvas)] text-[var(--color-ink)] border border-[var(--color-hairline-strong)] font-bold"
                    : "text-[var(--color-mute)] hover:text-[var(--color-ink)] border border-transparent"
                )}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {option === "light" ? "light_mode" : option === "dark" ? "dark_mode" : "contrast"}
                </span>
                <span className="capitalize">{option}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-3 border-t border-[var(--color-hairline)]">
          <div className="p-3 bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] rounded-none flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--color-mute)]">Database Path</p>
              <p className="text-xs sm:text-sm font-mono break-all text-[var(--color-ink)] mt-0.5">
                ~/.9router/db/data.sqlite
              </p>
            </div>
            <span className="text-[11px] text-[var(--color-mute)] border border-[var(--color-hairline)] px-2 py-0.5 rounded-[4px] bg-[var(--color-canvas)] w-fit">
              SQLite (WAL)
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <Button
              variant="secondary"
              icon="download"
              onClick={() => setDbAuth({ open: true, mode: "export", password: "" })}
              loading={dbLoading}
              className="w-full sm:w-auto min-h-[38px] rounded-[4px] font-mono text-xs sm:text-sm"
            >
              Download Backup
            </Button>
            <Button
              variant="outline"
              icon="upload"
              onClick={() => importFileRef.current?.click()}
              disabled={dbLoading}
              className="w-full sm:w-auto min-h-[38px] rounded-[4px] font-mono text-xs sm:text-sm"
            >
              Import Backup
            </Button>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportDatabase}
            />
          </div>

          {dbStatus.message && (
            <p className={cn(
              "text-xs sm:text-sm font-mono p-2.5 border rounded-[4px]",
              dbStatus.type === "error"
                ? "bg-[rgba(255,59,48,0.06)] border-[var(--color-danger)] text-[var(--color-danger)]"
                : "bg-[rgba(48,209,88,0.06)] border-[var(--color-success)] text-[var(--color-success)]"
            )}>
              {dbStatus.type === "error" ? "[x] " : "[+] "}
              {dbStatus.message}
            </p>
          )}
        </div>
      </Card>

      {/* Telegram Auto Backup */}
      <Card className="rounded-none border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 shadow-none flex flex-col gap-4">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-[var(--color-ink)] font-bold">[+]</span>
            <div>
              <h3 className="text-sm sm:text-base font-bold uppercase">Telegram Auto Backup</h3>
              <p className="text-xs text-[var(--color-mute)]">
                Scheduled snapshot dispatch to custom Telegram chat
              </p>
            </div>
          </div>
          <Toggle
            checked={tgForm.enabled === true}
            onChange={() => setTgForm((prev) => ({ ...prev, enabled: !prev.enabled }))}
            disabled={loading || tgLoading}
          />
        </div>

        <form onSubmit={saveTelegramBackup} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase text-[var(--color-ink)]">Bot Token</label>
            <Input
              type="password"
              placeholder={tgInfo.hasToken ? "Leave blank to keep existing token" : "123456:ABC-DEF..."}
              value={tgForm.botToken}
              onChange={(e) => setTgForm((prev) => ({ ...prev, botToken: e.target.value }))}
              disabled={loading || tgLoading}
              className="w-full"
            />
            <p className="text-[11px] text-[var(--color-mute)]">
              Write-only after saving. Create via @BotFather.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase text-[var(--color-ink)]">Chat ID</label>
            <Input
              placeholder="123456789 or -1001234567890"
              value={tgForm.chatId}
              onChange={(e) => setTgForm((prev) => ({ ...prev, chatId: e.target.value }))}
              disabled={loading || tgLoading}
              className="w-full"
            />
            <p className="text-[11px] text-[var(--color-mute)]">
              Send message to @userinfobot to inspect your chat ID.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase text-[var(--color-ink)]">Interval</label>
              <Input
                type="number"
                min="1"
                value={tgForm.intervalValue}
                onChange={(e) => setTgForm((prev) => ({ ...prev, intervalValue: e.target.value }))}
                disabled={loading || tgLoading}
                className="w-full"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Select
                label="Unit"
                value={tgForm.intervalUnit}
                onChange={(e) => setTgForm((prev) => ({ ...prev, intervalUnit: e.target.value }))}
                options={[
                  { value: "minutes", label: "Minutes" },
                  { value: "hours", label: "Hours" },
                  { value: "days", label: "Days" },
                ]}
                disabled={loading || tgLoading}
              />
            </div>
          </div>

          <div className="p-3 bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] rounded-none text-xs text-[var(--color-body)] flex flex-col gap-2">
            <p className="text-[11px] text-[var(--color-mute)]">
              Backup includes settings, providers, keys, combos, aliases, pricing, and aggregate usage totals. Per-request history excluded.
            </p>
            <p className="text-[11px] text-[var(--color-ink)] font-semibold border-t border-[var(--color-hairline)] pt-2">
              [!] NOTICE: Backup contains provider credentials (OAuth tokens, API keys) uploaded to Telegram. Password, OIDC secret, and bot token are stripped. Use a private chat.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-[var(--color-hairline)]">
            <Button
              type="submit"
              variant="primary"
              loading={tgLoading}
              className="w-full sm:w-auto min-h-[38px] rounded-[4px] font-mono text-xs sm:text-sm"
            >
              Save Configuration
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={loading || tgLoading || !tgInfo.configured}
              onClick={() => setDbAuth({ open: true, mode: "telegram-test", password: "" })}
              className="w-full sm:w-auto min-h-[38px] rounded-[4px] font-mono text-xs sm:text-sm"
            >
              Send Test
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading || tgLoading || !tgInfo.configured}
              onClick={() => setDbAuth({ open: true, mode: "telegram", password: "" })}
              className="w-full sm:w-auto min-h-[38px] rounded-[4px] font-mono text-xs sm:text-sm"
            >
              Backup Now
            </Button>
          </div>

          {(tgStatus.message || tgInfo.lastRunAt) && (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--color-hairline)] text-xs font-mono">
              {tgStatus.message && (
                <p className={cn(
                  "p-2.5 border rounded-[4px]",
                  tgStatus.type === "error"
                    ? "bg-[rgba(255,59,48,0.06)] border-[var(--color-danger)] text-[var(--color-danger)]"
                    : "bg-[rgba(48,209,88,0.06)] border-[var(--color-success)] text-[var(--color-success)]"
                )}>
                  {tgStatus.type === "error" ? "[x] " : "[+] "}
                  {tgStatus.message}
                </p>
              )}
              {tgInfo.lastRunAt && (
                <p className="text-[var(--color-mute)]">
                  Last run: {new Date(tgInfo.lastRunAt).toLocaleString()} — {tgInfo.lastStatus || "—"}
                </p>
              )}
              {tgInfo.nextRunAt && (
                <p className="text-[var(--color-mute)]">
                  Next scheduled: {new Date(tgInfo.nextRunAt).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </form>
      </Card>

      {/* Language */}
      <Card className="rounded-none border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 shadow-none flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-[var(--color-ink)] font-bold">[+]</span>
          <div>
            <h3 className="text-sm sm:text-base font-bold uppercase">Language</h3>
            <p className="text-xs text-[var(--color-mute)]">Interface localization &amp; translations</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setLangOpen(true)}
          className="flex items-center justify-between w-full min-h-[44px] p-3 rounded-[4px] bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)] transition-colors cursor-pointer text-left"
        >
          <div className="flex items-center gap-2.5" data-i18n-skip="true">
            <span className="text-xl leading-none">{LOCALE_FLAGS[locale] || "🌐"}</span>
            <span className="text-xs sm:text-sm font-bold font-mono text-[var(--color-ink)]">
              {LOCALE_NAMES[locale] || locale}
            </span>
          </div>
          <span className="text-xs font-mono text-[var(--color-mute)] border border-[var(--color-hairline)] px-2.5 py-1 rounded-[4px] bg-[var(--color-canvas)]">
            Change [&gt;]
          </span>
        </button>
      </Card>

      {/* Time Zone */}
      <Card className="rounded-none border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 shadow-none flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-[var(--color-ink)] font-bold">[+]</span>
          <div>
            <h3 className="text-sm sm:text-base font-bold uppercase">Time Zone</h3>
            <p className="text-xs text-[var(--color-mute)]">
              Timestamp offset override for audit logs, usage metrics &amp; quota windows
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Select
            label="Display Time Zone"
            value={timeZone || TZ_BROWSER}
            onChange={(e) => setTimeZone(e.target.value === TZ_BROWSER ? "" : e.target.value)}
            options={tzOptions}
            hint="Browser default automatically tracks your current device time zone."
          />
          <div className="flex items-center justify-between p-3 rounded-none bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] text-xs sm:text-sm">
            <span className="text-[var(--color-mute)] uppercase font-medium">Local Clock</span>
            <span className="font-mono font-bold text-[var(--color-ink)]">{tzPreview || "—"}</span>
          </div>
        </div>
      </Card>

      {/* Security */}
      <Card className="rounded-none border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 shadow-none flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-[var(--color-ink)] font-bold">[+]</span>
          <h3 className="text-sm sm:text-base font-bold uppercase">Security &amp; Authentication</h3>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-xs sm:text-sm uppercase text-[var(--color-ink)]">Require Login</p>
              <p className="text-xs text-[var(--color-mute)] mt-0.5">
                When active, dashboard requires authentication. When disabled, open access.
              </p>
            </div>
            <Toggle
              checked={settings.requireLogin === true}
              onChange={() => updateRequireLogin(!settings.requireLogin)}
              disabled={loading}
            />
          </div>

          {settings.requireLogin === true && (
            <form onSubmit={handlePasswordChange} className="flex flex-col gap-3.5 pt-3 border-t border-[var(--color-hairline)]">
              {settings.hasPassword && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase text-[var(--color-ink)]">Current Password</label>
                  <Input
                    type="password"
                    placeholder="Enter current password"
                    value={passwords.current}
                    onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                    required
                    className="w-full"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase text-[var(--color-ink)]">New Password</label>
                  <Input
                    type="password"
                    placeholder="Enter new password"
                    value={passwords.new}
                    onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                    required
                    className="w-full"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase text-[var(--color-ink)]">Confirm Password</label>
                  <Input
                    type="password"
                    placeholder="Confirm new password"
                    value={passwords.confirm}
                    onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                    required
                    className="w-full"
                  />
                </div>
              </div>

              {passStatus.message && (
                <p className={cn(
                  "text-xs sm:text-sm font-mono p-2.5 border rounded-[4px]",
                  passStatus.type === "error"
                    ? "bg-[rgba(255,59,48,0.06)] border-[var(--color-danger)] text-[var(--color-danger)]"
                    : "bg-[rgba(48,209,88,0.06)] border-[var(--color-success)] text-[var(--color-success)]"
                )}>
                  {passStatus.type === "error" ? "[x] " : "[+] "}
                  {passStatus.message}
                </p>
              )}

              <div className="pt-1">
                <Button
                  type="submit"
                  variant="primary"
                  loading={passLoading}
                  className="w-full sm:w-auto min-h-[38px] rounded-[4px] font-mono text-xs sm:text-sm"
                >
                  {settings.hasPassword ? "Update Password" : "Set Password"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>

      {/* Single Sign-On (SSO) */}
      <Card className="rounded-none border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 shadow-none flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setOidcExpanded((v) => !v)}
          className="w-full flex items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-[var(--color-ink)] font-bold">[+]</span>
            <div>
              <h3 className="text-sm sm:text-base font-bold uppercase">Single Sign-On (SSO)</h3>
              <p className="text-xs text-[var(--color-mute)] mt-0.5">
                {settings.authMode === "sso" || settings.authMode === "oidc" || settings.authMode === "saml"
                  ? `[o] ${settings.ssoType === "saml" ? "SAML 2.0" : "OIDC"} SSO active`
                  : settings.authMode === "both"
                    ? `[o] Password + ${settings.ssoType === "saml" ? "SAML 2.0" : "OIDC"} active`
                    : "[-] Enterprise federation via Okta, Entra ID, Keycloak, or OIDC"}
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-[var(--color-mute)] border border-[var(--color-hairline)] px-2 py-1 rounded-[4px] bg-[var(--color-surface-soft)]">
            {oidcExpanded ? "[-] Collapse" : "[+] Configure"}
          </span>
        </button>

        {oidcExpanded && (
          <div className="flex flex-col gap-4 pt-3 border-t border-[var(--color-hairline)]">
            <p className="text-xs text-[var(--color-mute)]">
              Configure enterprise Single Sign-On (SSO) for dashboard access using SAML 2.0 or OIDC.
            </p>

            {/* SSO Protocol Switcher */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase text-[var(--color-ink)]">SSO Protocol</label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] rounded-[4px]">
                <button
                  type="button"
                  onClick={() => setSsoTypeTab("saml")}
                  className={cn(
                    "min-h-[38px] px-3 py-1.5 rounded-[4px] text-xs font-mono font-medium transition-colors cursor-pointer text-center",
                    ssoTypeTab === "saml"
                      ? "bg-[var(--color-canvas)] text-[var(--color-ink)] border border-[var(--color-hairline-strong)] font-bold"
                      : "text-[var(--color-mute)] hover:text-[var(--color-ink)] border border-transparent"
                  )}
                >
                  SAML 2.0
                </button>
                <button
                  type="button"
                  onClick={() => setSsoTypeTab("oidc")}
                  className={cn(
                    "min-h-[38px] px-3 py-1.5 rounded-[4px] text-xs font-mono font-medium transition-colors cursor-pointer text-center",
                    ssoTypeTab === "oidc"
                      ? "bg-[var(--color-canvas)] text-[var(--color-ink)] border border-[var(--color-hairline-strong)] font-bold"
                      : "text-[var(--color-mute)] hover:text-[var(--color-ink)] border border-transparent"
                  )}
                >
                  OIDC
                </button>
              </div>
            </div>

            {/* Auth Mode selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase text-[var(--color-ink)]">Auth Mode</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  {
                    value: "password",
                    title: "Password only",
                    desc: "Keep legacy password login.",
                  },
                  {
                    value: "sso",
                    title: `${ssoTypeTab === "saml" ? "SAML" : "OIDC"} only`,
                    desc: "Require SSO for dashboard access.",
                  },
                  {
                    value: "both",
                    title: "Both",
                    desc: "Allow password or SSO login.",
                  },
                ].map((option) => {
                  const currentMode = oidcForm.authMode;
                  const active =
                    option.value === "password"
                      ? currentMode === "password"
                      : option.value === "sso"
                        ? currentMode === "sso" || currentMode === "saml" || currentMode === "oidc"
                        : currentMode === "both";
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateOidcForm("authMode", option.value)}
                      className={cn(
                        "text-left rounded-[4px] border p-3 transition-colors cursor-pointer min-h-[44px]",
                        active
                          ? "border-[var(--color-ink)] bg-[var(--color-surface-card)] font-bold text-[var(--color-ink)]"
                          : "border-[var(--color-hairline)] bg-[var(--color-surface-soft)] hover:border-[var(--color-hairline-strong)] text-[var(--color-mute)]"
                      )}
                      disabled={loading || oidcLoading || samlLoading}
                    >
                      <p className="text-xs sm:text-sm uppercase font-bold text-[var(--color-ink)]">
                        {active ? "[o] " : "[-] "}
                        {option.title}
                      </p>
                      <p className="text-[11px] text-[var(--color-mute)] mt-1 font-normal">{option.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {ssoTypeTab === "saml" ? (
              /* SAML Configuration Panel */
              <div className="flex flex-col gap-3.5 pt-2 border-t border-[var(--color-hairline)]">
                {/* IdP Setup Guidelines */}
                <div className="rounded-none border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowSamlGuide((prev) => !prev)}
                    className="w-full p-3 flex items-center justify-between gap-2 text-left hover:bg-[var(--color-surface-card)] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--color-ink)]">[?]</span>
                      <div>
                        <p className="font-bold text-xs sm:text-sm text-[var(--color-ink)] uppercase">
                          IdP Setup Guidelines &amp; Provider Instructions
                        </p>
                        <p className="text-[11px] text-[var(--color-mute)]">
                          AWS IAM Identity Center, Okta, Microsoft Entra ID, Keycloak, Authentik
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-[var(--color-mute)]">
                      {showSamlGuide ? "[-] Hide" : "[+] View"}
                    </span>
                  </button>

                  {showSamlGuide && (
                    <div className="p-3.5 border-t border-[var(--color-hairline)] bg-[var(--color-canvas)] text-xs text-[var(--color-ink)] flex flex-col gap-3">
                      <div className="p-2.5 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] text-xs">
                        <p className="font-bold uppercase text-[11px] mb-1.5 text-[var(--color-ink)]">
                          Service Provider (SP) Metadata Values:
                        </p>
                        <ul className="space-y-1 font-mono text-[11px] text-[var(--color-body)]">
                          <li>
                            <b>ACS URL:</b>{" "}
                            <code className="bg-[var(--color-canvas)] px-1 py-0.5 border border-[var(--color-hairline)] break-all rounded-[2px]">{samlAcsUrl}</code>
                          </li>
                          <li>
                            <b>Audience URI (Entity ID):</b>{" "}
                            <code className="bg-[var(--color-canvas)] px-1 py-0.5 border border-[var(--color-hairline)] break-all rounded-[2px]">{samlForm.samlIssuer || "urn:9router:sp"}</code>
                          </li>
                          <li>
                            <b>NameID Format:</b>{" "}
                            <code className="bg-[var(--color-canvas)] px-1 py-0.5 border border-[var(--color-hairline)] rounded-[2px]">EmailAddress</code> or <code className="bg-[var(--color-canvas)] px-1 py-0.5 border border-[var(--color-hairline)] rounded-[2px]">Unspecified</code>
                          </li>
                        </ul>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                        <div className="p-3 rounded-none border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] flex flex-col gap-1.5">
                          <p className="font-bold text-[11px] uppercase text-[var(--color-ink)]">&gt; AWS IAM Identity Center</p>
                          <ol className="list-decimal pl-4 text-[11px] text-[var(--color-mute)] space-y-1">
                            <li>Applications &rarr; Add application &rarr; Add custom SAML 2.0 app.</li>
                            <li>Set Application ACS URL to <code className="text-[var(--color-ink)]">{samlAcsUrl}</code>.</li>
                            <li>Set Application SAML audience to <code className="text-[var(--color-ink)]">{samlForm.samlIssuer || "urn:9router:sp"}</code>.</li>
                            <li>Map Subject or email to <code className="text-[var(--color-ink)]">${`{user:email}`}</code>.</li>
                            <li>Download metadata XML and use 1-Click Import below.</li>
                          </ol>
                        </div>

                        <div className="p-3 rounded-none border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] flex flex-col gap-1.5">
                          <p className="font-bold text-[11px] uppercase text-[var(--color-ink)]">&gt; Microsoft Entra ID</p>
                          <ol className="list-decimal pl-4 text-[11px] text-[var(--color-mute)] space-y-1">
                            <li>Enterprise Apps &rarr; New app &rarr; Create your own application.</li>
                            <li>Single sign-on &rarr; SAML.</li>
                            <li>Entity ID: <code className="text-[var(--color-ink)]">{samlForm.samlIssuer || "urn:9router:sp"}</code></li>
                            <li>Reply URL (ACS): <code className="text-[var(--color-ink)]">{samlAcsUrl}</code></li>
                            <li>Download Federation Metadata XML or export X.509 Cert.</li>
                          </ol>
                        </div>

                        <div className="p-3 rounded-none border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] flex flex-col gap-1.5">
                          <p className="font-bold text-[11px] uppercase text-[var(--color-ink)]">&gt; Okta / Auth0</p>
                          <ol className="list-decimal pl-4 text-[11px] text-[var(--color-mute)] space-y-1">
                            <li>Applications &rarr; Create App Integration &rarr; SAML 2.0.</li>
                            <li>SSO URL: <code className="text-[var(--color-ink)]">{samlAcsUrl}</code></li>
                            <li>Audience URI: <code className="text-[var(--color-ink)]">{samlForm.samlIssuer || "urn:9router:sp"}</code></li>
                            <li>Name ID format: EmailAddress.</li>
                            <li>Download IdP metadata XML or copy X.509 cert.</li>
                          </ol>
                        </div>

                        <div className="p-3 rounded-none border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] flex flex-col gap-1.5">
                          <p className="font-bold text-[11px] uppercase text-[var(--color-ink)]">&gt; Keycloak / Authentik</p>
                          <ol className="list-decimal pl-4 text-[11px] text-[var(--color-mute)] space-y-1">
                            <li>Clients &rarr; Create client &rarr; SAML protocol.</li>
                            <li>Client ID: <code className="text-[var(--color-ink)]">{samlForm.samlIssuer || "urn:9router:sp"}</code></li>
                            <li>Master SAML Processing URL: <code className="text-[var(--color-ink)]">{samlAcsUrl}</code></li>
                            <li>Export SAML descriptor XML or copy Certificate PEM.</li>
                          </ol>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick Import Card */}
                <div className="p-3 rounded-[4px] border border-dashed border-[var(--color-hairline-strong)] bg-[var(--color-surface-soft)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-xs uppercase text-[var(--color-ink)]">1-Click IdP Metadata XML Import</p>
                    <p className="text-[11px] text-[var(--color-mute)]">Auto-populate SSO URL, Issuer &amp; Certificate</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    icon="upload_file"
                    onClick={() => idpMetadataFileRef.current?.click()}
                    className="w-full sm:w-auto min-h-[36px] rounded-[4px] font-mono text-xs"
                  >
                    Upload Metadata XML
                  </Button>
                  <input
                    ref={idpMetadataFileRef}
                    type="file"
                    accept=".xml,application/xml,text/xml"
                    className="hidden"
                    onChange={handleIdpMetadataUpload}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-xs font-bold uppercase text-[var(--color-ink)]">
                      Single Sign-On Service URL (samlEntryPoint)
                    </label>
                    <Input
                      placeholder="https://idp.example.com/app/saml/sso/..."
                      value={samlForm.samlEntryPoint}
                      onChange={(e) => updateSamlForm("samlEntryPoint", e.target.value)}
                      disabled={loading || samlLoading}
                      className="w-full"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-xs font-bold uppercase text-[var(--color-ink)]">
                      SP Entity ID / Audience (samlIssuer)
                    </label>
                    <Input
                      placeholder="urn:9router:sp"
                      value={samlForm.samlIssuer}
                      onChange={(e) => updateSamlForm("samlIssuer", e.target.value)}
                      disabled={loading || samlLoading}
                      className="w-full"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold uppercase text-[var(--color-ink)]">
                        IdP X.509 Certificate (samlCert)
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        icon="file_upload"
                        onClick={() => certFileRef.current?.click()}
                        className="rounded-[4px] font-mono"
                      >
                        Upload Cert
                      </Button>
                      <input
                        ref={certFileRef}
                        type="file"
                        accept=".crt,.pem,.cer,text/plain"
                        className="hidden"
                        onChange={handleCertFileUpload}
                      />
                    </div>
                    <textarea
                      rows={4}
                      placeholder="-----BEGIN CERTIFICATE-----&#10;MIIC...&#10;-----END CERTIFICATE-----"
                      value={samlForm.samlCert}
                      onChange={(e) => updateSamlForm("samlCert", e.target.value)}
                      className="w-full p-2.5 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] text-xs font-mono text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-hairline-strong)]"
                      disabled={loading || samlLoading}
                    />
                    <p className="text-[11px] text-[var(--color-mute)]">Paste raw Base64 certificate or PEM block.</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase text-[var(--color-ink)]">Login Button Label</label>
                    <Input
                      placeholder="Sign in with SAML SSO"
                      value={samlForm.samlLoginLabel}
                      onChange={(e) => updateSamlForm("samlLoginLabel", e.target.value)}
                      disabled={loading || samlLoading}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase text-[var(--color-ink)]">Email Claim Attribute</label>
                    <Input
                      placeholder="email"
                      value={samlForm.samlAttributeEmail}
                      onChange={(e) => updateSamlForm("samlAttributeEmail", e.target.value)}
                      disabled={loading || samlLoading}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-xs font-bold uppercase text-[var(--color-ink)]">Display Name Claim</label>
                    <Input
                      placeholder="name"
                      value={samlForm.samlAttributeName}
                      onChange={(e) => updateSamlForm("samlAttributeName", e.target.value)}
                      disabled={loading || samlLoading}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 p-3 rounded-none border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] text-xs text-[var(--color-mute)]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold uppercase text-[11px] text-[var(--color-ink)]">ACS Callback URL</p>
                      <code className="block break-all font-mono text-xs text-[var(--color-body)] mt-0.5">{samlAcsUrl}</code>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      icon="content_copy"
                      onClick={() => {
                        navigator.clipboard.writeText(samlAcsUrl);
                        setSamlStatus({ type: "success", message: "ACS URL copied to clipboard!" });
                      }}
                      className="w-full sm:w-auto min-h-[36px] rounded-[4px] font-mono text-xs"
                    >
                      Copy
                    </Button>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[var(--color-hairline)]">
                    <div className="min-w-0">
                      <p className="font-bold uppercase text-[11px] text-[var(--color-ink)]">SP XML Metadata</p>
                      <code className="block break-all font-mono text-xs text-[var(--color-body)] mt-0.5">{samlMetadataUrl}</code>
                    </div>
                    <a
                      href={samlMetadataUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download="9router-sp-metadata.xml"
                      className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-xs font-mono font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)] rounded-[4px] transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">download</span>
                      Download XML
                    </a>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-[var(--color-hairline)]">
                  <Button
                    type="button"
                    variant="primary"
                    loading={samlLoading}
                    onClick={() => saveSamlSettings(oidcForm.authMode)}
                    className="w-full sm:w-auto min-h-[38px] rounded-[4px] font-mono text-xs sm:text-sm"
                  >
                    Save SAML Settings
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    loading={samlTestLoading}
                    onClick={testSamlConnection}
                    className="w-full sm:w-auto min-h-[38px] rounded-[4px] font-mono text-xs sm:text-sm"
                  >
                    Test SAML Connection
                  </Button>
                </div>

                {samlTestStatus.message && (
                  <p className={cn(
                    "text-xs sm:text-sm font-mono p-2.5 border rounded-[4px]",
                    samlTestStatus.type === "error"
                      ? "bg-[rgba(255,59,48,0.06)] border-[var(--color-danger)] text-[var(--color-danger)]"
                      : "bg-[rgba(48,209,88,0.06)] border-[var(--color-success)] text-[var(--color-success)]"
                  )}>
                    {samlTestStatus.type === "error" ? "[x] " : "[+] "}
                    {samlTestStatus.message}
                  </p>
                )}

                {samlStatus.message && (
                  <p className={cn(
                    "text-xs sm:text-sm font-mono p-2.5 border rounded-[4px]",
                    samlStatus.type === "error"
                      ? "bg-[rgba(255,59,48,0.06)] border-[var(--color-danger)] text-[var(--color-danger)]"
                      : "bg-[rgba(48,209,88,0.06)] border-[var(--color-success)] text-[var(--color-success)]"
                  )}>
                    {samlStatus.type === "error" ? "[x] " : "[+] "}
                    {samlStatus.message}
                  </p>
                )}
              </div>
            ) : (
              /* OIDC Panel */
              <div className="flex flex-col gap-3.5 pt-2 border-t border-[var(--color-hairline)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-xs font-bold uppercase text-[var(--color-ink)]">Issuer URL</label>
                    <Input
                      placeholder="https://auth.example.com/application/o/9router/"
                      value={oidcForm.oidcIssuerUrl}
                      onChange={(e) => updateOidcForm("oidcIssuerUrl", e.target.value)}
                      disabled={loading || oidcLoading}
                      className="w-full"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase text-[var(--color-ink)]">Client ID</label>
                    <Input
                      placeholder="9router-dashboard"
                      value={oidcForm.oidcClientId}
                      onChange={(e) => updateOidcForm("oidcClientId", e.target.value)}
                      disabled={loading || oidcLoading}
                      className="w-full"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase text-[var(--color-ink)]">Client Secret</label>
                    <Input
                      type="password"
                      placeholder="Leave blank to keep existing secret"
                      value={oidcClientSecret}
                      onChange={(e) => setOidcClientSecret(e.target.value)}
                      disabled={loading || oidcLoading}
                      className="w-full"
                    />
                    <p className="text-[11px] text-[var(--color-mute)]">Write-only after saving.</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase text-[var(--color-ink)]">Scopes</label>
                    <Input
                      placeholder="openid profile email"
                      value={oidcForm.oidcScopes}
                      onChange={(e) => updateOidcForm("oidcScopes", e.target.value)}
                      disabled={loading || oidcLoading}
                      className="w-full"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase text-[var(--color-ink)]">Login Button Label</label>
                    <Input
                      placeholder="Sign in with OIDC"
                      value={oidcForm.oidcLoginLabel}
                      onChange={(e) => updateOidcForm("oidcLoginLabel", e.target.value)}
                      disabled={loading || oidcLoading}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="rounded-none border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] p-3 text-xs text-[var(--color-mute)]">
                  <p className="font-bold uppercase text-[11px] text-[var(--color-ink)] mb-1">Redirect URI</p>
                  <code className="block break-all font-mono text-xs text-[var(--color-body)]">{oidcRedirectUri}</code>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-[var(--color-hairline)]">
                  <Button
                    type="button"
                    variant="primary"
                    loading={oidcLoading}
                    onClick={() => saveOidcSettings()}
                    className="w-full sm:w-auto min-h-[38px] rounded-[4px] font-mono text-xs sm:text-sm"
                  >
                    Save OIDC Settings
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    loading={oidcTestLoading}
                    onClick={testOidcConnection}
                    className="w-full sm:w-auto min-h-[38px] rounded-[4px] font-mono text-xs sm:text-sm"
                  >
                    Test Connection
                  </Button>
                </div>

                {oidcTestStatus.message && (
                  <p className={cn(
                    "text-xs sm:text-sm font-mono p-2.5 border rounded-[4px]",
                    oidcTestStatus.type === "error"
                      ? "bg-[rgba(255,59,48,0.06)] border-[var(--color-danger)] text-[var(--color-danger)]"
                      : "bg-[rgba(48,209,88,0.06)] border-[var(--color-success)] text-[var(--color-success)]"
                  )}>
                    {oidcTestStatus.type === "error" ? "[x] " : "[+] "}
                    {oidcTestStatus.message}
                  </p>
                )}

                {oidcStatus.message && (
                  <p className={cn(
                    "text-xs sm:text-sm font-mono p-2.5 border rounded-[4px]",
                    oidcStatus.type === "error"
                      ? "bg-[rgba(255,59,48,0.06)] border-[var(--color-danger)] text-[var(--color-danger)]"
                      : "bg-[rgba(48,209,88,0.06)] border-[var(--color-success)] text-[var(--color-success)]"
                  )}>
                    {oidcStatus.type === "error" ? "[x] " : "[+] "}
                    {oidcStatus.message}
                  </p>
                )}
              </div>
            )}

            {settings.authMode === "oidc" || settings.authMode === "saml" || settings.authMode === "sso" ? (
              <p className="text-xs font-mono p-2.5 bg-[var(--color-surface-soft)] border border-[var(--color-hairline-strong)] text-[var(--color-ink)]">
                [!] SSO login ({settings.ssoType === "saml" ? "SAML 2.0" : "OIDC"}) active. Password authentication disabled until switched.
              </p>
            ) : null}

            {settings.authMode === "both" && (
              <p className="text-xs font-mono p-2.5 bg-[var(--color-surface-soft)] border border-[var(--color-hairline-strong)] text-[var(--color-ink)]">
                [i] Dual login active: both password and {settings.ssoType === "saml" ? "SAML 2.0" : "OIDC"} SSO permitted.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Routing Preferences */}
      <Card className="rounded-none border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 shadow-none flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-[var(--color-ink)] font-bold">[+]</span>
          <h3 className="text-sm sm:text-base font-bold uppercase">Routing Strategy &amp; Dispatch</h3>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-xs sm:text-sm uppercase text-[var(--color-ink)]">Round Robin</p>
              <p className="text-xs text-[var(--color-mute)] mt-0.5">
                Cycle through provider accounts to distribute traffic load evenly
              </p>
            </div>
            <Toggle
              checked={settings.fallbackStrategy === "round-robin"}
              onChange={() => updateFallbackStrategy(settings.fallbackStrategy === "round-robin" ? "fill-first" : "round-robin")}
              disabled={loading}
            />
          </div>

          {/* Sticky Round Robin Limit */}
          {settings.fallbackStrategy === "round-robin" && (
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--color-hairline)]">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-xs sm:text-sm uppercase text-[var(--color-ink)]">Account Sticky Limit</p>
                <p className="text-xs text-[var(--color-mute)] mt-0.5">
                  Sequential calls per account before advancing
                </p>
              </div>
              <Input
                type="number"
                min="1"
                max="10"
                value={settings.stickyRoundRobinLimit || 3}
                onChange={(e) => updateStickyLimit(e.target.value)}
                disabled={loading}
                className="w-20 text-center shrink-0"
              />
            </div>
          )}

          {/* Combo Round Robin */}
          <div className="flex items-start sm:items-center justify-between gap-3 pt-3 border-t border-[var(--color-hairline)]">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-xs sm:text-sm uppercase text-[var(--color-ink)]">Combo Round Robin</p>
              <p className="text-xs text-[var(--color-mute)] mt-0.5">
                Rotate through combo targets rather than restarting at first model
              </p>
            </div>
            <Toggle
              checked={settings.comboStrategy === "round-robin"}
              onChange={() => updateComboStrategy(settings.comboStrategy === "round-robin" ? "fallback" : "round-robin")}
              disabled={loading}
            />
          </div>

          {/* Combo Sticky Round Robin Limit */}
          {settings.comboStrategy === "round-robin" && (
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--color-hairline)]">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-xs sm:text-sm uppercase text-[var(--color-ink)]">Combo Sticky Limit</p>
                <p className="text-xs text-[var(--color-mute)] mt-0.5">
                  Sequential calls per combo model before rotation
                </p>
              </div>
              <Input
                type="number"
                min="1"
                max="100"
                value={settings.comboStickyRoundRobinLimit || 1}
                onChange={(e) => updateComboStickyLimit(e.target.value)}
                disabled={loading}
                className="w-20 text-center shrink-0"
              />
            </div>
          )}

          <div className="p-3 bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] rounded-none text-xs text-[var(--color-mute)] font-mono">
            &gt;{" "}
            {settings.fallbackStrategy === "round-robin"
              ? `Distributing across accounts with ${settings.stickyRoundRobinLimit || 3} calls/account.`
              : "Strict priority fallback: primary account until rate limited (Fill First)."}
            {settings.comboStrategy === "round-robin"
              ? ` Combos rotate after ${settings.comboStickyRoundRobinLimit || 1} call${(settings.comboStickyRoundRobinLimit || 1) === 1 ? "" : "s"}.`
              : " Combos always evaluate from primary candidate."}
          </div>
        </div>
      </Card>

      {/* Network / Outbound Proxy */}
      <Card className="rounded-none border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 shadow-none flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-[var(--color-ink)] font-bold">[+]</span>
          <h3 className="text-sm sm:text-base font-bold uppercase">Network &amp; Outbound Proxy</h3>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-xs sm:text-sm uppercase text-[var(--color-ink)]">Outbound Proxy</p>
              <p className="text-xs text-[var(--color-mute)] mt-0.5">
                Route provider egress &amp; OAuth refreshes through an HTTP/HTTPS/SOCKS5 proxy
              </p>
            </div>
            <Toggle
              checked={settings.outboundProxyEnabled === true}
              onChange={() => updateOutboundProxyEnabled(!(settings.outboundProxyEnabled === true))}
              disabled={loading || proxyLoading}
            />
          </div>

          {settings.outboundProxyEnabled === true && (
            <form onSubmit={updateOutboundProxy} className="flex flex-col gap-3.5 pt-3 border-t border-[var(--color-hairline)]">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase text-[var(--color-ink)]">Proxy URL</label>
                <Input
                  placeholder="http://127.0.0.1:7897"
                  value={proxyForm.outboundProxyUrl}
                  onChange={(e) => setProxyForm((prev) => ({ ...prev, outboundProxyUrl: e.target.value }))}
                  disabled={loading || proxyLoading}
                  className="w-full"
                />
                <p className="text-[11px] text-[var(--color-mute)]">Leave empty to inherit system HTTP_PROXY environment.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase text-[var(--color-ink)]">No Proxy</label>
                <Input
                  placeholder="localhost,127.0.0.1"
                  value={proxyForm.outboundNoProxy}
                  onChange={(e) => setProxyForm((prev) => ({ ...prev, outboundNoProxy: e.target.value }))}
                  disabled={loading || proxyLoading}
                  className="w-full"
                />
                <p className="text-[11px] text-[var(--color-mute)]">Comma-separated hostnames/domains to bypass proxy.</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-[var(--color-hairline)]">
                <Button
                  type="button"
                  variant="secondary"
                  loading={proxyTestLoading}
                  disabled={loading || proxyLoading}
                  onClick={testOutboundProxy}
                  className="w-full sm:w-auto min-h-[38px] rounded-[4px] font-mono text-xs sm:text-sm"
                >
                  Test Proxy URL
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={proxyLoading}
                  className="w-full sm:w-auto min-h-[38px] rounded-[4px] font-mono text-xs sm:text-sm"
                >
                  Apply Settings
                </Button>
              </div>
            </form>
          )}

          {proxyStatus.message && (
            <p className={cn(
              "text-xs sm:text-sm font-mono p-2.5 border rounded-[4px]",
              proxyStatus.type === "error"
                ? "bg-[rgba(255,59,48,0.06)] border-[var(--color-danger)] text-[var(--color-danger)]"
                : "bg-[rgba(48,209,88,0.06)] border-[var(--color-success)] text-[var(--color-success)]"
            )}>
              {proxyStatus.type === "error" ? "[x] " : "[+] "}
              {proxyStatus.message}
            </p>
          )}
        </div>
      </Card>

      {/* Observability */}
      <Card className="rounded-none border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3.5 sm:p-5 shadow-none flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-[var(--color-ink)] font-bold">[+]</span>
          <h3 className="text-sm sm:text-base font-bold uppercase">Observability &amp; Traces</h3>
        </div>
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-xs sm:text-sm uppercase text-[var(--color-ink)]">Enable Observability</p>
            <p className="text-xs text-[var(--color-mute)] mt-0.5">
              Record full request headers, payload previews &amp; upstream timing into SQLite log table
            </p>
          </div>
          <Toggle
            checked={observabilityEnabled}
            onChange={updateObservabilityEnabled}
            disabled={loading}
          />
        </div>
      </Card>

      {/* Account Actions */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <Button
          variant="outline"
          fullWidth
          icon="power_settings_new"
          onClick={() => setShutdownOpen(true)}
          className="min-h-[44px] rounded-[4px] font-mono text-xs sm:text-sm border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white transition-colors"
        >
          [!] Shutdown Gateway
        </Button>
        <Button
          variant="outline"
          fullWidth
          icon="logout"
          onClick={handleLogout}
          className="min-h-[44px] rounded-[4px] font-mono text-xs sm:text-sm border-[var(--color-hairline-strong)] text-[var(--color-ink)] hover:bg-[var(--color-surface-card)] transition-colors"
        >
          [-&gt;] Terminate Session
        </Button>
      </div>

      {/* System Footer Info */}
      <div className="text-center text-xs font-mono text-[var(--color-mute)] py-4 flex flex-col gap-1 border-t border-[var(--color-hairline)]">
        <p className="text-[var(--color-ink)] font-bold">
          {APP_CONFIG.name} v{APP_CONFIG.version}
        </p>
        <p>
          {isRemoteHost ? "[o] REMOTE_MODE (NETWORK DAEMON)" : "[o] LOCAL_MODE (LOOPBACK_HOST)"}
        </p>
      </div>

      {/* Modals */}
      <LanguageSwitcher
        hideTrigger
        isOpen={langOpen}
        onClose={(next) => {
          setLangOpen(false);
          setLocale(next);
        }}
      />
      <ConfirmModal
        isOpen={shutdownOpen}
        onClose={() => setShutdownOpen(false)}
        onConfirm={handleShutdown}
        title="Shutdown Gateway"
        message="Terminate 9Router proxy process on this machine? Active connections will be dropped."
        confirmText="Shutdown"
        cancelText="Cancel"
        variant="danger"
        loading={isShuttingDown}
      />

      <Modal
        isOpen={dbAuth.open}
        onClose={() => setDbAuth({ open: false, mode: "", password: "" })}
        title="Authentication Required"
        size="sm"
        footer={
          <div className="flex flex-col sm:flex-row sm:justify-end gap-2 w-full">
            <Button
              variant="ghost"
              onClick={() => setDbAuth({ open: false, mode: "", password: "" })}
              disabled={dbLoading}
              className="w-full sm:w-auto min-h-[38px] rounded-[4px] font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleDbAuthConfirm}
              loading={dbLoading}
              disabled={!dbAuth.password}
              className="w-full sm:w-auto min-h-[38px] rounded-[4px] font-mono text-xs"
            >
              Verify &amp; Execute
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 font-mono">
          <p className="text-xs text-[var(--color-mute)]">
            Enter administrative password to authorize{" "}
            <span className="font-bold text-[var(--color-ink)]">
              {dbAuth.mode === "export"
                ? "database export"
                : dbAuth.mode === "import"
                  ? "database restore"
                  : dbAuth.mode === "telegram-test"
                    ? "Telegram test message"
                    : "Telegram backup dispatch"}
            </span>
            :
          </p>
          <Input
            type="password"
            value={dbAuth.password}
            onChange={(e) => setDbAuth((s) => ({ ...s, password: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dbAuth.password) handleDbAuthConfirm();
            }}
            placeholder="Admin password"
            autoFocus
            className="w-full"
          />
        </div>
      </Modal>
    </div>
  );
}
