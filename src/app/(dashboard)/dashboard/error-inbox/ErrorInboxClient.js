"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button } from "@/shared/components";

function statusTone(status) {
  const code = parseInt(status, 10);
  if (code >= 500) return "bg-red-500/15 text-red-400 border-red-500/30";
  if (code >= 400) return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
  return "bg-blue-500/15 text-blue-400 border-blue-500/30";
}

export default function ErrorInboxClient() {
  const [items, setItems] = useState([]);
  const [facets, setFacets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/error-inbox", { cache: "no-store" });
      const data = await res.json();
      setItems(data.items || []);
      setFacets(data.facets || []);
    } catch (err) {
      console.error("Failed to load error inbox:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (item) => {
    const action = item.resolved ? "unpin" : "pin";
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, resolved: !i.resolved } : i)),
    );
    try {
      await fetch("/api/error-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: [item.id] }),
      });
    } catch (err) {
      console.error("Failed to update inbox:", err);
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, resolved: item.resolved } : i)),
      );
    }
  };

  const visible = items.filter((i) => {
    if (!showResolved && i.resolved) return false;
    if (statusFilter && i.status !== statusFilter) return false;
    return true;
  });

  const openCount = items.filter((i) => !i.resolved).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Inbox Error</h1>
          <p className="text-sm text-gray-400 mt-1">
            {loading
              ? "Loading…"
              : `${openCount} error menunggu, ${items.length - openCount} sudah ditangani`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-gray-300"
          >
            <option value="">Semua status</option>
            {facets.map((f) => (
              <option key={f.status} value={f.status}>
                {f.status} ({f.count})
              </option>
            ))}
          </select>
          <Button onClick={() => setShowResolved((v) => !v)} variant="secondary" size="sm">
            {showResolved ? "Sembunyikan yang selesai" : "Tampilkan yang selesai"}
          </Button>
          <Button onClick={load} variant="secondary" size="sm">
            Muat ulang
          </Button>
        </div>
      </div>

      <Card className="p-0">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Memuat error…</div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Bersih — tidak ada error yang cocok.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {visible.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] ${
                  item.resolved ? "opacity-50" : ""
                }`}
              >
                <span
                  className={`text-xs font-mono border rounded px-1.5 py-0.5 shrink-0 ${statusTone(item.status)}`}
                >
                  {item.status}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white truncate">{item.model}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {item.provider} · {item.endpoint} ·{" "}
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                </div>
                <Button
                  onClick={() => toggle(item)}
                  variant={item.resolved ? "secondary" : "primary"}
                  size="sm"
                >
                  {item.resolved ? "Buka lagi" : "Tandai beres"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}