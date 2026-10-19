"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";
import { useTimezone } from "@/shared/hooks/useTimezone";

const LEVEL_STYLES = {
  error: { chip: "bg-red-500/20 border border-red-500/30 text-red-400 font-bold", text: "text-red-300" },
  warn: { chip: "bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold", text: "text-amber-200/90" },
  info: { chip: "bg-sky-500/20 border border-sky-500/30 text-sky-400 font-bold", text: "text-sky-200/90" },
  debug: { chip: "bg-purple-500/20 border border-purple-500/30 text-purple-400 font-bold", text: "text-purple-300/90" },
  log: { chip: "bg-white/5 border border-white/10 text-neutral-400", text: "text-neutral-300" },
};

const FILTERS = ["all", "error", "warn", "info", "debug", "log"];

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
      try {
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
      } catch (err) {
        console.error("Failed to parse console log SSE message:", err);
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
    <div className="font-mono">
      <div className="rounded-none border border-[var(--color-hairline)] bg-[var(--color-surface)] overflow-hidden">
        {/* Hardware Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-hairline)] bg-[var(--color-canvas)]">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-surface)]">
              <span className="relative flex h-2 w-2">
                {connected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-[var(--color-success)] opacity-75" />
                )}
                <span className={`relative inline-flex h-2 w-2 ${connected ? "bg-[var(--color-success)]" : "bg-[var(--color-danger)]"}`} />
              </span>
              <span className="font-bold text-[11px] text-[var(--color-ink)] uppercase tracking-wider">
                {connected ? "Live Stream" : "Disconnected"}
              </span>
            </div>

            <div className="inline-flex items-center gap-1 rounded-[4px] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-[4px] text-[11px] uppercase tracking-wider font-bold transition-all duration-150 cursor-pointer ${
                    filter === f
                      ? "bg-[var(--color-primary)] text-[var(--color-on-primary)]"
                      : "text-[var(--color-mute)] hover:text-[var(--color-ink)] hover:bg-[var(--color-canvas)]"
                  }`}
                >
                  {f}
                  {counts[f] ? <span className="ml-1 opacity-70 font-normal">({counts[f]})</span> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] text-[var(--color-ash)] bg-[var(--color-surface)] border border-[var(--color-hairline)]">
              MAX: {CONSOLE_LOG_CONFIG.maxLines} LINES
            </span>
            <Button size="sm" variant="outline" icon="delete" onClick={handleClear} className="h-7 rounded-[4px] text-xs font-medium cursor-pointer">
              Clear
            </Button>
          </div>
        </div>

        {/* Terminal Screen */}
        <div
          ref={logRef}
          onScroll={onScroll}
          className="bg-[#050508] px-4 py-3 text-xs leading-5 h-[calc(100vh-230px)] overflow-y-auto custom-scrollbar"
        >
          {visible.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-500 text-xs gap-2">
              <span className="material-symbols-outlined text-[28px] opacity-30">terminal</span>
              <span>
                {entries.length === 0 ? "Listening for gateway events…" : "No log lines match current filter."}
              </span>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.02]">
              {visible.map((entry, i) => {
                const level = detectLevel(entry);
                const style = LEVEL_STYLES[level] || LEVEL_STYLES.log;
                return (
                  <div
                    key={i}
                    className="flex items-baseline gap-2.5 py-1 hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="shrink-0 select-none text-neutral-500 tabular-nums text-[11px]">
                      {fmtTime(entry.t, timeZone)}
                    </span>
                    <span
                      className={`shrink-0 w-12 select-none rounded px-1.5 py-0.5 text-center text-[10px] uppercase tracking-wider ${
                        style.chip
                      }`}
                    >
                      {level}
                    </span>
                    <span className={`min-w-0 flex-1 whitespace-pre-wrap break-all ${style.text}`}>
                      {stripLeadingTime(entry.text)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
