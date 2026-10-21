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

  it("enforces onetime token limit without periodic reset and permits top-up", async () => {
    const { db, adapter } = await boot();
    const key = await db.createApiKey("Onetime Key", "mach-1", null, null, "onetime", 1000);
    expect(key.quotaWindow).toBe("onetime");
    expect(key.quotaResetAt).toBeNull();

    // Bump 400 -> allowed
    db.bumpKeyQuota(adapter, key.key, 400);
    let check = await db.checkKeyQuota(key.key);
    expect(check).toBeNull();

    // Bump 600 -> reaches 1000 limit
    db.bumpKeyQuota(adapter, key.key, 600);
    check = await db.checkKeyQuota(key.key);
    expect(check).toMatchObject({
      quotaExceeded: true,
      type: "tokens",
      used: 1000,
      limit: 1000,
      resetAt: null,
    });

    // Check getKeyRejection formatting
    const { getKeyRejection } = await import("@/sse/services/auth.js");
    const rejection = await getKeyRejection(key.key);
    expect(rejection).toMatchObject({
      status: 429,
      message: "API key token quota exhausted (1000/1000 tokens used).",
    });

    // Top up token limit to 2500 -> immediately allowed without unpause
    await db.updateApiKey(key.id, { quotaTokenLimit: 2500 });
    check = await db.checkKeyQuota(key.key);
    expect(check).toBeNull();
    const rejectionAfterTopup = await getKeyRejection(key.key);
    expect(rejectionAfterTopup).toBeNull();
  });

  it("handles onetime quota in POST /api/keys and PUT /api/keys/[id]", async () => {
    await boot();
    const { POST } = await import("@/app/api/keys/route.js");
    const { PUT, GET } = await import("@/app/api/keys/[id]/route.js");

    // Create key with onetime token quota
    const createReq = new Request("http://localhost/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Route Onetime Key",
        quotaTokenLimit: 50000,
        quotaWindow: "onetime",
      }),
    });
    const createRes = await POST(createReq);
    expect(createRes.status).toBe(201);
    const { apiKey } = await createRes.json();
    expect(apiKey.quotaWindow).toBe("onetime");
    expect(apiKey.quotaTokenLimit).toBe(50000);

    // Update key with token topup / quotaTokensUsed update via PUT
    const updateReq = new Request(`http://localhost/api/keys/${apiKey.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quotaTokenLimit: 100000,
        quotaTokensUsed: 1234,
      }),
    });
    const updateRes = await PUT(updateReq, { params: Promise.resolve({ id: apiKey.id }) });
    expect(updateRes.status).toBe(200);
    const { key: updatedKey } = await updateRes.json();
    expect(updatedKey.quotaTokenLimit).toBe(100000);
    expect(updatedKey.quotaTokensUsed).toBe(1234);
    expect(updatedKey.quotaWindow).toBe("onetime");
  });
});
