// Regression: Telegram backup reported "Bad Request: message text is empty".
// Cause: telegram.js built the form with the GLOBAL FormData (Node's bundled
// undici) but sent it with node_modules/undici's fetch. That fetch identifies
// FormData by instanceof, so the form was stringified to "[object FormData]"
// and sent as text/plain — Telegram parsed no fields at all.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { sendTelegramDocument, sendTelegramMessage } from "../../src/lib/backup/telegram.js";

let agent, prev, captured;

beforeEach(() => {
  prev = getGlobalDispatcher();
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  captured = [];
  const pool = agent.get("https://api.telegram.org");
  const reply = (opts) => {
    captured.push({ contentType: String(opts.headers?.["content-type"] ?? ""), body: opts.body });
    return { data: JSON.stringify({ ok: true, result: { message_id: 7 } }) };
  };
  pool.intercept({ path: "/botTEST/sendMessage", method: "POST" }).reply(200, reply);
  pool.intercept({ path: "/botTEST/sendDocument", method: "POST" }).reply(200, reply);
});

afterEach(async () => {
  await agent.close();
  setGlobalDispatcher(prev);
});

// FormData entries: strings as-is, file parts reduced to their filename.
function fields(body) {
  const out = {};
  for (const [k, v] of body) out[k] = typeof v === "string" ? v : v.name;
  return out;
}

describe("telegram request body", () => {
  it("sendMessage sends a multipart form with chat_id and text", async () => {
    const res = await sendTelegramMessage({ botToken: "TEST", chatId: "123", text: "hello" });
    expect(res.ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(fields(captured[0].body)).toEqual({ chat_id: "123", text: "hello" });
  });

  it("sendDocument sends a multipart form with caption and the document file", async () => {
    const res = await sendTelegramDocument({
      botToken: "TEST",
      chatId: "-100123",
      filename: "9router-backup.json",
      content: '{"a":1}',
      caption: "9Router backup (manual) — v1.0.0",
    });
    expect(res.ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(fields(captured[0].body)).toEqual({
      chat_id: "-100123",
      caption: "9Router backup (manual) — v1.0.0",
      document: "9router-backup.json",
    });
  });

  it("rejects an empty message text before calling Telegram", async () => {
    const res = await sendTelegramMessage({ botToken: "TEST", chatId: "123", text: "   " });
    expect(res).toEqual({ ok: false, error: "Message text is empty" });
    expect(captured).toHaveLength(0);
  });
});
