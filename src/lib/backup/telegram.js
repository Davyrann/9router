// Minimal Telegram Bot API client for backup delivery.
// Fail-open: every function returns { ok, error } and never throws.
//
// Uses undici's fetch DIRECTLY, not the app's patched global fetch: proxyFetch
// replaces `globalThis.fetch` and logs the full request URL on TLS-certificate
// failures — and the Bot API token lives in that URL path. Going straight to
// undici keeps the token out of the server log. Trade-off: Telegram calls do not
// traverse the app's outbound proxy.

import { fetch as undiciFetch, FormData as UndiciFormData } from "undici";

const API_BASE = "https://api.telegram.org";

// Build the form with undici's OWN FormData, never the global one. Node's global
// FormData comes from Node's bundled undici — a different class than the
// `undici` package this file imports. undici's fetch body extractor identifies
// FormData by `instanceof` (webidl.is.FormData), so a global FormData falls
// through and the request body is sent as the literal string "[object FormData]"
// with Content-Type: text/plain. Telegram then parses no fields at all and
// answers "Bad Request: message text is empty".

function apiUrl(botToken, method) {
  return `${API_BASE}/bot${botToken}/${method}`;
}

// Some fetch failures embed the full request URL — which contains the bot token.
// Never let that reach a log line, a settings field, or an API response.
export function safeErrorMessage(error) {
  const msg = error?.name === "AbortError" ? "Request timed out" : (error?.message || "Request failed");
  return String(msg).replace(/bot[0-9A-Za-z:_-]{4,}/g, "bot<redacted>");
}

async function callTelegram(botToken, method, init, timeoutMs) {
  if (!botToken) return { ok: false, error: "Missing bot token" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await undiciFetch(apiUrl(botToken, method), { ...init, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: data?.description || `HTTP ${res.status}` };
    }
    return { ok: true, messageId: data?.result?.message_id ?? null };
  } catch (e) {
    return { ok: false, error: safeErrorMessage(e) };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendTelegramDocument({ botToken, chatId, filename, content, caption = "", timeoutMs = 30000 }) {
  if (!chatId) return { ok: false, error: "Missing chat ID" };
  const form = new UndiciFormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption.slice(0, 1024));
  form.append("document", new Blob([content], { type: "application/json" }), filename);
  return callTelegram(botToken, "sendDocument", { method: "POST", body: form }, timeoutMs);
}

export async function sendTelegramMessage({ botToken, chatId, text, timeoutMs = 15000 }) {
  if (!chatId) return { ok: false, error: "Missing chat ID" };
  if (!String(text ?? "").trim()) return { ok: false, error: "Message text is empty" };
  const form = new UndiciFormData();
  form.append("chat_id", String(chatId));
  form.append("text", text);
  return callTelegram(botToken, "sendMessage", { method: "POST", body: form }, timeoutMs);
}
