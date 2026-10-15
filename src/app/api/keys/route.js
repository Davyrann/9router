import { NextResponse } from "next/server";
import { getApiKeys, createApiKey, getApiKeyUsageSummary } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";

export const dynamic = "force-dynamic";

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
    const { name, expiresAt } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

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
    const apiKey = await createApiKey(name, machineId, normalizedExpiry);

    return NextResponse.json({
      key: apiKey.key,
      name: apiKey.name,
      id: apiKey.id,
      machineId: apiKey.machineId,
      expiresAt: apiKey.expiresAt,
    }, { status: 201 });
  } catch (error) {
    console.log("Error creating key:", error);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}
