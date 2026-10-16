// Telegram auto-backup scheduler.
//
// One process-wide interval (survives Next.js hot reload) ticks every minute and
// sends the JSON backup to the configured Telegram chat once the custom interval
// has elapsed. Fail-open: any error is recorded in settings and logged, never
// thrown — a broken Telegram config must not affect request serving.

import { getSettings, updateSettings, exportDb } from "@/lib/localDb";
import { sendTelegramDocument, sendTelegramMessage, safeErrorMessage } from "./telegram.js";

const TICK_MS = 60 * 1000;
const DEFAULT_INTERVAL_MINUTES = 1440;
// After a FAILED auto send, wait this long before retrying (a success schedules
// the next run by the normal interval). ponytail: fixed backoff; upgrade to
// exponential + jitter only if a down Telegram ever becomes a problem.
const RETRY_MS = 10 * 60 * 1000;

// Survive hot reload — one scheduler per server process.
const g = global.__telegramAutoBackup ??= { interval: null, running: false, nextAttemptAt: 0 };

function isConfigured(settings) {
  return !!(
    settings?.telegramBackupEnabled === true
    && settings?.telegramBackupBotToken
    && settings?.telegramBackupChatId
  );
}

export function startTelegramAutoBackup() {
  if (g.interval) return;
  g.interval = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  if (g.interval.unref) g.interval.unref();
  console.log("[TelegramBackup] scheduler started");
}

export function stopTelegramAutoBackup() {
  if (!g.interval) return;
  clearInterval(g.interval);
  g.interval = null;
  console.log("[TelegramBackup] scheduler stopped");
}

export async function configureTelegramAutoBackup(settings) {
  const s = settings || await getSettings();
  if (isConfigured(s)) startTelegramAutoBackup();
  else stopTelegramAutoBackup();
}

async function tick() {
  const settings = await getSettings();
  if (!isConfigured(settings)) {
    stopTelegramAutoBackup();
    return;
  }
  const intervalMs = Math.max(1, Number(settings.telegramBackupIntervalMinutes) || DEFAULT_INTERVAL_MINUTES) * 60000;
  const last = settings.telegramBackupLastRunAt ? Date.parse(settings.telegramBackupLastRunAt) : 0;
  if (last && Date.now() - last < intervalMs) return;
  if (g.nextAttemptAt && Date.now() < g.nextAttemptAt) return;
  const result = await runTelegramBackup({ reason: "auto" });
  // A failed send must not consume the schedule slot — lastRunAt only advances
  // on success, so back off briefly instead of retrying every tick.
  if (!result.ok) g.nextAttemptAt = Date.now() + Math.min(intervalMs, RETRY_MS);
}

export async function runTelegramBackup({ reason = "manual" } = {}) {
  if (g.running) return { ok: false, error: "A backup is already running" };
  g.running = true;
  try {
    const settings = await getSettings();
    if (!settings.telegramBackupBotToken || !settings.telegramBackupChatId) {
      return { ok: false, error: "Telegram bot token or chat ID is not configured" };
    }

    const payload = await exportDb();
    const stamp = new Date().toISOString().replace(/[.:]/g, "-");
    const result = await sendTelegramDocument({
      botToken: settings.telegramBackupBotToken,
      chatId: settings.telegramBackupChatId,
      filename: `9router-backup-${stamp}.json`,
      content: JSON.stringify(payload, null, 2),
      caption: `9Router backup (${reason}) — v${payload.appVersion || "?"}`,
    });

    // lastRunAt advances only on a SUCCESSFUL send (auto retries within
    // RETRY_MS otherwise). A manual send counts as a success and therefore
    // reschedules the automatic run — a sent backup is a sent backup.
    await updateSettings({
      ...(result.ok ? { telegramBackupLastRunAt: new Date().toISOString() } : {}),
      telegramBackupLastStatus: result.ok ? `ok (${reason})` : `error: ${result.error}`,
    });

    if (result.ok) console.log(`[TelegramBackup] backup sent (${reason})`);
    else console.warn(`[TelegramBackup] send failed: ${result.error}`);
    return result;
  } catch (e) {
    const message = safeErrorMessage(e);
    await updateSettings({ telegramBackupLastStatus: `error: ${message}` }).catch(() => {});
    console.warn(`[TelegramBackup] backup failed: ${message}`);
    return { ok: false, error: message };
  } finally {
    g.running = false;
  }
}

export async function sendTelegramTest() {
  const settings = await getSettings();
  if (!settings.telegramBackupBotToken || !settings.telegramBackupChatId) {
    return { ok: false, error: "Telegram bot token or chat ID is not configured" };
  }
  return sendTelegramMessage({
    botToken: settings.telegramBackupBotToken,
    chatId: settings.telegramBackupChatId,
    text: "9Router: Telegram backup test OK ✅",
  });
}
