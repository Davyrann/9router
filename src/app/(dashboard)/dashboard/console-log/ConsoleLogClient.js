"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";
import { useTimezone } from "@/shared/hooks/useTimezone";

const LEVEL_STYLES = {
  error: { chip: "bg-red-500/15 text-red-400", text: "text-red-300" },
  warn: { chip: "bg-yellow-500/15 text-yellow-400", text: "text-yellow-200/90" },
  info: { chip: "bg-sky-500/15 text-sky-400", text: "text-sky-200/90" },
  debug: { chip: "bg-purple-500/15 text-purple-400", text: "text-purple-300/90" },
  log: { chip: "bg-white/5 text-gray-400", text: "text-gray-300" },
};

const FILTERS = ["all", "error", "warn", "info", "log"];

function normalize(entry) {
  if (typeof entry === "string") return { level: "log", t: Date.now(), text: entry };
  return { level: entry.level || "log", t: entry.t || Date.now(), text: entry.text || "" };
}

// logger.js writes its own "[14:23:01] " prefix — we show a real timestamp column, so strip it
function stripLeadingTime(text) {
  return text.replace(/^\[\d{1,2}:\d{2}:\d{2}(?:\s?[AP]M)?\]\s*/, "");
}

// Some errors go through console.log (errorLine) — flag them by content
function detectLevel(entry) {
  if (entry.level !== "log") return entry.level;
  if (/✗|❌|ERROR\b|BLOCKED|ABORTED/.test(entry.text)) return "error";
  if (/⚠️|\bWARN\b/.test(entry.text)) return "warn";
  return "log";
}

function fmtTime(t, timeZone) {
  const d = new Date(t);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || "00";
  return `${get("hour")}:${get("minute")}:${get("second")}.${pad(d.getMilliseconds(), 3)}`;
}

export default function ConsoleLogClient() {
  const { timeZone } = useTimezone();
  const [entries, setEntries] = useState([]);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState("all");
  const logRef = useRef(null);
  const stickToBottomRef = useRef(true);

  const handleClear = async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
      // UI cleared via SSE "clear" event
    } catch (err) {
      console.error("Failed to clear console logs:", err);
    }
  };

  useEffect(() => {
    const es = new EventSource("/api/translator/console-logs/stream");

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      const max = CONSOLE_LOG_CONFIG.maxLines;
      if (msg.type === "init") {
        setEntries(msg.logs.slice(-max).map(normalize));
      } else if (msg.type === "line") {
        setEntries((prev) => {
          const next = [...prev, normalize(msg.line)];
          return next.length > max ? next.slice(-max) : next;
        });
      } else if (msg.type === "lines") {
        setEntries((prev) => {
          const next = [...prev, ...msg.lines.map(normalize)];
          return next.length > max ? next.slice(-max) : next;
        });
      } else if (msg.type === "clear") {
        setEntries([]);
      }
    };

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, []);

  // Auto-scroll only when the user is already at the bottom
  useEffect(() => {
    const el = logRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [entries, filter]);

  const onScroll = () => {
    const el = logRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const visible = filter === "all" ? entries : entries.filter((e) => detectLevel(e) === filter);
  const counts = entries.reduce((acc, e) => {
    acc[detectLevel(e)] = (acc[detectLevel(e)] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="">
      <Card>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
          <span
            className={`inline-flex items-center gap-1.5 text-xs ${
              connected ? "text-emerald-400" : "text-red-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`}
            />
            {connected ? "Live" : "Disconnected"}
          </span>

          <div className="ml-2 flex items-center gap-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded px-2 py-0.5 text-xs capitalize transition-colors ${
                  filter === f
                    ? "bg-white/10 text-white"
                    : "text-text-muted hover:bg-white/5 hover:text-white"
                }`}
              >
                {f}
                {counts[f] ? <span className="ml-1 opacity-60">{counts[f]}</span> : null}
              </button>
            ))}
          </div>

          <div className="ml-auto">
            <Button size="sm" variant="outline" icon="delete" onClick={handleClear}>
              Clear
            </Button>
          </div>
        </div>

        <div
          ref={logRef}
          onScroll={onScroll}
          className="bg-black rounded-b-lg px-4 py-3 text-xs font-mono leading-5 h-[calc(100vh-220px)] overflow-y-auto"
        >
          {visible.length === 0 ? (
            <span className="text-text-muted">
              {entries.length === 0 ? "No console logs yet." : "No lines match this filter."}
            </span>
          ) : (
            <div>
              {visible.map((entry, i) => {
                const level = detectLevel(entry);
                const style = LEVEL_STYLES[level] || LEVEL_STYLES.log;
                return (
                  <div
                    key={i}
                    className="flex gap-2 border-b border-white/[0.03] py-px hover:bg-white/[0.03]"
                  >
                    <span className="shrink-0 select-none text-gray-600 tabular-nums">
                      {fmtTime(entry.t, timeZone)}
                    </span>
                    <span
                      className={`shrink-0 w-11 select-none rounded px-1 text-center uppercase ${
                        style.chip
                      }`}
                    >
                      {level}
                    </span>
                    <span className={`min-w-0 whitespace-pre-wrap break-all ${style.text}`}>
                      {stripLeadingTime(entry.text)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
