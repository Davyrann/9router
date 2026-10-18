// Usage chart bucketing must follow the dashboard's DISPLAY timezone, not the
// server machine timezone. usageHistory.timestamp is UTC ISO, so day boundaries
// are recomputed per-request in the requested IANA zone.
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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-usage-tz-"));
  process.env.DATA_DIR = tempDir;
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

const NY = "America/New_York"; // UTC-5 (EST) / UTC-4 (EDT) year-round

// A UTC instant at 01:00 today (UTC). New York's day does not start until
// 04:00/05:00 UTC, so this instant is ALWAYS "yesterday" in NY and "today" in UTC.
function utcOneAmToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() + 3600000).toISOString();
}

function insertRow(adapter, timestamp) {
  adapter.run(
    `INSERT INTO usageHistory(timestamp, provider, model, connectionId, apiKey, endpoint, promptTokens, completionTokens, cost, status, tokens, meta)
     VALUES(?, 'openai', 'gpt-4o', NULL, NULL, '/v1/chat/completions', 100, 50, 0.01, 'ok', '{}', '{}')`,
    [timestamp],
  );
}

const totals = (buckets) => buckets.reduce((s, b) => s + b.requests, 0);

describe("usage chart display timezone", () => {
  it("today: a UTC 01:00 request counts under tz=UTC but is yesterday in New York", async () => {
    const { db, adapter } = await boot();
    insertRow(adapter, utcOneAmToday());

    const utc = await db.getChartData("today", "UTC");
    expect(utc).toHaveLength(24);
    expect(utc[1].requests).toBe(1); // 01:00 bucket
    expect(utc[1].label).toBe("01:00");
    expect(totals(utc)).toBe(1);

    const ny = await db.getChartData("today", NY);
    expect(ny).toHaveLength(24);
    expect(totals(ny)).toBe(0); // not yet "today" in New York
  });

  it("7d: the same request lands in a different day bucket per timezone", async () => {
    const { db, adapter } = await boot();
    insertRow(adapter, utcOneAmToday());

    const utc = await db.getChartData("7d", "UTC");
    expect(utc).toHaveLength(7);
    expect(utc[6].requests).toBe(1); // today, in UTC

    const ny = await db.getChartData("7d", NY);
    expect(ny).toHaveLength(7);
    expect(ny[6].requests).toBe(0); // today in NY has not started
    expect(ny[5].requests).toBe(1); // ...it is yesterday there
  });

  it("day buckets are always consecutive and unique, including across DST", async () => {
    const { db, adapter } = await boot();
    insertRow(adapter, utcOneAmToday());
    for (const period of ["7d", "30d", "60d"]) {
      const b = await db.getChartData(period, NY);
      expect(b).toHaveLength(Number(period.replace("d", "")));
      const labels = b.map((x) => x.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("absent or invalid tz falls back to server-local and does not throw", async () => {
    const { db, adapter } = await boot();
    insertRow(adapter, utcOneAmToday());
    for (const tz of ["", "Not/AZone", null]) {
      const b = await db.getChartData("7d", tz);
      expect(b).toHaveLength(7);
    }
  });

  it("all: spans from the first recorded request to today", async () => {
    const { db, adapter } = await boot();
    insertRow(adapter, utcOneAmToday());
    const b = await db.getChartData("all", "UTC");
    expect(b.length).toBeGreaterThanOrEqual(1);
    expect(b[b.length - 1].requests).toBe(1);
  });

  it("all with no history returns an empty chart", async () => {
    const { db } = await boot();
    expect(await db.getChartData("all", "UTC")).toEqual([]);
  });
});
