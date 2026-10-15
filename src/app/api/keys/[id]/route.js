import { NextResponse } from "next/server";
import { deleteApiKey, getApiKeyById, updateApiKey, resetKeyQuota } from "@/lib/localDb";
import { validateKeyAccessInput } from "@/shared/utils/keyAccess.js";

// GET /api/keys/[id] - Get single key
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    return NextResponse.json({ key });
  } catch (error) {
    console.log("Error fetching key:", error);
    return NextResponse.json({ error: "Failed to fetch key" }, { status: 500 });
  }
}

// PUT /api/keys/[id] - Update key
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { isActive, access, name, expiresAt, quotaLimit, quotaWindow, quotaReset } = body;

    const existing = await getApiKeyById(id);
    if (!existing) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const updateData = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (name !== undefined) {
      const trimmed = typeof name === "string" ? name.trim() : "";
      if (!trimmed) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      if (trimmed.length > 64) return NextResponse.json({ error: "Name must be 64 characters or fewer" }, { status: 400 });
      updateData.name = trimmed;
    }
    if (access !== undefined) {
      const checked = validateKeyAccessInput(access);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
      updateData.access = checked.value;
    }
    // Expiry: null/"" clears it, a future ISO sets it.
    if (expiresAt !== undefined) {
      if (expiresAt === null || expiresAt === "") {
        updateData.expiresAt = null;
      } else {
        const t = new Date(expiresAt);
        if (Number.isNaN(t.getTime()) || t.getTime() <= Date.now()) {
          return NextResponse.json({ error: "Expiry must be a future date" }, { status: 400 });
        }
        updateData.expiresAt = t.toISOString();
      }
    }

    // Quota: null limit clears it (unlimited), positive int sets it.
    if (quotaLimit !== undefined || quotaWindow !== undefined) {
      const limit = quotaLimit === undefined ? existing.quotaLimit : (quotaLimit === null || quotaLimit === "" ? null : Number(quotaLimit));
      if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
        return NextResponse.json({ error: "Quota limit must be a positive number of requests" }, { status: 400 });
      }
      let win = existing.quotaWindow;
      if (quotaWindow !== undefined) win = quotaWindow === "monthly" ? "monthly" : "daily";
      updateData.quotaLimit = limit;
      updateData.quotaWindow = limit ? win : null;
    }

    const updated = await updateApiKey(id, updateData);

    // "reset now": zero the counter; the next request opens a fresh window.
    if (quotaReset === true) await resetKeyQuota(id);

    return NextResponse.json({ key: await getApiKeyById(id) || updated });
  } catch (error) {
    console.log("Error updating key:", error);
    return NextResponse.json({ error: "Failed to update key" }, { status: 500 });
  }
}

// DELETE /api/keys/[id] - Delete API key
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    const deleted = await deleteApiKey(id);
    if (!deleted) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Key deleted successfully" });
  } catch (error) {
    console.log("Error deleting key:", error);
    return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
  }
}
