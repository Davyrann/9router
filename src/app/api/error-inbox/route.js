import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDashboardAuthSession } from "@/lib/auth/dashboardSession";
import {
  listErrorRequests,
  getResolutionState,
  setResolutionState,
  getErrorFacets,
} from "@/lib/db/repos/errorInboxRepo.js";

export const dynamic = "force-dynamic";

/**
 * GET  /api/error-inbox — failed requests only, plus the facet counts.
 * POST /api/error-inbox — { action, ids } to pin/unpin resolution.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = await getDashboardAuthSession(cookieStore.get("auth_token")?.value);
    if (!session || session.role === "apikey") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [items, state, facets] = await Promise.all([
      listErrorRequests({ limit: 50 }),
      getResolutionState(),
      getErrorFacets(),
    ]);

    return NextResponse.json(
      { items: items.map((i) => ({ ...i, resolved: !!state[i.id] })), facets },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.log("Error loading inbox:", error);
    return NextResponse.json({ error: "Failed to load inbox" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const session = await getDashboardAuthSession(cookieStore.get("auth_token")?.value);
    if (!session || session.role === "apikey") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    const state = await getResolutionState();
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];

    if (action === "pin") for (const id of ids) state[id] = Date.now();
    else if (action === "unpin") for (const id of ids) delete state[id];
    else if (action === "reset") { await setResolutionState({}); return NextResponse.json({ ok: true }); }
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

    await setResolutionState(state);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.log("Error updating inbox:", error);
    return NextResponse.json({ error: "Failed to update inbox" }, { status: 500 });
  }
}