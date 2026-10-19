// Public API barrel — all DB functions
import { getAdapter } from "./driver.js";
import { stringifyJson, parseJson } from "./helpers/jsonCol.js";
import { keyAccessFromColumns, keyAccessToColumns, validateKeyAccessInput } from "@/shared/utils/keyAccess.js";
import { KEY_ACCESS_UNRESTRICTED } from "@/shared/constants/keyAccess.js";
import { BACKUP_FORMAT_VERSION, normalizeBackupPayload, mergeSettingsForImport } from "./backupCompat.js";
import { SCHEMA_VERSION } from "./schema.js";
import { getAppVersion } from "./version.js";

// Settings
export {
  getSettings, updateSettings, isCloudEnabled, getCloudUrl, exportSettings,
} from "./repos/settingsRepo.js";

// Provider connections
export {
  getProviderConnections, getProviderConnectionById,
  createProviderConnection, updateProviderConnection,
  deleteProviderConnection, deleteProviderConnectionsByProvider,
  reorderProviderConnections, cleanupProviderConnections,
} from "./repos/connectionsRepo.js";

// Provider nodes
export {
  getProviderNodes, getProviderNodeById,
  createProviderNode, updateProviderNode, deleteProviderNode,
} from "./repos/nodesRepo.js";

// Proxy pools
export {
  getProxyPools, getProxyPoolById,
  createProxyPool, updateProxyPool, deleteProxyPool,
} from "./repos/proxyPoolsRepo.js";

// API keys
export {
  getApiKeys, getApiKeyById, getApiKeyByKey, createApiKey, updateApiKey, deleteApiKey, validateApiKey,
  getApiKeyUsageSummary, bumpKeyQuota, checkKeyQuota, resetKeyQuota,
} from "./repos/apiKeysRepo.js";

// Combos
export {
  getCombos, getComboById, getComboByName,
  createCombo, updateCombo, deleteCombo,
} from "./repos/combosRepo.js";

// Aliases (model + custom + mitm)
export {
  getModelAliases, setModelAlias, deleteModelAlias,
  getCustomModels, addCustomModel, deleteCustomModel,
  getMitmAlias, setMitmAliasAll,
} from "./repos/aliasRepo.js";

// Pricing
export {
  getPricing, getPricingForModel, updatePricing, resetPricing, resetAllPricing,
} from "./repos/pricingRepo.js";

// Disabled models
export {
  getDisabledModels, getDisabledByProvider, disableModels, enableModels,
} from "./repos/disabledModelsRepo.js";

// Usage
export {
  statsEmitter, trackPendingRequest, getActiveRequests,
  saveRequestUsage, getUsageHistory, getUsageStats, getChartData,
  appendRequestLog, getRecentLogs,
} from "./repos/usageRepo.js";

// Request details
export {
  saveRequestDetail, getRequestDetails, getRequestDetailById, getDistinctProviders,
} from "./repos/requestDetailsRepo.js";

// Export/import full DB
export async function exportDb() {
  const db = await getAdapter();
  const { exportSettings } = await import("./repos/settingsRepo.js");

  const out = {
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: getAppVersion(),
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: await exportSettings(),
    providerConnections: db.all(`SELECT * FROM providerConnections`).map((r) => ({ ...parseJson(r.data, {}), id: r.id, provider: r.provider, authType: r.authType, name: r.name, email: r.email, priority: r.priority, isActive: r.isActive === 1, createdAt: r.createdAt, updatedAt: r.updatedAt })),
    providerNodes: db.all(`SELECT * FROM providerNodes`).map((r) => ({ ...parseJson(r.data, {}), id: r.id, type: r.type, name: r.name, createdAt: r.createdAt, updatedAt: r.updatedAt })),
    proxyPools: db.all(`SELECT * FROM proxyPools`).map((r) => ({ ...parseJson(r.data, {}), id: r.id, isActive: r.isActive === 1, testStatus: r.testStatus, createdAt: r.createdAt, updatedAt: r.updatedAt })),
    apiKeys: db.all(`SELECT * FROM apiKeys`).map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      machineId: r.machineId,
      isActive: r.isActive === 1,
      createdAt: r.createdAt,
      access: keyAccessFromColumns(r.accessRestricted, r.accessAllow),
      expiresAt: r.expiresAt || null,
      quotaLimit: r.quotaLimit != null ? r.quotaLimit : null,
      quotaWindow: r.quotaWindow || null,
      quotaUsed: r.quotaUsed || 0,
      quotaResetAt: r.quotaResetAt || null,
      quotaTokenLimit: r.quotaTokenLimit != null ? r.quotaTokenLimit : null,
      quotaTokensUsed: r.quotaTokensUsed || 0,
    })),
    combos: db.all(`SELECT * FROM combos`).map((r) => ({ id: r.id, name: r.name, kind: r.kind, models: parseJson(r.models, []), createdAt: r.createdAt, updatedAt: r.updatedAt })),
    modelAliases: {},
    customModels: [],
    mitmAlias: {},
    pricing: {},
    usage: {
      daily: {},
      totalRequestsLifetime: null,
      history: db.all(`SELECT * FROM usageHistory`),
    },
  };

  for (const r of db.all(`SELECT key, value FROM kv WHERE scope = 'modelAliases'`)) out.modelAliases[r.key] = parseJson(r.value);
  for (const r of db.all(`SELECT key, value FROM kv WHERE scope = 'customModels'`)) out.customModels.push(parseJson(r.value));
  for (const r of db.all(`SELECT key, value FROM kv WHERE scope = 'mitmAlias'`)) out.mitmAlias[r.key] = parseJson(r.value);
  for (const r of db.all(`SELECT key, value FROM kv WHERE scope = 'pricing'`)) out.pricing[r.key] = parseJson(r.value);
  for (const r of db.all(`SELECT dateKey, data FROM usageDaily`)) out.usage.daily[r.dateKey] = parseJson(r.data, {});
  const lifetime = db.get(`SELECT value FROM _meta WHERE key = 'totalRequestsLifetime'`);
  out.usage.totalRequestsLifetime = lifetime ? parseInt(lifetime.value, 10) || 0 : 0;

  return out;
}

export async function importDb(payload) {
  // Normalize + version-check FIRST (throws on a newer/invalid format) so a bad
  // file is rejected before we wipe anything.
  const data = normalizeBackupPayload(payload);
  const db = await getAdapter();

  db.transaction(() => {
    // Non-portable secrets are never in a backup, so preserve THIS instance's
    // values when the payload omits them (see mergeSettingsForImport).
    const currentRow = db.get(`SELECT data FROM settings WHERE id = 1`);
    const currentSettings = currentRow ? parseJson(currentRow.data, {}) : {};

    // Wipe all tables (keep _meta)
    db.run(`DELETE FROM settings`);
    db.run(`DELETE FROM providerConnections`);
    db.run(`DELETE FROM providerNodes`);
    db.run(`DELETE FROM proxyPools`);
    db.run(`DELETE FROM apiKeys`);
    db.run(`DELETE FROM combos`);
    db.run(`DELETE FROM kv WHERE scope IN ('modelAliases', 'customModels', 'mitmAlias', 'pricing')`);

    // Settings
    if (data.settings || Object.keys(currentSettings).length) {
      const nextSettings = mergeSettingsForImport(currentSettings, data.settings);
      db.run(`INSERT INTO settings(id, data) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`, [stringifyJson(nextSettings)]);
    }

    for (const c of data.providerConnections) {
      const { id, provider, authType, name, email, priority, isActive, createdAt, updatedAt, ...rest } = c;
      db.run(
        `INSERT OR REPLACE INTO providerConnections(id, provider, authType, name, email, priority, isActive, data, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, provider, authType || "oauth", name || null, email || null, priority || null, isActive === false ? 0 : 1, stringifyJson(rest), createdAt || new Date().toISOString(), updatedAt || new Date().toISOString()]
      );
    }
    for (const n of data.providerNodes) {
      const { id, type, name, createdAt, updatedAt, ...rest } = n;
      db.run(
        `INSERT OR REPLACE INTO providerNodes(id, type, name, data, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
        [id, type || null, name || null, stringifyJson(rest), createdAt || new Date().toISOString(), updatedAt || new Date().toISOString()]
      );
    }
    for (const p of data.proxyPools) {
      const { id, isActive, testStatus, createdAt, updatedAt, ...rest } = p;
      db.run(
        `INSERT OR REPLACE INTO proxyPools(id, isActive, testStatus, data, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
        [id, isActive === false ? 0 : 1, testStatus || "unknown", stringifyJson(rest), createdAt || new Date().toISOString(), updatedAt || new Date().toISOString()]
      );
    }
    for (const k of data.apiKeys) {
      // Per-key access: a backup without `access` (older version) restores
      // unrestricted, exactly as before; a malformed `access` is refused.
      let access = KEY_ACCESS_UNRESTRICTED;
      if (k.access !== undefined) {
        const checked = validateKeyAccessInput(k.access);
        if (!checked.ok) throw new Error(`apiKeys ${k.id}: ${checked.error}`);
        access = checked.value;
      }
      const cols = keyAccessToColumns(access);
      db.run(
        `INSERT OR REPLACE INTO apiKeys(id, key, name, machineId, isActive, createdAt, accessRestricted, accessAllow, expiresAt, quotaLimit, quotaWindow, quotaUsed, quotaResetAt, quotaTokenLimit, quotaTokensUsed) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [k.id, k.key, k.name || null, k.machineId || null, k.isActive === false ? 0 : 1, k.createdAt || new Date().toISOString(), cols.accessRestricted, cols.accessAllow, k.expiresAt || null, k.quotaLimit != null ? k.quotaLimit : null, k.quotaWindow || null, k.quotaUsed || 0, k.quotaResetAt || null, k.quotaTokenLimit != null ? k.quotaTokenLimit : null, k.quotaTokensUsed || 0]
      );
    }
    for (const c of data.combos) {
      db.run(
        `INSERT OR REPLACE INTO combos(id, name, kind, models, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
        [c.id, c.name, c.kind || null, stringifyJson(c.models || []), c.createdAt || new Date().toISOString(), c.updatedAt || new Date().toISOString()]
      );
    }
    for (const [a, m] of Object.entries(data.modelAliases)) {
      db.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES('modelAliases', ?, ?)`, [a, stringifyJson(m)]);
    }
    for (const m of data.customModels) {
      const k = `${m.providerAlias}|${m.id}|${m.type || "llm"}`;
      db.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES('customModels', ?, ?)`, [k, stringifyJson(m)]);
    }
    for (const [tool, mappings] of Object.entries(data.mitmAlias)) {
      db.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES('mitmAlias', ?, ?)`, [tool, stringifyJson(mappings || {})]);
    }
    for (const [provider, models] of Object.entries(data.pricing)) {
      db.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES('pricing', ?, ?)`, [provider, stringifyJson(models || {})]);
    }

    // Usage aggregates and logs. A backup without any usage (v1) leaves this instance's
    // rollups untouched — wiping them would silently destroy local history that
    // the file cannot restore. With usage present, daily rows, history, and lifetime
    // counter are replaced so they stay consistent with each other.
    if (data.usage.totalRequestsLifetime != null || Object.keys(data.usage.daily).length || data.usage.history?.length) {
      db.run(`DELETE FROM usageDaily`);
      for (const [dateKey, day] of Object.entries(data.usage.daily)) {
        db.run(`INSERT OR REPLACE INTO usageDaily(dateKey, data) VALUES(?, ?)`, [dateKey, stringifyJson(day || {})]);
      }
      db.run(`INSERT INTO _meta(key, value) VALUES('totalRequestsLifetime', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(data.usage.totalRequestsLifetime ?? 0)]);
      if (data.usage.history && Array.isArray(data.usage.history) && data.usage.history.length > 0) {
        db.run(`DELETE FROM usageHistory`);
        for (const h of data.usage.history) {
          db.run(
            `INSERT OR REPLACE INTO usageHistory(id, timestamp, provider, model, connectionId, apiKey, endpoint, promptTokens, completionTokens, cost, status, tokens, meta) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [h.id ?? null, h.timestamp || new Date().toISOString(), h.provider || null, h.model || null, h.connectionId || null, h.apiKey || null, h.endpoint || null, h.promptTokens || 0, h.completionTokens || 0, h.cost || 0, h.status || null, typeof h.tokens === "object" ? stringifyJson(h.tokens) : (h.tokens || null), typeof h.meta === "object" ? stringifyJson(h.meta) : (h.meta || null)]
          );
        }
      }
    }
  });

  // Re-export is informational only; a failure here must not report the import
  // (already committed above) as failed.
  try { return await exportDb(); } catch { return null; }
}

// Eager init helper (optional)
export async function initDb() {
  await getAdapter();
}
