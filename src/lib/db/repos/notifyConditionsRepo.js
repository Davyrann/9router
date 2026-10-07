import { getAdapter } from "../driver.js";

/**
 * Derived conditions for the bell. Nothing here is stored twice: the groups are
 * read straight out of usageHistory, so the scan can run on every dashboard
 * load without writing rows of its own.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_GROUPS = 6;

/**
 * Failed request counts grouped by status+provider over the window.
 * A lone 401 is normal life; a run of them is worth a look, so the caller
 * applies its own floor — this returns the raw counts in rank order.
 */
export async function getErrorGroups(sinceMs = DAY_MS) {
  const db = await getAdapter();
  const since = new Date(Date.now() - sinceMs).toISOString();
  const rows = db.all(
    `SELECT status, COALESCE(provider, '—') AS provider, COUNT(*) AS n, MAX(timestamp) AS lastAt
       FROM usageHistory
      WHERE timestamp >= ? AND status IS NOT NULL
        AND LOWER(status) NOT IN ('ok', 'success', '200', '0')
      GROUP BY status, provider
      ORDER BY n DESC, lastAt DESC
      LIMIT ?`,
    [since, MAX_GROUPS * 4],
  );

  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const status = String(r.status);
    const key = `${status}|${r.provider}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, status, provider: r.provider, count: r.n, lastAt: r.lastAt });
  }
  return out.slice(0, MAX_GROUPS);
}