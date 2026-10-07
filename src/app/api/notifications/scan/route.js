import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDashboardAuthSession } from "@/lib/auth/dashboardSession";
import { getUpdateInfo } from "@/lib/updateCheck";
import { getApiKeys } from "@/lib/db/repos/apiKeysRepo.js";
import { getErrorGroups } from "@/lib/db/repos/notifyConditionsRepo.js";
import { getSecurityEvents } from "@/lib/db/repos/securityLogRepo.js";
import { notify, clearNotificationByKind, clearStaleOfKind } from "@/lib/db/repos/notificationsRepo.js";

export const dynamic = "force-dynamic";

// GET /api/notifications/scan - derive conditions into notifications.
//
// A notification is written once per condition (dedupeKey), so this can run on
// every dashboard load without flooding the feed. Each condition also clears
// itself when it stops being true, so a resolved problem stops nagging and a
// relapse is announced again.

function quotaState(key) {
  const limit = Number(key.tokenLimit) || 0;
  const used = Number(key.usedTokens) || 0;
  if (!limit) return null;
  const pct = used / limit;
  if (pct >= 1) return { level: "critical", pct };
  if (pct >= 0.9) return { level: "warning", pct };
  return null;
}

// One fluke 400 is noise — a pattern of them is the signal.
const MIN_REPEATS = 3;

function errorSeverity(status) {
  const code = parseInt(status, 10);
  if (code >= 500 || code === 401 || code === 429) return "error";
  return "warning";
}

export async function GET() {
  // Bell button and the header call this. A key session gets nothing to derive
  // from: key names and quota pressure are admin-only facts.
  const cookieStore = await cookies();
  const session = await getDashboardAuthSession(cookieStore.get("auth_token")?.value);
  if (!session || session.role === "apikey") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const created = [];
  try {
    // --- update available ---
    const info = await getUpdateInfo();
    if (info.hasUpdate) {
      const dedupeKey = `update:${info.currentRevision || info.currentVersion}`;
      await notify({
        kind: "update",
        severity: "info",
        title: `Update available: ${info.latestVersion}`,
        body: info.commitMessage || info.releaseNotes?.[0] || "A newer release is on the repository.",
        link: "/dashboard/profile",
        dedupeKey,
      });
      created.push("update");
    } else {
      await clearNotificationByKind("update", `update:${info.currentRevision || info.currentVersion}`);
    }

    // --- key quota pressure ---
    const keys = await getApiKeys();
    const seen = new Set();
    for (const key of keys || []) {
      const state = quotaState(key);
      if (!state) continue;
      seen.add(key.id);
      const dedupeKey = `quota:${key.id}:${state.level}`;
      await notify({
        kind: "quota",
        severity: state.level === "critical" ? "error" : "warning",
        title:
          state.level === "critical"
            ? `Key "${key.name}" is out of tokens`
            : `Key "${key.name}" is at ${Math.round(state.pct * 100)}% of its token limit`,
        body: `${used(key.usedTokens)} of ${used(key.tokenLimit)} tokens used.`,
        link: "/dashboard/endpoint",
        dedupeKey,
      });
      created.push(`quota:${key.id}`);
    }
    // clear quotas that recovered (not in `seen`)
    for (const key of keys || []) {
      if (!seen.has(key.id)) {
        await clearNotificationByKind("quota", `quota:${key.id}:warning`);
        await clearNotificationByKind("quota", `quota:${key.id}:critical`);
      }
    }

    // --- failed requests, grouped ---
    // A window of a week, not a day: this is a "what has been failing on this
    // install" digest, and one bad afternoon should still be visible tomorrow.
    // A group has to repeat before it is worth a bell entry.
    const errorWindowMs = 7 * 24 * 60 * 60 * 1000;
    const errorGroups = await getErrorGroups(errorWindowMs);
    const errorSeen = new Set();
    for (const group of errorGroups) {
      if (group.count < MIN_REPEATS) continue;
      errorSeen.add(`errorgroup:${group.key}`);
      await notify({
        kind: "error",
        severity: errorSeverity(group.status),
        title: `${group.count}× ${group.status} from ${group.provider}`,
        body: `Last seen ${new Date(group.lastAt).toLocaleString()}.`,
        link: "/dashboard/error-inbox",
        dedupeKey: `errorgroup:${group.key}`,
      });
      created.push(`error:${group.key}`);
    }
    await clearStaleOfKind("error", errorSeen);

    // --- security signals ---
    // Only breach-grade events interrupt. Routine sign-ins stay in the log; the
    // bell is for things somebody should look at now.
    const securityWindowMs = 24 * 60 * 60 * 1000;
    const events = await getSecurityEvents({ limit: 200 });
    const cutoff = Date.now() - securityWindowMs;
    const securitySeen = new Set();
    for (const event of events) {
      if (new Date(event.at).getTime() < cutoff) continue;
      if (event.level === "info") continue;
      // One entry per (type, ip): a probe storm is one problem, not fifty.
      const key = `${event.type}|${event.ip}`;
      if (securitySeen.has(`security:${key}`)) continue;
      securitySeen.add(`security:${key}`);
      await notify({
        kind: "security",
        severity: event.level === "critical" ? "error" : "warning",
        title: event.label,
        body: `${event.ip}${event.detail ? ` — ${event.detail}` : ""}`,
        link: "/dashboard/security-log",
        dedupeKey: `security:${key}`,
      });
      created.push(`security:${key}`);
    }
    await clearStaleOfKind("security", securitySeen);
  } catch (error) {
    // Deriving conditions must never break the dashboard.
    console.warn("[notifications] scan failed:", error?.message || error);
  }

  return Response.json({ created, checkedAt: new Date().toISOString() });
}

function used(n) {
  return (Number(n) || 0).toLocaleString();
}