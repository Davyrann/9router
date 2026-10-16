// Import semantics for usage aggregates: a v1 backup (no `usage`) must NOT
// wipe this instance's usageDaily rollups / lifetime counter, while a v2
// backup carrying usage replaces BOTH together so they stay consistent.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

async function boot() {
  delete global._dbAdapter;
  vi.resetModules();
  const db = await import("@/lib/db/index.js");
  const { getAdapter } = await import("@/lib/db/driver.js");
  return { db, adapter: await getAdapter() };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-backup-usage-"));
  process.env.DATA_DIR = tempDir;
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("importDb usage aggregates", () => {
  it("a v1 backup (no usage) preserves local rollups and the lifetime counter", async () => {
    const { db, adapter } = await boot();
    adapter.run(`INSERT INTO usageDaily(dateKey, data) VALUES('2026-01-01', '{"requests":42}')`);
    adapter.run(`INSERT INTO _meta(key, value) VALUES('totalRequestsLifetime', '42')`);

    await db.importDb({ settings: { rtkEnabled: true } });

    expect(adapter.get(`SELECT data FROM usageDaily WHERE dateKey='2026-01-01'`).data).toBe('{"requests":42}');
    expect(adapter.get(`SELECT value FROM _meta WHERE key='totalRequestsLifetime'`).value).toBe("42");
  });

  it("a v2 backup with usage replaces rollups and lifetime together", async () => {
    const { db, adapter } = await boot();
    adapter.run(`INSERT INTO usageDaily(dateKey, data) VALUES('2026-01-01', '{"requests":42}')`);
    adapter.run(`INSERT INTO _meta(key, value) VALUES('totalRequestsLifetime', '42')`);

    await db.importDb({
      formatVersion: 2,
      usage: { daily: { "2026-02-02": { requests: 7 } }, totalRequestsLifetime: 7 },
    });

    expect(adapter.all(`SELECT dateKey FROM usageDaily`)).toEqual([{ dateKey: "2026-02-02" }]);
    expect(adapter.get(`SELECT value FROM _meta WHERE key='totalRequestsLifetime'`).value).toBe("7");
  });
});
