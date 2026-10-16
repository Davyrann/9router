// Backup payload format + backward compatibility.
//
// The user-facing backup (Dashboard → Download Backup, and Telegram auto-backup)
// is a JSON document, not a raw SQLite copy. That is deliberate: the DB adapter
// is pluggable (bun:sqlite / better-sqlite3 / node:sqlite / sql.js) and carries
// WAL/journal sidecars, so a file copy is neither portable nor safe while the DB
// is live. A normalized JSON export is adapter- and schema-version-independent.
//
// ⚠️ AGENT/DEV: bump BACKUP_FORMAT_VERSION ONLY for a breaking shape change.
// Additive fields do NOT need a bump — normalizeBackupPayload() already defaults
// missing fields, which is what keeps old backups importable after an update.

export const BACKUP_FORMAT_VERSION = 2;

// v1 = pre-usage backup: no `formatVersion`, no `usage`, no meta block.
// v2 = adds formatVersion/appVersion/schemaVersion/exportedAt + usage aggregates.

const ARRAY_KEYS = ["providerConnections", "providerNodes", "proxyPools", "apiKeys", "combos", "customModels"];
const OBJECT_KEYS = ["modelAliases", "mitmAlias", "pricing"];

// Keys that would mutate an object's prototype when used as a map key. Dropped
// at the import boundary (defense in depth against a crafted backup file).
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
function isSafeKey(key) {
  return typeof key === "string" && key.length > 0 && !DANGEROUS_KEYS.has(key);
}

function asArray(value) {
  // Reject arrays-of-arrays too: a nested array passes `typeof === "object"`
  // but has no usable fields.
  return Array.isArray(value) ? value.filter((v) => v && typeof v === "object" && !Array.isArray(v)) : [];
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = Object.create(null);
  for (const [key, val] of Object.entries(value)) {
    if (isSafeKey(key)) out[key] = val;
  }
  return out;
}

// Settings is a plain object (not a key→value map), so keep its normal
// prototype but still drop dangerous keys at the import boundary.
function asSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (isSafeKey(key)) out[key] = val;
  }
  return out;
}

// Accept both the v2 shape ({ usage: { daily, totalRequestsLifetime } }) and a
// bare `usageDaily` array ({ dateKey, data }[]) so a hand-edited or v1 file works.
function normalizeUsage(raw) {
  const daily = Object.create(null);
  let lifetime = null;

  const usage = asObject(raw?.usage);
  const dailyMap = asObject(usage.daily);
  for (const [dateKey, day] of Object.entries(dailyMap)) {
    if (isSafeKey(dateKey)) daily[dateKey] = day;
  }

  const dailyArr = asArray(raw?.usageDaily);
  for (const row of dailyArr) {
    if (row && isSafeKey(row.dateKey)) daily[row.dateKey] = row.data;
  }

  const rawLifetime = usage.totalRequestsLifetime ?? raw?.totalRequestsLifetime;
  if (rawLifetime != null && Number.isFinite(Number(rawLifetime))) lifetime = Number(rawLifetime);

  return { daily, totalRequestsLifetime: lifetime };
}

/**
 * Validate + normalize an incoming backup payload into the current format.
 * Unknown top-level fields are dropped (whitelist), missing fields default.
 * Throws on a payload newer than this build understands, or on a non-object.
 *
 * @returns {{
 *   formatVersion: number, appVersion: string, schemaVersion: number|null,
 *   exportedAt: string|null, settings: object|null,
 *   providerConnections: object[], providerNodes: object[], proxyPools: object[],
 *   apiKeys: object[], combos: object[], modelAliases: object,
 *   customModels: object[], mitmAlias: object, pricing: object,
 *   usage: { daily: object, totalRequestsLifetime: number|null },
 * }}
 */
export function normalizeBackupPayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid database payload");
  }

  const formatVersion = raw.formatVersion == null ? 1 : Number(raw.formatVersion);
  if (!Number.isFinite(formatVersion) || formatVersion < 1) {
    throw new Error("Invalid backup format version");
  }
  if (formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `Backup format v${formatVersion} is newer than this build supports (v${BACKUP_FORMAT_VERSION}). Update 9Router and try again.`
    );
  }

  const out = {
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: typeof raw.appVersion === "string" ? raw.appVersion : "",
    schemaVersion: Number.isFinite(Number(raw.schemaVersion)) ? Number(raw.schemaVersion) : null,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : null,
    settings: asSettings(raw.settings),
    usage: normalizeUsage(raw),
  };

  for (const key of ARRAY_KEYS) out[key] = asArray(raw[key]);
  for (const key of OBJECT_KEYS) out[key] = asObject(raw[key]);

  return out;
}

// ─── Non-portable secrets ────────────────────────────────────────────────
// Machine-local secrets that must never leave the machine (and would be
// useless after a restore): the dashboard password hash, the OIDC client
// secret, the Telegram bot token, and the AES-GCM MITM sudo password (its key
// is derived from this machine's id).
export const NON_PORTABLE_SECRET_KEYS = [
  "password", "oidcClientSecret", "telegramBackupBotToken", "mitmSudoEncrypted",
];

/** Strip non-portable secrets before a settings object is written to a backup. */
export function redactSettings(settings) {
  const out = { ...(settings || {}) };
  for (const key of NON_PORTABLE_SECRET_KEYS) delete out[key];
  return out;
}

/**
 * Settings to persist on import. Because non-portable secrets are never in a
 * backup, keep THIS instance's values when the payload omits them — otherwise a
 * restore would silently revert the dashboard password to INITIAL_PASSWORD.
 * A payload that explicitly carries a key still wins.
 */
export function mergeSettingsForImport(currentSettings, incomingSettings) {
  const preserved = {};
  for (const key of NON_PORTABLE_SECRET_KEYS) {
    if (currentSettings && currentSettings[key] !== undefined) preserved[key] = currentSettings[key];
  }
  return { ...preserved, ...(incomingSettings || {}) };
}
