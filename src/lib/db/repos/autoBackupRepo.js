// Auto-backup (Telegram) config + status. Lives in its own KV scope so the bot
// token never travels through the settings blob; it also round-trips inside DB
// backups (see exportDb/importDb), so a restored instance keeps its schedule.
import { makeKv } from "../helpers/kvStore.js";

const kv = makeKv("autoBackup");

const DEFAULT_CONFIG = {
  enabled: false,
  botToken: "",
  chatId: "",
  intervalHours: 24,
};

export async function getAutoBackupConfig() {
  return { ...DEFAULT_CONFIG, ...(await kv.get("config", {})) };
}

export async function setAutoBackupConfig(patch) {
  const next = { ...(await getAutoBackupConfig()), ...patch };
  await kv.set("config", next);
  return next;
}

export async function getAutoBackupStatus() {
  return kv.get("status", null);
}

export async function setAutoBackupStatus(status) {
  await kv.set("status", status);
}
