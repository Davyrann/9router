import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { keyAccessFromColumns, keyAccessToColumns } from "@/shared/utils/keyAccess.js";
import { KEY_ACCESS_UNRESTRICTED } from "@/shared/constants/keyAccess.js";

function rowToKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    machineId: row.machineId,
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt || null,
    quotaLimit: row.quotaLimit ?? null,
    quotaWindow: row.quotaWindow || null,
    quotaUsed: row.quotaUsed || 0,
    quotaResetAt: row.quotaResetAt || null,
    access: keyAccessFromColumns(row.accessRestricted, row.accessAllow),
  };
}

export async function getApiKeys() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM apiKeys ORDER BY createdAt ASC`);
  return rows.map(rowToKey);
}

export async function getApiKeyById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  return rowToKey(row);
}

// Used by the /v1 handlers to read the presented key's access settings.
export async function getApiKeyByKey(key) {
  if (!key) return null;
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE key = ?`, [key]);
  return rowToKey(row);
}

export async function createApiKey(name, machineId, expiresAt = null, quotaLimit = null, quotaWindow = null) {
  if (!machineId) throw new Error("machineId is required");
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);
  const apiKey = {
    id: uuidv4(),
    name,
    key: result.key,
    machineId,
    isActive: true,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt || null,
    quotaLimit: quotaLimit || null,
    quotaWindow: quotaWindow || null,
    quotaUsed: 0,
    quotaResetAt: null,
    access: { restricted: false, allow: [] },
  };
  const cols = keyAccessToColumns(KEY_ACCESS_UNRESTRICTED);
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt, expiresAt, quotaLimit, quotaWindow, quotaUsed, quotaResetAt, accessRestricted, accessAllow)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [apiKey.id, apiKey.key, apiKey.name, apiKey.machineId, 1, apiKey.createdAt, apiKey.expiresAt,
     apiKey.quotaLimit, apiKey.quotaWindow, apiKey.quotaUsed, apiKey.quotaResetAt, cols.accessRestricted, cols.accessAllow]
  );
  return apiKey;
}

export async function updateApiKey(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToKey(row), ...data };
    const cols = keyAccessToColumns(merged.access);
    db.run(
      `UPDATE apiKeys SET key = ?, name = ?, machineId = ?, isActive = ?, expiresAt = ?, quotaLimit = ?, quotaWindow = ?, accessRestricted = ?, accessAllow = ? WHERE id = ?`,
      [merged.key, merged.name, merged.machineId, merged.isActive ? 1 : 0, merged.expiresAt || null,
       merged.quotaLimit || null, merged.quotaWindow || null, cols.accessRestricted, cols.accessAllow, id]
    );
    result = rowToKey(db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]));
  });
  return result;
}

export async function deleteApiKey(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM apiKeys WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}

// Per-key usage summary straight from usageHistory (full apiKey column).
// Used by the endpoint card to show requests/tokens/last-used per key.
// ── Per-key quota ───────────────────────────────────────────────
// Counts recorded requests per key inside a daily/monthly window.
// Lazy reset: when the window boundary passes, usage zeroes and the next
// boundary is computed — no cron needed. One atomic transaction per
// request keeps the counter race-free within the single-process gateway.
function nextWindowBoundaryIso(window) {
  const now = new Date();
  if (window === "monthly") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  }
  // default: daily (UTC midnight)
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

// Called once per recorded request (right after the usageHistory insert).
// Quota-less keys are a no-op.
export function bumpKeyQuota(db, apiKey) {
  if (!apiKey || typeof apiKey !== "string") return;
  const row = db.get(
    `SELECT quotaLimit, quotaWindow, quotaUsed, quotaResetAt FROM apiKeys WHERE key = ?`,
    [apiKey]
  );
  if (!row || !row.quotaLimit || row.quotaLimit <= 0) return;
  if (!row.quotaResetAt || new Date(row.quotaResetAt).getTime() <= Date.now()) {
    db.run(`UPDATE apiKeys SET quotaUsed = 1, quotaResetAt = ? WHERE key = ?`, [
      nextWindowBoundaryIso(row.quotaWindow),
      apiKey,
    ]);
  } else {
    db.run(`UPDATE apiKeys SET quotaUsed = quotaUsed + 1 WHERE key = ?`, [apiKey]);
  }
}

// Check (with lazy reset) whether the key may serve one more request.
// Returns null when allowed, or a rejection payload when the quota is spent.
export async function checkKeyQuota(apiKey) {
  if (!apiKey) return null;
  const db = await getAdapter();
  return db.transaction(() => {
    const row = db.get(
      `SELECT quotaLimit, quotaWindow, quotaUsed, quotaResetAt FROM apiKeys WHERE key = ?`,
      [apiKey]
    );
    if (!row || !row.quotaLimit || row.quotaLimit <= 0) return null;

    let used = row.quotaUsed || 0;
    if (!row.quotaResetAt || new Date(row.quotaResetAt).getTime() <= Date.now()) {
      used = 0;
      db.run(`UPDATE apiKeys SET quotaUsed = 0, quotaResetAt = ? WHERE key = ?`, [
        nextWindowBoundaryIso(row.quotaWindow),
        apiKey,
      ]);
    }
    if (used >= row.quotaLimit) {
      return {
        quotaExceeded: true,
        used,
        limit: row.quotaLimit,
        resetAt: row.quotaResetAt,
      };
    }
    return null;
  });
}

// Clear the counter and let the next request start a fresh window.
export async function resetKeyQuota(id) {
  const db = await getAdapter();
  db.run(`UPDATE apiKeys SET quotaUsed = 0, quotaResetAt = NULL WHERE id = ?`, [id]);
}

export async function getApiKeyUsageSummary() {
  const db = await getAdapter();
  const rows = db.all(
    `SELECT apiKey, COUNT(*) AS requests,
            SUM(promptTokens) AS promptTokens,
            SUM(completionTokens) AS completionTokens,
            MAX(timestamp) AS lastUsed
     FROM usageHistory
     WHERE apiKey IS NOT NULL AND apiKey != ''
     GROUP BY apiKey`
  );
  const summary = {};
  for (const r of rows) {
    summary[r.apiKey] = {
      requests: r.requests || 0,
      promptTokens: r.promptTokens || 0,
      completionTokens: r.completionTokens || 0,
      lastUsed: r.lastUsed || null,
    };
  }
  return summary;
}

export async function validateApiKey(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT isActive FROM apiKeys WHERE key = ?`, [key]);
  if (!row) return false;
  return row.isActive === 1 || row.isActive === true;
}
