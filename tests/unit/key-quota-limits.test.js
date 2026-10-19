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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-key-quota-"));
  process.env.DATA_DIR = tempDir;
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("API Key quota: request limit and token limit", () => {
  it("enforces request quota limit", async () => {
    const { db, adapter } = await boot();
    const key = await db.createApiKey("Test Key", "mach-1", null, 2, "daily");

    // Check 1: 0 used out of 2 -> allowed
    let check = await db.checkKeyQuota(key.key);
    expect(check).toBeNull();

    // Bump 1
    db.bumpKeyQuota(adapter, key.key, 100);
    check = await db.checkKeyQuota(key.key);
    expect(check).toBeNull();

    // Bump 2 -> reached limit
    db.bumpKeyQuota(adapter, key.key, 150);
    check = await db.checkKeyQuota(key.key);
    expect(check).toMatchObject({
      quotaExceeded: true,
      type: "requests",
      used: 2,
      limit: 2,
    });

    // Reset quota
    await db.resetKeyQuota(key.id);
    check = await db.checkKeyQuota(key.key);
    expect(check).toBeNull();
  });

  it("enforces token usage quota limit", async () => {
    const { db, adapter } = await boot();
    const key = await db.createApiKey("Token Key", "mach-1", null, null, null);
    await db.updateApiKey(key.id, { quotaTokenLimit: 500, quotaWindow: "daily" });

    // Check initial
    let check = await db.checkKeyQuota(key.key);
    expect(check).toBeNull();

    // Bump 300 tokens -> allowed
    db.bumpKeyQuota(adapter, key.key, 300);
    check = await db.checkKeyQuota(key.key);
    expect(check).toBeNull();

    // Bump 250 tokens -> 550 tokens used, exceeds 500 limit
    db.bumpKeyQuota(adapter, key.key, 250);
    check = await db.checkKeyQuota(key.key);
    expect(check).toMatchObject({
      quotaExceeded: true,
      type: "tokens",
      used: 550,
      limit: 500,
    });
  });

  it("supports quotaTokenLimit directly on createApiKey", async () => {
    const { db } = await boot();
    const key = await db.createApiKey("Direct Token Key", "mach-1", null, 10, "monthly", 10000);
    expect(key.quotaLimit).toBe(10);
    expect(key.quotaTokenLimit).toBe(10000);
    expect(key.quotaWindow).toBe("monthly");

    const fetched = await db.getApiKeyById(key.id);
    expect(fetched.quotaTokenLimit).toBe(10000);
  });
});
