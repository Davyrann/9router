import { describe, it, expect } from "vitest";
import {
  BACKUP_FORMAT_VERSION,
  normalizeBackupPayload,
  redactSettings,
  mergeSettingsForImport,
  NON_PORTABLE_SECRET_KEYS,
} from "../../src/lib/db/backupCompat.js";

describe("backup format backward compatibility", () => {
  it("accepts a legacy v1 payload (no formatVersion, no usage)", () => {
    const out = normalizeBackupPayload({
      settings: { rtkEnabled: true },
      providerConnections: [{ id: "c1", provider: "kiro" }],
      apiKeys: [{ id: "k1", key: "sk_9router" }],
    });
    expect(out.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(out.settings).toEqual({ rtkEnabled: true });
    expect(out.providerConnections).toHaveLength(1);
    expect(out.usage.daily).toEqual({});
    expect(out.usage.totalRequestsLifetime).toBeNull();
    expect(out.modelAliases).toEqual({});
    expect(out.customModels).toEqual([]);
  });

  it("drops unknown top-level fields (whitelist)", () => {
    const out = normalizeBackupPayload({ formatVersion: 2, evil: "x", settings: {} });
    expect(out.evil).toBeUndefined();
  });

  it("ignores a JSON __proto__ key instead of polluting a prototype", () => {
    // Real attack shape: __proto__ as an own property (object literals set the
    // prototype instead, so JSON.parse is the honest reproduction).
    const payload = JSON.parse('{"formatVersion":2,"__proto__":{"polluted":true}}');
    const out = normalizeBackupPayload(payload);
    expect(out.polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
  });

  it("drops dangerous keys from map fields and usage.daily", () => {
    const out = normalizeBackupPayload({
      formatVersion: 2,
      modelAliases: JSON.parse('{"__proto__":{"x":1},"ok":{"m":"gpt"}}'),
      usage: { daily: JSON.parse('{"__proto__":{"requests":9},"2026-01-01":{"requests":1}}') },
    });
    expect(Object.keys(out.modelAliases)).toEqual(["ok"]);
    expect(Object.keys(out.usage.daily)).toEqual(["2026-01-01"]);
    expect({}.x).toBeUndefined();
  });

  it("normalizes v2 usage.daily + lifetime", () => {
    const out = normalizeBackupPayload({
      formatVersion: 2,
      usage: { daily: { "2026-01-01": { requests: 2, promptTokens: 10 } }, totalRequestsLifetime: 5 },
    });
    expect(out.usage.daily["2026-01-01"]).toEqual({ requests: 2, promptTokens: 10 });
    expect(out.usage.totalRequestsLifetime).toBe(5);
  });

  it("accepts a legacy usageDaily array shape", () => {
    const out = normalizeBackupPayload({ usageDaily: [{ dateKey: "2026-01-02", data: { requests: 1 } }] });
    expect(out.usage.daily["2026-01-02"]).toEqual({ requests: 1 });
  });

  it("coerces wrong-typed entity fields to safe defaults and rejects nested arrays", () => {
    const out = normalizeBackupPayload({
      providerConnections: "not-an-array",
      modelAliases: [1, 2, 3],
      combos: [null, { id: "x" }, "junk", [1, 2]],
    });
    expect(out.providerConnections).toEqual([]);
    expect(out.modelAliases).toEqual({});
    expect(out.combos).toEqual([{ id: "x" }]);
  });

  it("rejects a backup newer than this build", () => {
    expect(() => normalizeBackupPayload({ formatVersion: 99 })).toThrow(/newer/i);
  });

  it("rejects invalid payloads", () => {
    expect(() => normalizeBackupPayload(null)).toThrow();
    expect(() => normalizeBackupPayload([])).toThrow();
    expect(() => normalizeBackupPayload("x")).toThrow();
    expect(() => normalizeBackupPayload({ formatVersion: 0 })).toThrow();
  });
});

describe("non-portable secret policy", () => {
  it("redactSettings removes every non-portable secret and keeps the rest", () => {
    const settings = {
      rtkEnabled: true,
      outboundProxyUrl: "http://h:8080",
      password: "$2b$10$hash",
      oidcClientSecret: "shh",
      telegramBackupBotToken: "123:abc",
      mitmSudoEncrypted: "AES...",
    };
    const out = redactSettings(settings);
    for (const key of NON_PORTABLE_SECRET_KEYS) expect(out[key]).toBeUndefined();
    expect(out.rtkEnabled).toBe(true);
    expect(out.outboundProxyUrl).toBe("http://h:8080");
    // input untouched
    expect(settings.password).toBe("$2b$10$hash");
  });

  it("mergeSettingsForImport keeps local secrets when the payload omits them", () => {
    const current = { password: "local-hash", oidcClientSecret: "local-oidc", rtkEnabled: false };
    const incoming = { rtkEnabled: true, cloudEnabled: true }; // redacted backup
    const out = mergeSettingsForImport(current, incoming);
    expect(out.password).toBe("local-hash");
    expect(out.oidcClientSecret).toBe("local-oidc");
    expect(out.rtkEnabled).toBe(true);
    expect(out.cloudEnabled).toBe(true);
  });

  it("mergeSettingsForImport lets a payload that carries a secret win", () => {
    const out = mergeSettingsForImport({ password: "local" }, { password: "from-backup" });
    expect(out.password).toBe("from-backup");
  });

  it("mergeSettingsForImport tolerates a missing/empty current settings row", () => {
    expect(mergeSettingsForImport(null, { a: 1 })).toEqual({ a: 1 });
    expect(mergeSettingsForImport({}, null)).toEqual({});
  });
});
