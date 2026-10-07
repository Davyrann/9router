import { getAdapter } from "../driver.js";
import { parseJson } from "../helpers/jsonCol.js";

const NOT_OK = ["ok", "success", "200", "0"];

/** Stable fingerprint — row ids shift when usageHistory is pruned. */
function errKey(r) {
  let h = 0;
  const s = `${r.timestamp}|${r.provider}|${r.model}|${r.status}|${r.id}`;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return `e${(h >>> 0).toString(16)}`;
}

/**
 * Failed requests only, newest first. A row is an error when its status is not
 * one of the OK values above — 9router records 4xx/5xx as plain strings.
 */
export async function listErrorRequests(filter = {}) {
  const db = await getAdapter();
  const limit = Math.min(Number(filter.limit) || 50, 500);

  const rows = db.all(
    `SELECT id, timestamp, provider, model, connectionId, apiKey, endpoint, status
       FROM usageHistory ORDER BY id DESC LIMIT ?`,
    [Math.max(limit * 25, 300)],
  );

  const items = rows.filter((r) => r.status && !NOT_OK.includes(String(r.status).toLowerCase()));

  return items.slice(0, limit).map((r) => ({
    id: errKey(r),
    rowId: r.id,
    timestamp: r.timestamp,
    provider: r.provider || "—",
    model: r.model || "—",
    connectionId: r.connectionId || null,
    apiKeyMasked: r.apiKey ? `${String(r.apiKey).slice(0, 8)}***${String(r.apiKey).slice(-4)}` : null,
    endpoint: r.endpoint || "Unknown",
    status: String(r.status),
    resolved: false,
  }));
}

/** Pinned resolution state (handled / ignored) lives in _meta, not a new table. */
export async function getResolutionState() {
  const db = await getAdapter();
  const row = db.get(`SELECT value FROM _meta WHERE key = 'errorInbox.resolved'`);
  const map = row ? parseJson(row.value, {}) : {};
  return map && typeof map === "object" ? map : {};
}

export async function setResolutionState(map) {
  const db = await getAdapter();
  db.run(
    `INSERT INTO _meta(key, value) VALUES('errorInbox.resolved', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(map || {})],
  );
}

export async function getErrorFacets() {
  const db = await getAdapter();
  const rows = db.all(
    `SELECT status, provider, COUNT(*) AS n
       FROM usageHistory
      WHERE status IS NOT NULL AND LOWER(status) NOT IN ('ok','success','200','0')
      GROUP BY status, provider ORDER BY n DESC LIMIT 60`,
  );
  return rows.map((r) => ({ status: String(r.status), provider: r.provider || "—", count: r.n }));
}