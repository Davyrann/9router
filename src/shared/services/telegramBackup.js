// Auto-backup scheduler: exports the full DB (same payload as the manual
// Download Backup) and sends it as a document to the owner's Telegram chat.
// Schedule state (lastSentAt) persists in the autoBackup KV scope, so restarts
// never re-send a backup that already went out.
import "open-sse/index.js";

import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";
import { exportDb } from "@/lib/db/index.js";
import { getAutoBackupConfig, getAutoBackupStatus, setAutoBackupStatus } from "@/lib/db/repos/autoBackupRepo.js";
import { getAppVersion } from "@/lib/db/version.js";
import { AUTO_BACKUP_CONFIG } from "@/shared/constants/config";

const C = AUTO_BACKUP_CONFIG;

// Survive Next.js hot reload and keep one scheduler per server process.
const g = (global.__telegramBackup ??= {
  timer: null,
  running: false,
});

const HOUR_MS = 3600000;

function formatStamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function formatMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function intervalMsOf(config) {
  return Math.max(C.minIntervalHours, Number(config.intervalHours) || C.minIntervalHours) * HOUR_MS;
}

function schedule(delayMs) {
  if (g.timer) clearTimeout(g.timer);
  g.timer = setTimeout(() => {
    g.timer = null;
    runTelegramBackupTick().catch(() => {});
  }, Math.max(0, delayMs));
  if (g.timer.unref) g.timer.unref();
}

async function recordStatus(patch) {
  try {
    await setAutoBackupStatus({ ...(await getAutoBackupStatus()), ...patch });
  } catch (e) {
    console.warn("[TGBackup] failed to store status:", e.message);
  }
}

async function buildBackupBuffer() {
  const payload = await exportDb();
  const buf = Buffer.from(JSON.stringify(payload, null, 2));
  if (buf.length > C.maxBytes) {
    throw new Error(`Backup too large for Telegram (${formatMb(buf.length)} MB > ${formatMb(C.maxBytes)} MB) — use Download Backup instead`);
  }
  return buf;
}

async function sendDocument({ botToken, chatId }, buf, stamp) {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("document", new Blob([buf], { type: "application/json" }), `9router-backup-${stamp}.json`);
  form.append("caption", `9Router auto backup v${getAppVersion()} — ${formatMb(buf.length)} MB`);

  // Respects the outbound-proxy env applied by applyOutboundProxyEnv().
  const res = await proxyAwareFetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120000),
  }, null);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.description || `Telegram API ${res.status}`);
  }
}

// Builds the backup and uploads it, recording status either way. Shared by the
// scheduler tick and the dashboard "Send Test Backup" button. Throws on failure.
export async function sendTelegramBackupNow() {
  if (g.running) throw new Error("A backup is already being sent");
  const config = await getAutoBackupConfig();
  if (!config.botToken || !config.chatId) {
    throw new Error("Telegram backup not configured (bot token / chat id)");
  }
  g.running = true;
  try {
    const stamp = formatStamp(new Date());
    const buf = await buildBackupBuffer();
    const sizeBytes = buf.length;
    try {
      await sendDocument(config, buf, stamp);
    } finally {
      buf.fill(0); // release the copy of the secret-bearing payload ASAP
    }
    await recordStatus({ lastSentAt: new Date().toISOString(), lastStatus: "ok", lastError: null, lastSizeBytes: sizeBytes });
    if (config.enabled) schedule(intervalMsOf(config));
    console.log(`[TGBackup] sent (${formatMb(sizeBytes)} MB)`);
    return { ok: true, sizeBytes };
  } catch (e) {
    await recordStatus({ lastStatus: "error", lastError: e.message });
    throw e;
  } finally {
    g.running = false;
  }
}

export async function runTelegramBackupTick() {
  if (g.running) {
    schedule(60000); // a manual send is in flight — re-check in a minute
    return;
  }
  g.running = true;
  try {
    const config = await getAutoBackupConfig();
    if (!config.enabled || !config.botToken || !config.chatId) {
      stopTelegramBackup();
      return;
    }
    const status = await getAutoBackupStatus();
    const intervalMs = intervalMsOf(config);
    const lastSentMs = status?.lastSentAt ? new Date(status.lastSentAt).getTime() : 0;
    const dueAt = lastSentMs + intervalMs;
    if (lastSentMs && dueAt > Date.now()) {
      schedule(dueAt - Date.now());
      return;
    }
    // Re-check freshness: a manual "Send Test Backup" may have rescheduled since.
    const fresh = await getAutoBackupStatus();
    const freshSentMs = fresh?.lastSentAt ? new Date(fresh.lastSentAt).getTime() : 0;
    if (freshSentMs && freshSentMs + intervalMs > Date.now()) {
      schedule(freshSentMs + intervalMs - Date.now());
      return;
    }
    try {
      await sendTelegramBackupNow();
    } catch (e) {
      console.warn("[TGBackup] send failed:", e.message);
      schedule(C.retryDelayMs);
    }
  } finally {
    g.running = false;
  }
}

// Schedule the next tick from the persisted lastSentAt. A fresh setup (never
// sent) fires immediately; otherwise only the remainder of the interval waits.
function scheduleFirstRun() {
  Promise.all([getAutoBackupStatus(), getAutoBackupConfig()])
    .then(([status, config]) => {
      const lastSentMs = status?.lastSentAt ? new Date(status.lastSentAt).getTime() : 0;
      const wait = lastSentMs ? lastSentMs + intervalMsOf(config) - Date.now() : 0;
      schedule(wait);
    })
    .catch(() => {});
}

export function startTelegramBackup() {
  if (g.timer) return;
  console.log("[TGBackup] scheduler started");
  scheduleFirstRun();
}

export function stopTelegramBackup() {
  if (!g.timer) return;
  clearTimeout(g.timer);
  g.timer = null;
  console.log("[TGBackup] scheduler stopped");
}

// Hot-reload entry (config PATCH / startup): applies the currently stored config.
export async function configureTelegramBackup() {
  const config = await getAutoBackupConfig();
  if (!config.enabled || !config.botToken || !config.chatId) {
    stopTelegramBackup();
    return;
  }
  if (g.timer) clearTimeout(g.timer); // reschedule against the (possibly new) interval
  g.timer = null;
  startTelegramBackup();
}
