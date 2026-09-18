import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { SSE_DONE, SSE_HEADERS_NO_BUFFER } from "../utils/sseConstants.js";
import { sseChunk } from "../utils/sse.js";
import { findDeepSeekPowNonce } from "../lib/deepseek-pow-hash.js";

const DEEPSEEK_WEB_BASE = "https://chat.deepseek.com";
const DEEPSEEK_API_BASE = `${DEEPSEEK_WEB_BASE}/api`;
const COMPLETION_URL = `${DEEPSEEK_API_BASE}/v0/chat/completion`;

const FAKE_HEADERS = {
  Accept: "*/*",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: DEEPSEEK_WEB_BASE,
  Referer: `${DEEPSEEK_WEB_BASE}/`,
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  "X-Client-Bundle-Id": "com.deepseek.chat",
  "X-Client-Locale": "en-US",
  "X-Client-Platform": "web",
  "X-Client-Version": "2.0.0",
};

const tokenCache = new Map();
const CACHE_MAX = 100;

function evictOldest(cache) {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
}

function extractUserToken(raw) {
  if (!raw) return null;
  let str = String(raw).trim();
  if (str.startsWith("{")) {
    try {
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed.value === "string") return parsed.value;
    } catch {}
  }
  if (str.includes("userToken=")) {
    const m = str.match(/userToken=([^;]+)/);
    if (m) return m[1].trim();
  }
  if (str.startsWith("Bearer ")) str = str.slice(7).trim();
  str = str.replace(/^["']|["']$/g, "").trim();
  return str || null;
}

function extractMessageText(content) {
  if (Array.isArray(content)) {
    return content.filter((c) => c.type === "text").map((c) => String(c.text || "")).join("\n");
  }
  return String(content || "");
}

function messagesToPrompt(messages) {
  if (!messages || messages.length === 0) return "";
  const systemParts = [];
  const conversation = [];
  let lastUserContent = "";
  for (const m of messages) {
    const text = extractMessageText(m.content).trim();
    if (m.role === "system") {
      if (text) systemParts.push(text);
    } else if (m.role === "user" || m.role === "assistant") {
      if (text) conversation.push({ role: m.role, text });
      if (m.role === "user") lastUserContent = text;
    } else if (m.role === "tool") {
      if (text) conversation.push({ role: "tool", text: `(${m.name || "tool"}) ${text}` });
    } else if (m.role === "developer") {
      if (text) systemParts.push(text);
    }
  }
  const parts = [];
  if (systemParts.length > 0) parts.push(systemParts.join("\n\n"));
  const window = conversation.length > 1 ? 20 : 0;
  if (window > 0 && conversation.length > 1) {
    const recent = conversation.slice(-window);
    const transcript = recent.map((turn) =>
      turn.role === "assistant" ? `Assistant: ${turn.text}`
      : turn.role === "tool" ? `Tool result ${turn.text}`
      : `User: ${turn.text}`
    ).join("\n\n");
    parts.push(transcript);
  } else if (lastUserContent) {
    parts.push(lastUserContent);
  }
  return parts.join("\n\n").replace(/!\[.*?\]\(.*?\)/g, "");
}

function resolveModelOptions(model, bodyObj) {
  const m = (model || "").toLowerCase();
  const modelType = m.includes("pro") || m.includes("expert") ? "expert" : "default";
  const thinkingEnabled =
    m.includes("r1") || m.includes("think") || m.includes("reason") ||
    bodyObj?.thinking_enabled === true || bodyObj?.thinking === true || !!bodyObj?.reasoning_effort;
  const searchEnabled =
    m.includes("search") || bodyObj?.search_enabled === true || bodyObj?.search === true;
  return { modelType, thinkingEnabled, searchEnabled };
}

function generateFakeCookie() {
  const ts = Date.now();
  const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const uid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
  return `intercom-HWWAFSESTIME=${ts}; HWWAFSESID=${hex(18)}; Hm_lvt_${uid()}=${Math.floor(ts / 1000)}; _frid=${uid()}`;
}

async function acquireAccessToken(userToken, signal, log) {
  const cached = tokenCache.get(userToken);
  if (cached && cached.expiresAt > Math.floor(Date.now() / 1000)) return cached.accessToken;

  log?.info?.("DEEPSEEK-WEB", "Acquiring access token from /users/current...");
  const resp = await fetch(`${DEEPSEEK_API_BASE}/v0/users/current`, {
    headers: { Authorization: `Bearer ${userToken}`, ...FAKE_HEADERS },
    signal: signal ?? undefined,
  });

  if (resp.status === 401 || resp.status === 403) {
    throw new Error("Token invalid or expired. Get a new userToken from DeepSeek localStorage");
  }
  if (!resp.ok) throw new Error(`users/current HTTP ${resp.status}`);

  const json = await resp.json();
  if (json?.code && json.code !== 0) {
    tokenCache.delete(userToken);
    throw new Error(`DeepSeek rejected token: ${json.msg || json?.data?.biz_msg || `code ${json.code}`}`);
  }
  const bizData = json?.data?.biz_data || json?.biz_data;
  if (!bizData?.token) {
    throw new Error(`Failed to acquire access token: ${json?.msg || json?.data?.biz_msg || "unknown"}`);
  }

  const accessToken = bizData.token;
  evictOldest(tokenCache);
  tokenCache.set(userToken, { accessToken, expiresAt: Math.floor(Date.now() / 1000) + 3600 });
  log?.info?.("DEEPSEEK-WEB", `Access token acquired (${accessToken.length} chars)`);
  return accessToken;
}

async function createSession(accessToken, signal) {
  const resp = await fetch(`${DEEPSEEK_API_BASE}/v0/chat_session/create`, {
    method: "POST",
    headers: { ...FAKE_HEADERS, "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, Cookie: generateFakeCookie() },
    body: JSON.stringify({}),
    signal: signal ?? undefined,
  });
  if (!resp.ok) throw new Error(`chat_session/create HTTP ${resp.status}`);
  const json = await resp.json();
  const bizData = json?.data?.biz_data || json?.biz_data;
  const id = bizData?.chat_session?.id;
  if (!id) throw new Error(`No session id: code=${json?.code}`);
  return id;
}

async function deleteSession(accessToken, sessionId) {
  try {
    await fetch(`${DEEPSEEK_API_BASE}/v0/chat_session/delete`, {
      method: "POST",
      headers: { ...FAKE_HEADERS, "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ chat_session_id: sessionId }),
    });
  } catch {}
}

async function getPowChallenge(accessToken, signal) {
  const resp = await fetch(`${DEEPSEEK_API_BASE}/v0/chat/create_pow_challenge`, {
    method: "POST",
    headers: { ...FAKE_HEADERS, "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ target_path: "/api/v0/chat/completion" }),
    signal: signal ?? undefined,
  });
  if (!resp.ok) throw new Error(`create_pow_challenge HTTP ${resp.status}`);
  const json = await resp.json();
  const bizData = json?.data?.biz_data || json?.biz_data;
  if (!bizData?.challenge?.challenge) throw new Error(`No PoW challenge: code=${json?.code}`);
  return bizData.challenge;
}

async function solvePow(challenge, signal) {
  const { algorithm, challenge: challengeStr, salt, difficulty, expire_at, signature, target_path } = challenge;
  if (algorithm !== "DeepSeekHashV1") throw new Error(`Unsupported PoW algorithm: ${algorithm}`);
  const prefix = `${salt}_${expire_at}_`;
  const answer = findDeepSeekPowNonce(prefix, challengeStr.toLowerCase(), difficulty);
  if (answer < 0) throw new Error("PoW solver failed");
  return Buffer.from(JSON.stringify({ algorithm, challenge: challengeStr, salt, answer, signature, target_path })).toString("base64");
}

function isThinkingModel(model) {
  const m = (model || "").toLowerCase();
  return m.includes("think") || m.includes("r1") || m.includes("reason");
}

function cleanToken(text) {
  return text.replace(/FINISHED/g, "").replace(/^(SEARCH|WEB_SEARCH|SEARCHING)\s*/i, "");
}

function processLine(line) {
  if (!line) return null;
  let payload = line.trim();
  if (!payload.startsWith("data:") && !payload.startsWith("data: ")) return null;
  payload = payload.replace(/^data:\s*/, "").trim();
  if (!payload || payload === "[DONE]") return null;
  try { return JSON.parse(payload); } catch { return null; }
}

function extractContent(data, thinkingModel) {
  let text = "";
  let thinking = "";
  let currentPath = "";
  let isFinished = false;

  const p = data?.p;
  const v = data?.v;
  const o = data?.o;

  if (v && typeof v === "object" && v.response) {
    if (v.response.thinking_enabled === true) currentPath = "thinking";
    else if (v.response.thinking_enabled === false) currentPath = "content";
    if (Array.isArray(v.response.fragments)) {
      for (const frag of v.response.fragments) {
        const type = String(frag?.type || "").toUpperCase();
        if (type === "THINK") currentPath = "thinking";
        else if (type === "ANSWER" || type === "RESPONSE") currentPath = "content";
        const c = frag?.content || "";
        if (!c) continue;
        const cleaned = cleanToken(c);
        if (!cleaned) continue;
        if (currentPath === "thinking") thinking += cleaned;
        else text += cleaned;
      }
    }
  }

  if (p === "response/fragments") {
    const frags = Array.isArray(v) ? v : (v && typeof v === "object" ? [v] : []);
    for (const frag of frags) {
      const type = String(frag?.type || "").toUpperCase();
      if (type === "THINK") currentPath = "thinking";
      else if (type === "ANSWER" || type === "RESPONSE") currentPath = "content";
      const c = frag?.content || "";
      if (!c) continue;
      const cleaned = cleanToken(c);
      if (!cleaned) continue;
      if (currentPath === "thinking") thinking += cleaned;
      else text += cleaned;
    }
  }

  if (p === "response/status" && v === "FINISHED") {
    isFinished = true;
  }

  if (typeof v === "string") {
    const cleaned = cleanToken(v);
    if (cleaned) {
      if (!currentPath && thinkingModel) currentPath = "thinking";
      if (currentPath === "thinking") thinking += cleaned;
      else text += cleaned;
    }
  }

  if (Array.isArray(v) && p === "response") {
    for (const entry of v) {
      if (Array.isArray(entry?.v)) {
        const joined = entry.v.map((item) => item?.content || "").join("");
        if (joined) {
          const cleaned = cleanToken(joined);
          if (cleaned) text += cleaned;
        }
      }
    }
  }

  return { text, thinking, isFinished };
}

export class DeepSeekWebExecutor extends BaseExecutor {
  constructor() {
    super("deepseek-web", { baseUrl: DEEPSEEK_WEB_BASE });
  }

  async execute({ model, body, stream, credentials, signal, log }) {
    const bodyObj = body || {};
    const userToken = extractUserToken(credentials?.apiKey || credentials?.token);
    if (!userToken) {
      const errResp = new Response(JSON.stringify({
        error: { message: "Invalid credentials: paste your userToken from DeepSeek localStorage", type: "invalid_request_error" }
      }), { status: 400, headers: { "Content-Type": "application/json" } });
      return { response: errResp, url: COMPLETION_URL, headers: {}, transformedBody: body };
    }

    const messages = Array.isArray(bodyObj.messages) ? bodyObj.messages : [];
    const prompt = messagesToPrompt(messages);
    if (!prompt.trim()) {
      const errResp = new Response(JSON.stringify({
        error: { message: "Prompt is empty", type: "invalid_request_error" }
      }), { status: 400, headers: { "Content-Type": "application/json" } });
      return { response: errResp, url: COMPLETION_URL, headers: {}, transformedBody: body };
    }

    const { modelType, thinkingEnabled, searchEnabled } = resolveModelOptions(model, bodyObj);
    const thinkingModel = isThinkingModel(model);

    try {
      const accessToken = await acquireAccessToken(userToken, signal, log);
      const sessionId = await createSession(accessToken, signal);
      const powChallenge = await getPowChallenge(accessToken, signal);
      const powAnswer = await solvePow(powChallenge, signal);

      const reqHeaders = {
        ...FAKE_HEADERS,
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Ds-Pow-Response": powAnswer,
        "X-Client-Timezone-Offset": String(new Date().getTimezoneOffset() * -60),
        Cookie: generateFakeCookie(),
      };

      const requestPayload = {
        chat_session_id: sessionId,
        parent_message_id: null,
        model_type: modelType,
        prompt,
        ref_file_ids: [],
        thinking_enabled: thinkingEnabled,
        search_enabled: searchEnabled,
        preempt: false,
      };

      log?.info?.("DEEPSEEK-WEB", `POST ${COMPLETION_URL} (model=${model}, thinking=${thinkingEnabled})`);
      const resp = await fetch(COMPLETION_URL, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify(requestPayload),
        signal: signal ?? undefined,
      });

      if (!resp.ok) {
        let errMsg = `DeepSeek API error (${resp.status})`;
        if (resp.status === 401 || resp.status === 403) {
          tokenCache.delete(userToken);
          errMsg = "DeepSeek token expired. Get a fresh userToken from localStorage.";
        } else if (resp.status === 429) {
          errMsg = "DeepSeek rate limited. Wait and retry.";
        }
        try {
          const errBody = await resp.json();
          if (errBody?.code && errBody.code !== 0) errMsg = `DeepSeek error ${errBody.code}: ${errBody.msg}`;
        } catch {}
        await deleteSession(accessToken, sessionId);
        const errResp = new Response(JSON.stringify({ error: { message: errMsg, type: "upstream_error" } }), { status: resp.status, headers: { "Content-Type": "application/json" } });
        return { response: errResp, url: COMPLETION_URL, headers: reqHeaders, transformedBody: requestPayload };
      }

      const ct = resp.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        try {
          const json = await resp.json();
          if (json?.code && json.code !== 0) {
            await deleteSession(accessToken, sessionId);
            const errMsg = `DeepSeek error ${json.code}: ${json.msg}`;
            const status = json.code === 40003 ? 401 : json.code === 40002 ? 429 : 502;
            if (json.code === 40003) tokenCache.delete(userToken);
            const errResp = new Response(JSON.stringify({ error: { message: errMsg, type: "upstream_error" } }), { status, headers: { "Content-Type": "application/json" } });
            return { response: errResp, url: COMPLETION_URL, headers: reqHeaders, transformedBody: requestPayload };
          }
        } catch {}
      }

      const created = Math.floor(Date.now() / 1000);
      const responseId = `chatcmpl-dsw-${Math.random().toString(36).slice(2, 8)}`;
      const clientModel = (model || "deepseek-web").trim();

      if (stream !== false) {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let streamBuffer = "";
        let emittedRole = false;
        let finished = false;

        const openaiStream = new ReadableStream({
          async start(controller) {
            const reader = resp.body.getReader();
            const ensureRole = () => {
              if (!emittedRole) {
                emittedRole = true;
                controller.enqueue(encoder.encode(sseChunk({
                  id: responseId, object: "chat.completion.chunk", created, model: clientModel,
                  choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
                })));
              }
            };
            const finishStream = () => {
              if (finished) return;
              finished = true;
              ensureRole();
              controller.enqueue(encoder.encode(sseChunk({
                id: responseId, object: "chat.completion.chunk", created, model: clientModel,
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
              })));
              controller.enqueue(encoder.encode(SSE_DONE));
              controller.close();
              deleteSession(accessToken, sessionId).catch(() => {});
            };

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                streamBuffer += decoder.decode(value, { stream: true });
                const lines = streamBuffer.split("\n");
                streamBuffer = lines.pop() || "";

                for (const line of lines) {
                  const data = processLine(line);
                  if (!data) continue;
                  if (data === "[DONE]") { finishStream(); return; }

                  const { text, thinking, isFinished } = extractContent(data, thinkingModel);
                  if (thinking) {
                    ensureRole();
                    controller.enqueue(encoder.encode(sseChunk({
                      id: responseId, object: "chat.completion.chunk", created, model: clientModel,
                      choices: [{ index: 0, delta: { reasoning_content: thinking }, finish_reason: null }],
                    })));
                  }
                  if (text) {
                    ensureRole();
                    controller.enqueue(encoder.encode(sseChunk({
                      id: responseId, object: "chat.completion.chunk", created, model: clientModel,
                      choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
                    })));
                  }
                  if (isFinished) {
                    setTimeout(finishStream, 750);
                  }
                }
              }
              finishStream();
            } catch (err) {
              if (!finished) {
                try { controller.error(err); } catch {}
                deleteSession(accessToken, sessionId).catch(() => {});
              }
            }
          },
          cancel() {
            deleteSession(accessToken, sessionId).catch(() => {});
          },
        });

        return {
          response: new Response(openaiStream, { status: 200, headers: SSE_HEADERS_NO_BUFFER }),
          url: COMPLETION_URL, headers: reqHeaders, transformedBody: requestPayload,
        };
      }

      // Non-streaming
      const rawText = await resp.text();
      let fullText = "";
      let fullThinking = "";
      const lines = rawText.split("\n");
      for (const line of lines) {
        const data = processLine(line);
        if (!data) continue;
        const { text, thinking } = extractContent(data, thinkingModel);
        fullText += text;
        fullThinking += thinking;
      }
      await deleteSession(accessToken, sessionId);

      const responseMsg = { role: "assistant", content: fullText || "" };
      if (fullThinking) responseMsg.reasoning_content = fullThinking;
      const jsonResp = new Response(JSON.stringify({
        id: responseId, object: "chat.completion", created, model: clientModel,
        choices: [{ index: 0, message: responseMsg, finish_reason: "stop" }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
      return { response: jsonResp, url: COMPLETION_URL, headers: reqHeaders, transformedBody: requestPayload };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log?.error?.("DEEPSEEK-WEB", `Execute failed: ${msg}`);
      if (err instanceof Error && err.name === "AbortError") {
        const errResp = new Response(JSON.stringify({ error: { message: "Request cancelled", type: "api_error" } }), { status: 499, headers: { "Content-Type": "application/json" } });
        return { response: errResp, url: COMPLETION_URL, headers: {}, transformedBody: body };
      }
      const errResp = new Response(JSON.stringify({ error: { message: `DeepSeek error: ${msg}`, type: "upstream_error" } }), { status: 502, headers: { "Content-Type": "application/json" } });
      return { response: errResp, url: COMPLETION_URL, headers: {}, transformedBody: body };
    }
  }
}
