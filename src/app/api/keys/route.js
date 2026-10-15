import { NextResponse } from "next/server";
import { getApiKeys, createApiKey, getApiKeyUsageSummary } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";

export const dynamic = "force-dynamic";

// Normalize optional quota input: positive int limit + allowed window.
function parseQuota(quotaLimit, quotaWindow) {
  if (quotaLimit === undefined || quotaLimit === null || quotaLimit === "") {
    return { limit: null, window: null, error: null };
  }
  const limit = Number(quotaLimit);
  if (!Number.isInteger(limit) || limit <= 0) return { error: "Quota limit must be a positive number of requests" };
  const win = quotaWindow === "monthly" ? "monthly" : "daily";
  return { limit, window: win, error: null };
}

// GET /api/keys - List API keys (each with usage summary)
export async function GET() {
  try {
    const [keys, usage] = await Promise.all([getApiKeys(), getApiKeyUsageSummary()]);
    return NextResponse.json({
      keys: keys.map((k) => ({ ...k, usage: usage[k.key] || null })),
    });
  } catch (error) {
    console.log("Error fetching keys:", error);
    return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
  }
}

// POST /api/keys - Create new API key
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, expiresAt, quotaLimit, quotaWindow } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Optional quota
    const quota = parseQuota(quotaLimit, quotaWindow);
    if (quota.error) return NextResponse.json({ error: quota.error }, { status: 400 });

    // Optional expiry: must be a parseable, future timestamp.
    let normalizedExpiry = null;
    if (expiresAt) {
      const t = new Date(expiresAt);
      if (Number.isNaN(t.getTime()) || t.getTime() <= Date.now()) {
        return NextResponse.json({ error: "Expiry must be a future date" }, { status: 400 });
      }
      normalizedExpiry = t.toISOString();
    }

    // Always get machineId from server
    const machineId = await getConsistentMachineId();
    const apiKey = await createApiKey(name, machineId, normalizedExpiry, quota.limit, quota.window);

    return NextResponse.json({
      key: apiKey.key,
      name: apiKey.name,
      id: apiKey.id,
      machineId: apiKey.machineId,
      expiresAt: apiKey.expiresAt,
      quotaLimit: apiKey.quotaLimit,
      quotaWindow: apiKey.quotaWindow,
    }, { status: 201 });
  } catch (error) {
    console.log("Error creating key:", error);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}
