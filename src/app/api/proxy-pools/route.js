import { NextResponse } from "next/server";
import { createProxyPool, getProviderConnections, getProxyPools } from "@/models";

function toBoolean(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

const VALID_PROXY_TYPES = ["http", "vercel", "cloudflare", "deno", "netlify"];

function normalizeProxyPoolInput(body = {}) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const proxyUrl = typeof body?.proxyUrl === "string" ? body.proxyUrl.trim() : "";
  const noProxy = typeof body?.noProxy === "string" ? body.noProxy.trim() : "";
  const isActive = body?.isActive === undefined ? true : body.isActive === true;
  const strictProxy = body?.strictProxy === true;
  const type = VALID_PROXY_TYPES.includes(body?.type) ? body.type : "http";

  if (!name) {
    return { error: "Name is required" };
  }

  if (!proxyUrl) {
    return { error: "Proxy URL is required" };
  }

  return { name, proxyUrl, noProxy, isActive, strictProxy, type };
}

function buildUsageMap(connections = []) {
  const usageMap = new Map();

  for (const connection of connections) {
    const proxyPoolId = connection?.providerSpecificData?.proxyPoolId;
    if (!proxyPoolId) continue;

    usageMap.set(proxyPoolId, (usageMap.get(proxyPoolId) || 0) + 1);
  }

  return usageMap;
}

// GET /api/proxy-pools - List proxy pools
// Optional pagination: page (>=1), pageSize (1-100). When either is present the
// response is sliced and includes a `pagination` block; without them the full
// list is returned (backwards compatible with existing consumers).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const isActive = toBoolean(searchParams.get("isActive"));
    const includeUsage = searchParams.get("includeUsage") === "true";

    const pageRaw = parseInt(searchParams.get("page"), 10);
    const pageSizeRaw = parseInt(searchParams.get("pageSize"), 10);
    const paginated = !Number.isNaN(pageRaw) || !Number.isNaN(pageSizeRaw);
    const page = Number.isNaN(pageRaw) ? 1 : pageRaw;
    const pageSize = Number.isNaN(pageSizeRaw) ? 20 : pageSizeRaw;

    if (paginated && page < 1) {
      return NextResponse.json({ error: "Page must be >= 1" }, { status: 400 });
    }

    if (paginated && (pageSize < 1 || pageSize > 100)) {
      return NextResponse.json({ error: "PageSize must be between 1 and 100" }, { status: 400 });
    }

    const filter = {};
    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    const proxyPools = await getProxyPools(filter);

    let results = proxyPools;
    if (includeUsage) {
      const connections = await getProviderConnections();
      const usageMap = buildUsageMap(connections);

      results = proxyPools.map((pool) => ({
        ...pool,
        boundConnectionCount: usageMap.get(pool.id) || 0,
      }));
    }

    if (!paginated) {
      return NextResponse.json({ proxyPools: results });
    }

    const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
    const activeCount = (await getProxyPools({ isActive: true })).length;

    return NextResponse.json({
      proxyPools: results.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, pageSize, total: results.length, totalPages, activeCount },
    });
  } catch (error) {
    console.log("Error fetching proxy pools:", error);
    return NextResponse.json({ error: "Failed to fetch proxy pools" }, { status: 500 });
  }
}

// POST /api/proxy-pools - Create proxy pool
export async function POST(request) {
  try {
    const body = await request.json();
    const normalized = normalizeProxyPoolInput(body);

    if (normalized.error) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const proxyPool = await createProxyPool(normalized);
    return NextResponse.json({ proxyPool }, { status: 201 });
  } catch (error) {
    console.log("Error creating proxy pool:", error);
    return NextResponse.json({ error: "Failed to create proxy pool" }, { status: 500 });
  }
}
