// Proxy Pools API — pagination + input validation (dashboard Proxy tab).
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/models", () => ({
  getProxyPools: vi.fn(),
  getProviderConnections: vi.fn(),
  createProxyPool: vi.fn(),
  getProxyPoolById: vi.fn(),
  updateProxyPool: vi.fn(),
  deleteProxyPool: vi.fn(),
}));

const { getProxyPools, getProviderConnections, createProxyPool } = await import("@/models");
const { GET, POST } = await import("../../src/app/api/proxy-pools/route.js");

const TOTAL = 25;

// isActive=false on every 3rd pool → 8 inactive, 17 active.
function makePools() {
  return Array.from({ length: TOTAL }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Pool ${i + 1}`,
    proxyUrl: `http://127.0.0.1:${7000 + i}`,
    isActive: (i + 1) % 3 !== 0,
    testStatus: "active",
  }));
}

const getPools = (url) => GET(new Request(`http://localhost/api/proxy-pools${url}`));
const postPool = (body) =>
  POST(new Request("http://localhost/api/proxy-pools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  const pools = makePools();
  getProxyPools.mockImplementation(async (filter = {}) => (
    filter.isActive === undefined ? pools : pools.filter((p) => p.isActive === filter.isActive)
  ));
  getProviderConnections.mockResolvedValue([
    { providerSpecificData: { proxyPoolId: "p1" } },
    { providerSpecificData: { proxyPoolId: "p1" } },
    { providerSpecificData: { proxyPoolId: "p9" } },
  ]);
  createProxyPool.mockImplementation(async (data) => ({ id: "new-pool", ...data }));
});

describe("GET /api/proxy-pools pagination", () => {
  it("without page/pageSize returns the full list and no pagination block", async () => {
    const res = await getPools("?includeUsage=true");
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.proxyPools).toHaveLength(TOTAL);
    expect(data.pagination).toBeUndefined();
    expect(data.proxyPools[0].boundConnectionCount).toBe(2);
  });

  it("slices the requested page and reports pagination metadata", async () => {
    const res = await getPools("?page=2&pageSize=10");
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.proxyPools.map((p) => p.id)).toEqual([
      "p11", "p12", "p13", "p14", "p15", "p16", "p17", "p18", "p19", "p20",
    ]);
    expect(data.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 25,
      totalPages: 3,
      activeCount: 17,
    });
  });

  it("last page is partial", async () => {
    const res = await getPools("?page=3&pageSize=10");
    const data = await res.json();

    expect(data.proxyPools).toHaveLength(5);
    expect(data.pagination.totalPages).toBe(3);
  });

  it("paginates with includeUsage and keeps bound connection counts", async () => {
    const res = await getPools("?page=1&pageSize=1&includeUsage=true");
    const data = await res.json();

    expect(data.proxyPools).toHaveLength(1);
    expect(data.proxyPools[0].id).toBe("p1");
    expect(data.proxyPools[0].boundConnectionCount).toBe(2);
  });

  it("filters by isActive and reports global activeCount", async () => {
    const res = await getPools("?isActive=true&page=1&pageSize=100");
    const data = await res.json();

    expect(data.proxyPools).toHaveLength(17);
    expect(data.pagination.total).toBe(17);
    expect(data.pagination.activeCount).toBe(17);
  });

  it("pageSize only still paginates from page 1", async () => {
    const res = await getPools("?pageSize=10");
    const data = await res.json();

    expect(data.proxyPools).toHaveLength(10);
    expect(data.pagination.page).toBe(1);
  });

  it.each([
    ["?page=0&pageSize=10", "Page must be >= 1"],
    ["?page=-1&pageSize=10", "Page must be >= 1"],
    ["?page=1&pageSize=0", "PageSize must be between 1 and 100"],
    ["?page=1&pageSize=101", "PageSize must be between 1 and 100"],
  ])("rejects %s with 400", async (query, message) => {
    const res = await getPools(query);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe(message);
  });
});

describe("POST /api/proxy-pools validation", () => {
  it("requires a name", async () => {
    const res = await postPool({ proxyUrl: "http://127.0.0.1:7897" });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Name is required");
  });

  it("requires a proxy URL", async () => {
    const res = await postPool({ name: "Office" });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Proxy URL is required");
  });

  it("creates a pool with normalized defaults", async () => {
    const res = await postPool({ name: "  Office  ", proxyUrl: " http://127.0.0.1:7897 " });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.proxyPool).toMatchObject({
      id: "new-pool",
      name: "Office",
      proxyUrl: "http://127.0.0.1:7897",
      noProxy: "",
      isActive: true,
      strictProxy: false,
      type: "http",
    });
  });
});
