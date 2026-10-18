"use client";

import { Input } from "@/shared/components";

/** Reusable endpoint row component */
export default function EndpointRow({ label, url, copyId, copied, onCopy, badge, actions }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex items-center justify-center h-10 w-28 shrink-0 text-[13px] font-mono text-center border border-[var(--color-hairline)] ${
          (badge === "CF" || badge === "TS")
            ? "bg-[var(--color-surface-soft)] text-[var(--color-ink)] font-bold"
            : "bg-[var(--color-surface-card)] text-[var(--color-mute)]"
        }`}
        style={{ borderRadius: "4px" }}
      >
        {label}
      </span>
      <Input value={url} readOnly className="flex-1 font-mono text-sm" />
      <button
        onClick={() => onCopy(url, copyId)}
        className="flex items-center justify-center h-10 w-10 hover:bg-black/5 dark:hover:bg-white/5 border border-[var(--color-hairline)] text-[var(--color-mute)] hover:text-[var(--color-ink)] transition-colors shrink-0"
        style={{ borderRadius: "4px" }}
      >
        <span className="material-symbols-outlined text-[18px]">{copied === copyId ? "check" : "content_copy"}</span>
      </button>
      {actions}
    </div>
  );
}
